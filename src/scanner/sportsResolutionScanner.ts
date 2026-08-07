import { executeOrPaper } from "../execution/executeOrPaper.js";
import {
  recordSportsResolutionWatch,
  upsertSportsSlugMapping,
  listRecentSportsTicks,
  type SportsSlugMappingInput,
} from "../execution/sportsJournal.js";
import {
  recordOpportunity,
  updateOpportunityStatus,
} from "../execution/opportunityJournal.js";
import {
  buildPaperFireDedupeKey,
  getRecentPaperFire,
  recordPaperDedupeSkip,
  recordPaperFire,
} from "../execution/paperDedupe.js";
import {
  fetchActiveEvents,
  normalizeGammaMarket,
  type GammaRawEvent,
} from "../utils/gamma.js";
import {
  fetchOrderBook,
  getBestBidAsk,
  walkAsksForShares,
  type OrderBook,
} from "../utils/orderbook.js";
import type { NormalizedSportsTick } from "../utils/polymarketSports.js";

export const SPORTS_RESOLUTION_SNIPE_STRATEGY = "sports_resolution_snipe";
export const SPORTS_RESOLUTION_WATCH_REASON =
  "sports_resolution_watch_unverified";
export const DEFAULT_SPORTS_SNIPE_MAX_ASK = 0.98;
export const DEFAULT_SPORTS_SNIPE_MIN_EDGE = 0.01;
export const DEFAULT_SPORTS_PAPER_FIRE_COOLDOWN_MS = 21_600_000;

export type SportsMappingStatus =
  | "mapped"
  | "no_matching_gamma_market"
  | "unverified_outcome_alignment"
  | "missing_team_names"
  | "missing_token_ids";

export type SportsResolutionCandidate = {
  sportsSlug: string;
  marketSlug: string;
  eventSlug: string;
  question: string;
  sport: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  winningSide: "home" | "away";
  winningTeam: string;
  winningOutcomeIndex: number;
  winningTokenId: string;
  losingTokenId: string;
  marketPrice: number | null;
  expectedEdge: number | null;
  finishedTimestamp: number | null;
  reason: typeof SPORTS_RESOLUTION_WATCH_REASON;
};

export type SportsResolutionAnalysis = {
  candidates: SportsResolutionCandidate[];
  mappings: SportsSlugMappingInput[];
};

export type SportsResolutionCycleResult = {
  candidates: number;
  mappings: number;
  paperTrades: number;
  rejected: number;
  watches: number;
};

export type SportsResolutionCandidateResult = {
  opportunityId: string | null;
  paperTrades: number;
  reason: string;
  status: "watch_only" | "rejected" | "paper_fired" | "dedupe_skip";
};

export function analyzeSportsResolutionTicks(
  ticks: NormalizedSportsTick[],
  events: GammaRawEvent[],
): SportsResolutionAnalysis {
  const mappings: SportsSlugMappingInput[] = [];
  const candidates: SportsResolutionCandidate[] = [];

  for (const tick of ticks) {
    const tickMappings = mapSportsTickToGammaMarkets(tick, events);

    mappings.push(...tickMappings);

    if (!isFinalTickWithWinner(tick)) {
      continue;
    }

    const winner = getWinner(tick);

    if (!winner) {
      continue;
    }

    for (const mapping of tickMappings) {
      if (
        mapping.mappingStatus !== "mapped" ||
        mapping.awayOutcomeIndex === null ||
        mapping.awayOutcomeIndex === undefined ||
        mapping.homeOutcomeIndex === null ||
        mapping.homeOutcomeIndex === undefined ||
        !mapping.awayTokenId ||
        !mapping.homeTokenId ||
        !mapping.marketSlug ||
        !mapping.eventSlug ||
        !tick.homeTeam ||
        !tick.awayTeam ||
        tick.homeScore === null ||
        tick.awayScore === null
      ) {
        continue;
      }

      const winningTokenId =
        winner === "home" ? mapping.homeTokenId : mapping.awayTokenId;
      const losingTokenId =
        winner === "home" ? mapping.awayTokenId : mapping.homeTokenId;
      const winningOutcomeIndex =
        winner === "home" ? mapping.homeOutcomeIndex : mapping.awayOutcomeIndex;
      const marketPrice = getMappedOutcomePrice(events, mapping, winningOutcomeIndex);

      candidates.push({
        sportsSlug: tick.slug,
        marketSlug: mapping.marketSlug,
        eventSlug: mapping.eventSlug,
        question: `${tick.awayTeam} at ${tick.homeTeam}`,
        sport: tick.sport,
        homeTeam: tick.homeTeam,
        awayTeam: tick.awayTeam,
        homeScore: tick.homeScore,
        awayScore: tick.awayScore,
        winningSide: winner,
        winningTeam: winner === "home" ? tick.homeTeam : tick.awayTeam,
        winningOutcomeIndex,
        winningTokenId,
        losingTokenId,
        marketPrice,
        expectedEdge: marketPrice === null ? null : roundPrice(1 - marketPrice),
        finishedTimestamp: tick.finishedTimestamp,
        reason: SPORTS_RESOLUTION_WATCH_REASON,
      });
    }
  }

  return { candidates, mappings };
}

export function mapSportsTickToGammaMarkets(
  tick: NormalizedSportsTick,
  events: GammaRawEvent[],
): SportsSlugMappingInput[] {
  const matches: SportsSlugMappingInput[] = [];

  for (const event of events) {
    const eventSlug = optionalString(event.slug);
    const rawMarkets = Array.isArray(event.markets) ? event.markets : [];

    for (const rawMarket of rawMarkets) {
      const market = normalizeGammaMarket(rawMarket);

      const slugMatched = slugMatches(tick.slug, eventSlug, market.slug);
      const binaryTeamMatched =
        !slugMatched && binaryTeamMarketMatches(tick, market);

      if (!slugMatched && !binaryTeamMatched) {
        continue;
      }

      const base = {
        sportsSlug: tick.slug,
        marketSlug: market.slug || eventSlug || null,
        eventSlug: eventSlug || null,
        sport: tick.sport,
        homeTeam: tick.homeTeam,
        awayTeam: tick.awayTeam,
      };

      if (!tick.homeTeam || !tick.awayTeam) {
        matches.push({
          ...base,
          mappingStatus: "missing_team_names",
          reason: "Sports tick is missing home or away team.",
        });
        continue;
      }

      const awayOutcomeIndex = findOutcomeIndex(market.outcomes, tick.awayTeam);
      const homeOutcomeIndex = findOutcomeIndex(market.outcomes, tick.homeTeam);

      if (awayOutcomeIndex === -1 || homeOutcomeIndex === -1) {
        matches.push({
          ...base,
          mappingStatus: "unverified_outcome_alignment",
          reason: "Could not match sports teams to Gamma outcomes by name.",
        });
        continue;
      }

      const awayTokenId = market.clobTokenIds[awayOutcomeIndex];
      const homeTokenId = market.clobTokenIds[homeOutcomeIndex];

      if (!awayTokenId || !homeTokenId) {
        matches.push({
          ...base,
          awayOutcomeIndex,
          homeOutcomeIndex,
          mappingStatus: "missing_token_ids",
          reason: "Mapped outcomes but missing token ids.",
        });
        continue;
      }

      matches.push({
        ...base,
        awayOutcomeIndex,
        homeOutcomeIndex,
        awayTokenId,
        homeTokenId,
        mappingStatus: "mapped",
        reason: "sports_slug_and_outcomes_mapped",
      });
    }
  }

  if (matches.length === 0) {
    return [
      {
        sportsSlug: tick.slug,
        sport: tick.sport,
        homeTeam: tick.homeTeam,
        awayTeam: tick.awayTeam,
        mappingStatus: "no_matching_gamma_market",
        reason: "No active Gamma event or market matched the sports slug.",
      },
    ];
  }

  return matches;
}

export async function runSportsResolutionCycle(
  options: {
    events?: GammaRawEvent[];
    execute?: typeof executeOrPaper;
    fetchBook?: (tokenId: string) => Promise<OrderBook>;
    gammaLimit?: number;
    maxAsk?: number;
    minEdge?: number;
    nowMs?: number;
    paperFireCooldownMs?: number;
    paperFireEnabled?: boolean;
    paperShares?: number;
    referenceTicks?: NormalizedSportsTick[];
    ticks?: NormalizedSportsTick[];
    tickLimit?: number;
  } = {},
): Promise<SportsResolutionCycleResult> {
  const nowMs = options.nowMs ?? Date.now();
  const ticks =
    options.ticks ??
    listRecentSportsTicks(options.tickLimit ?? 200).map((tick) => ({
      sport: tick.sport,
      league: tick.league,
      gameId: tick.gameId,
      slug: tick.slug,
      homeTeam: tick.homeTeam,
      awayTeam: tick.awayTeam,
      homeScore: tick.homeScore,
      awayScore: tick.awayScore,
      status: tick.status,
      ended: tick.ended,
      finishedTimestamp: tick.finishedTimestamp,
      raw: safeParseJson(tick.rawJson),
    }));
  const events = options.events ?? (await fetchActiveEvents(options.gammaLimit ?? 200));
  const analysis = analyzeSportsResolutionTicks(ticks, events);
  let paperTrades = 0;
  let rejected = 0;
  let watches = 0;

  for (const mapping of analysis.mappings) {
    upsertSportsSlugMapping({
      ...mapping,
      updatedAt: nowMs,
    });
  }

  for (const candidate of analysis.candidates) {
    const result = await processSportsResolutionCandidate(candidate, {
      execute: options.execute,
      fetchBook: options.fetchBook,
      maxAsk: options.maxAsk,
      minEdge: options.minEdge,
      nowMs,
      paperFireCooldownMs: options.paperFireCooldownMs,
      paperFireEnabled: options.paperFireEnabled,
      paperShares: options.paperShares,
      referenceTicks: options.referenceTicks,
    });

    paperTrades += result.paperTrades;
    rejected += result.status === "rejected" ? 1 : 0;
    watches += 1;
  }

  return {
    candidates: analysis.candidates.length,
    mappings: analysis.mappings.length,
    paperTrades,
    rejected,
    watches,
  };
}

export async function processSportsResolutionCandidate(
  candidate: SportsResolutionCandidate,
  options: {
    execute?: typeof executeOrPaper;
    fetchBook?: (tokenId: string) => Promise<OrderBook>;
    maxAsk?: number;
    minEdge?: number;
    nowMs?: number;
    paperFireCooldownMs?: number;
    paperFireEnabled?: boolean;
    paperShares?: number;
    referenceTicks?: NormalizedSportsTick[];
  } = {},
): Promise<SportsResolutionCandidateResult> {
  const nowMs = options.nowMs ?? Date.now();
  const paperFireEnabled = options.paperFireEnabled ?? false;

  if (!paperFireEnabled) {
    recordSportsResolutionWatch(buildWatchInput(candidate, {
      reason: SPORTS_RESOLUTION_WATCH_REASON,
      status: "watch_only",
      timestamp: nowMs,
    }));

    return {
      opportunityId: null,
      paperTrades: 0,
      reason: SPORTS_RESOLUTION_WATCH_REASON,
      status: "watch_only",
    };
  }

  const dedupeKey = buildPaperFireDedupeKey({
    strategy: SPORTS_RESOLUTION_SNIPE_STRATEGY,
    eventSlug: candidate.sportsSlug,
    threshold: options.maxAsk ?? DEFAULT_SPORTS_SNIPE_MAX_ASK,
    tokenIds: [candidate.winningTokenId],
  });
  const recentFire = getRecentPaperFire(
    dedupeKey,
    nowMs,
    options.paperFireCooldownMs ?? DEFAULT_SPORTS_PAPER_FIRE_COOLDOWN_MS,
  );

  if (recentFire) {
    recordPaperDedupeSkip({
      dedupeKey,
      strategy: SPORTS_RESOLUTION_SNIPE_STRATEGY,
      slug: candidate.sportsSlug,
      threshold: options.maxAsk ?? DEFAULT_SPORTS_SNIPE_MAX_ASK,
      tokenIds: [candidate.winningTokenId],
      previousFireAt: recentFire.fired_at,
      skippedAt: nowMs,
      cooldownMs: options.paperFireCooldownMs ?? DEFAULT_SPORTS_PAPER_FIRE_COOLDOWN_MS,
    });
    recordSportsResolutionWatch(buildWatchInput(candidate, {
      reason: "duplicate_within_cooldown",
      status: "dedupe_skip",
      timestamp: nowMs,
    }));

    return {
      opportunityId: null,
      paperTrades: 0,
      reason: "duplicate_within_cooldown",
      status: "dedupe_skip",
    };
  }

  const opportunity = recordOpportunity({
    strategy: SPORTS_RESOLUTION_SNIPE_STRATEGY,
    slug: candidate.marketSlug,
    rawEdge: candidate.expectedEdge,
    status: "raw_found",
    reason: candidate.reason,
    tokenIds: [candidate.winningTokenId],
    timestamp: nowMs,
    expectedResolutionAt: candidate.finishedTimestamp ?? nowMs,
    durationHours: 0,
    capitalLockClass: "short",
  });
  const reference = findReferenceTick(candidate, options.referenceTicks ?? []);

  if (!reference) {
    updateOpportunityStatus(opportunity.id, {
      status: "rejected",
      reason: "missing_secondary_reference",
    });
    recordSportsResolutionWatch(buildWatchInput(candidate, {
      opportunityId: opportunity.id,
      reason: "missing_secondary_reference",
      status: "rejected",
      timestamp: nowMs,
    }));

    return {
      opportunityId: opportunity.id,
      paperTrades: 0,
      reason: "missing_secondary_reference",
      status: "rejected",
    };
  }

  if (!referenceConfirmsCandidate(candidate, reference)) {
    updateOpportunityStatus(opportunity.id, {
      status: "rejected",
      reason: "secondary_reference_mismatch",
    });
    recordSportsResolutionWatch(buildWatchInput(candidate, {
      opportunityId: opportunity.id,
      reason: "secondary_reference_mismatch",
      status: "rejected",
      timestamp: nowMs,
    }));

    return {
      opportunityId: opportunity.id,
      paperTrades: 0,
      reason: "secondary_reference_mismatch",
      status: "rejected",
    };
  }

  const orderbook = await (options.fetchBook ?? fetchOrderBook)(
    candidate.winningTokenId,
  );
  const best = getBestBidAsk(orderbook);
  const paperShares = options.paperShares ?? 1;
  const walk = walkAsksForShares(orderbook, paperShares);
  const entryPrice = walk.averageFillPrice;
  const expectedEdge = entryPrice === null ? null : roundPrice(1 - entryPrice);
  const maxAsk = options.maxAsk ?? DEFAULT_SPORTS_SNIPE_MAX_ASK;
  const minEdge = options.minEdge ?? DEFAULT_SPORTS_SNIPE_MIN_EDGE;

  if (!walk.fillable || entryPrice === null) {
    updateOpportunityStatus(opportunity.id, {
      status: "rejected",
      executableEdge: expectedEdge,
      fillableUsd: walk.costUsd,
      minLegDepthUsd: walk.costUsd,
      legCount: 1,
      reason: "partial_basket_invalid",
    });
    recordSportsResolutionWatch(buildWatchInput(candidate, {
      bestAsk: best.bestAsk,
      expectedEdge,
      opportunityId: opportunity.id,
      reason: "partial_basket_invalid",
      status: "rejected",
      timestamp: nowMs,
    }));

    return {
      opportunityId: opportunity.id,
      paperTrades: 0,
      reason: "partial_basket_invalid",
      status: "rejected",
    };
  }

  if (entryPrice > maxAsk) {
    updateOpportunityStatus(opportunity.id, {
      status: "rejected",
      executableEdge: expectedEdge,
      fillableUsd: walk.costUsd,
      minLegDepthUsd: walk.costUsd,
      legCount: 1,
      reason: "price_too_high",
    });
    recordSportsResolutionWatch(buildWatchInput(candidate, {
      bestAsk: best.bestAsk,
      expectedEdge,
      opportunityId: opportunity.id,
      reason: "price_too_high",
      status: "rejected",
      timestamp: nowMs,
    }));

    return {
      opportunityId: opportunity.id,
      paperTrades: 0,
      reason: "price_too_high",
      status: "rejected",
    };
  }

  if (expectedEdge === null || expectedEdge < minEdge) {
    updateOpportunityStatus(opportunity.id, {
      status: "rejected",
      executableEdge: expectedEdge,
      fillableUsd: walk.costUsd,
      minLegDepthUsd: walk.costUsd,
      legCount: 1,
      reason: "non_positive_executable_edge",
    });
    recordSportsResolutionWatch(buildWatchInput(candidate, {
      bestAsk: best.bestAsk,
      expectedEdge,
      opportunityId: opportunity.id,
      reason: "non_positive_executable_edge",
      status: "rejected",
      timestamp: nowMs,
    }));

    return {
      opportunityId: opportunity.id,
      paperTrades: 0,
      reason: "non_positive_executable_edge",
      status: "rejected",
    };
  }

  updateOpportunityStatus(opportunity.id, {
    status: "validated",
    executableEdge: expectedEdge,
    fillableUsd: walk.costUsd,
    minLegDepthUsd: walk.costUsd,
    legCount: 1,
    executableSum: entryPrice,
    feeAdjustedEdge: expectedEdge,
    reason: "sports_reference_and_orderbook_validated",
  });
  (options.execute ?? executeOrPaper)({
    strategy: SPORTS_RESOLUTION_SNIPE_STRATEGY,
    slug: candidate.marketSlug,
    question: candidate.question,
    tokenId: candidate.winningTokenId,
    opportunityId: opportunity.id,
    side: "YES",
    entryPrice,
    paperSizeUsd: walk.costUsd,
    paperSizeShares: paperShares,
    arbClass: SPORTS_RESOLUTION_SNIPE_STRATEGY,
  });
  recordPaperFire({
    dedupeKey,
    strategy: SPORTS_RESOLUTION_SNIPE_STRATEGY,
    eventSlug: candidate.sportsSlug,
    firedAt: nowMs,
  });
  updateOpportunityStatus(opportunity.id, {
    status: "paper_fired",
    executableEdge: expectedEdge,
    fillableUsd: walk.costUsd,
    minLegDepthUsd: walk.costUsd,
    legCount: 1,
    executableSum: entryPrice,
    feeAdjustedEdge: expectedEdge,
    reason: "paper_trade_recorded",
  });
  recordSportsResolutionWatch(buildWatchInput(candidate, {
    bestAsk: best.bestAsk,
    expectedEdge,
    opportunityId: opportunity.id,
    reason: "paper_trade_recorded",
    status: "paper_fired",
    timestamp: nowMs,
  }));

  return {
    opportunityId: opportunity.id,
    paperTrades: 1,
    reason: "paper_trade_recorded",
    status: "paper_fired",
  };
}

function buildWatchInput(
  candidate: SportsResolutionCandidate,
  values: {
    bestAsk?: number | null;
    expectedEdge?: number | null;
    opportunityId?: string | null;
    reason: string;
    status: string;
    timestamp: number;
  },
) {
  return {
    strategy: SPORTS_RESOLUTION_SNIPE_STRATEGY,
    sportsSlug: candidate.sportsSlug,
    marketSlug: candidate.marketSlug,
    eventSlug: candidate.eventSlug,
    winningSide: candidate.winningSide,
    winningTeam: candidate.winningTeam,
    winningTokenId: candidate.winningTokenId,
    losingTokenId: candidate.losingTokenId,
    homeTeam: candidate.homeTeam,
    awayTeam: candidate.awayTeam,
    finalScore: `${candidate.awayScore}-${candidate.homeScore}`,
    marketPrice: candidate.marketPrice,
    bestAsk: values.bestAsk ?? null,
    expectedEdge: values.expectedEdge ?? candidate.expectedEdge,
    validationStatus: values.status,
    reason: values.reason,
    opportunityId: values.opportunityId ?? null,
    timestamp: values.timestamp,
  };
}

function isFinalTickWithWinner(tick: NormalizedSportsTick): boolean {
  return (
    tick.ended &&
    tick.homeScore !== null &&
    tick.awayScore !== null &&
    tick.homeScore !== tick.awayScore
  );
}

function getWinner(tick: NormalizedSportsTick): "home" | "away" | null {
  if (tick.homeScore === null || tick.awayScore === null) {
    return null;
  }

  if (tick.homeScore > tick.awayScore) {
    return "home";
  }

  if (tick.awayScore > tick.homeScore) {
    return "away";
  }

  return null;
}

function findReferenceTick(
  candidate: SportsResolutionCandidate,
  ticks: NormalizedSportsTick[],
): NormalizedSportsTick | null {
  return ticks.find((tick) => normalizeSlug(tick.slug) === normalizeSlug(candidate.sportsSlug)) ?? null;
}

function referenceConfirmsCandidate(
  candidate: SportsResolutionCandidate,
  tick: NormalizedSportsTick,
): boolean {
  return (
    tick.ended &&
    normalizeTeam(tick.homeTeam) === normalizeTeam(candidate.homeTeam) &&
    normalizeTeam(tick.awayTeam) === normalizeTeam(candidate.awayTeam) &&
    tick.homeScore === candidate.homeScore &&
    tick.awayScore === candidate.awayScore
  );
}

function getMappedOutcomePrice(
  events: GammaRawEvent[],
  mapping: SportsSlugMappingInput,
  outcomeIndex: number,
): number | null {
  for (const event of events) {
    const eventSlug = optionalString(event.slug);
    const rawMarkets = Array.isArray(event.markets) ? event.markets : [];

    for (const rawMarket of rawMarkets) {
      const market = normalizeGammaMarket(rawMarket);

      if (
        mapping.eventSlug === eventSlug &&
        mapping.marketSlug === (market.slug || eventSlug)
      ) {
        const price = Number(market.outcomePrices[outcomeIndex]);

        return Number.isFinite(price) ? price : null;
      }
    }
  }

  return null;
}

function slugMatches(
  sportsSlug: string,
  eventSlug: string,
  marketSlug: string,
): boolean {
  const normalizedSportsSlug = normalizeSlug(sportsSlug);

  return (
    normalizedSportsSlug === normalizeSlug(eventSlug) ||
    normalizedSportsSlug === normalizeSlug(marketSlug)
  );
}

function binaryTeamMarketMatches(
  tick: NormalizedSportsTick,
  market: { clobTokenIds: string[]; outcomes: string[] },
): boolean {
  if (!tick.homeTeam || !tick.awayTeam) {
    return false;
  }

  if (market.outcomes.length !== 2 || market.clobTokenIds.length < 2) {
    return false;
  }

  return (
    findOutcomeIndex(market.outcomes, tick.awayTeam) !== -1 &&
    findOutcomeIndex(market.outcomes, tick.homeTeam) !== -1
  );
}

function findOutcomeIndex(outcomes: string[], team: string): number {
  const teamAliases = expandTeamAliases(team);

  return outcomes.findIndex((outcome) =>
    hasTeamAliasOverlap(expandTeamAliases(outcome), teamAliases),
  );
}

function normalizeSlug(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeTeam(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/gu, "and")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function expandTeamAliases(value: string | null | undefined): Set<string> {
  const normalized = normalizeTeam(value);
  const aliases = new Set<string>();

  if (normalized) {
    aliases.add(normalized);
  }

  for (const alias of TEAM_ALIASES[normalized] ?? []) {
    aliases.add(normalizeTeam(alias));
  }

  return aliases;
}

function hasTeamAliasOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }

  return false;
}

const TEAM_ALIASES: Record<string, string[]> = {
  ari: ["Arizona Diamondbacks", "Diamondbacks"],
  atl: ["Atlanta Braves", "Atlanta Falcons", "Atlanta Hawks", "Braves", "Falcons", "Hawks"],
  bal: ["Baltimore Orioles", "Baltimore Ravens", "Orioles", "Ravens"],
  bos: ["Boston Red Sox", "Boston Celtics", "Boston Bruins", "Red Sox", "Celtics", "Bruins"],
  buf: ["Buffalo Bills", "Buffalo Sabres", "Bills", "Sabres"],
  car: ["Carolina Panthers", "Carolina Hurricanes", "Panthers", "Hurricanes"],
  chc: ["Chicago Cubs", "Cubs"],
  chi: ["Chicago Bears", "Chicago Bulls", "Chicago Blackhawks", "Bears", "Bulls", "Blackhawks"],
  cin: ["Cincinnati Reds", "Cincinnati Bengals", "Reds", "Bengals"],
  cle: ["Cleveland Guardians", "Cleveland Cavaliers", "Cleveland Browns", "Guardians", "Cavaliers", "Browns"],
  col: ["Colorado Rockies", "Colorado Avalanche", "Rockies", "Avalanche"],
  dal: ["Dallas Cowboys", "Dallas Mavericks", "Dallas Stars", "Cowboys", "Mavericks", "Stars"],
  det: ["Detroit Tigers", "Detroit Lions", "Detroit Pistons", "Detroit Red Wings", "Tigers", "Lions", "Pistons", "Red Wings"],
  gb: ["Green Bay Packers", "Packers"],
  hou: ["Houston Astros", "Houston Texans", "Houston Rockets", "Astros", "Texans", "Rockets"],
  ind: ["Indianapolis Colts", "Indiana Pacers", "Colts", "Pacers"],
  kc: ["Kansas City Royals", "Kansas City Chiefs", "Royals", "Chiefs"],
  la: ["Los Angeles Dodgers", "Los Angeles Rams", "Los Angeles Lakers", "Los Angeles Kings", "Dodgers", "Rams", "Lakers", "Kings"],
  lac: ["Los Angeles Chargers", "LA Chargers", "Chargers"],
  lad: ["Los Angeles Dodgers", "LA Dodgers", "Dodgers"],
  lal: ["Los Angeles Lakers", "LA Lakers", "Lakers"],
  lv: ["Las Vegas Raiders", "Vegas Golden Knights", "Raiders", "Golden Knights"],
  mia: ["Miami Marlins", "Miami Dolphins", "Miami Heat", "Marlins", "Dolphins", "Heat"],
  mil: ["Milwaukee Brewers", "Milwaukee Bucks", "Brewers", "Bucks"],
  min: ["Minnesota Twins", "Minnesota Vikings", "Minnesota Timberwolves", "Minnesota Wild", "Twins", "Vikings", "Timberwolves", "Wild"],
  ne: ["New England Patriots", "Patriots"],
  no: ["New Orleans Saints", "New Orleans Pelicans", "Saints", "Pelicans"],
  nyg: ["New York Giants", "Giants"],
  nyj: ["New York Jets", "Jets"],
  nyk: ["New York Knicks", "Knicks"],
  nym: ["New York Mets", "NY Mets", "Mets"],
  nyy: ["New York Yankees", "NY Yankees", "Yankees"],
  oak: ["Oakland Athletics", "Athletics", "A's"],
  okc: ["Oklahoma City Thunder", "Thunder"],
  phi: ["Philadelphia Phillies", "Philadelphia Eagles", "Philadelphia 76ers", "Philadelphia Flyers", "Phillies", "Eagles", "76ers", "Flyers"],
  phx: ["Phoenix Suns", "Arizona Cardinals", "Suns", "Cardinals"],
  pit: ["Pittsburgh Pirates", "Pittsburgh Steelers", "Pittsburgh Penguins", "Pirates", "Steelers", "Penguins"],
  sd: ["San Diego Padres", "Padres"],
  sea: ["Seattle Mariners", "Seattle Seahawks", "Seattle Kraken", "Mariners", "Seahawks", "Kraken"],
  sf: ["San Francisco Giants", "San Francisco 49ers", "Giants", "49ers"],
  stl: ["St. Louis Cardinals", "St Louis Cardinals", "Cardinals", "St. Louis Blues", "Blues"],
  tb: ["Tampa Bay Rays", "Tampa Bay Buccaneers", "Tampa Bay Lightning", "Rays", "Buccaneers", "Lightning"],
  tex: ["Texas Rangers", "Rangers"],
  tor: ["Toronto Blue Jays", "Toronto Raptors", "Toronto Maple Leafs", "Blue Jays", "Raptors", "Maple Leafs"],
  wsh: ["Washington Nationals", "Washington Commanders", "Washington Wizards", "Washington Capitals", "Nationals", "Commanders", "Wizards", "Capitals"],
};

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
