import {
  fetchActiveEvents,
  fetchPublicSearchEvents,
  normalizeGammaMarket,
  type GammaRawEvent,
  type GammaRawMarket,
} from "../utils/gamma.js";
import {
  fetchKalshiMarkets as fetchKalshiMarketsDefault,
  type KalshiMarket,
} from "../utils/kalshi.js";
import {
  deriveExpectedResolutionAt,
  latestKnownResolutionAt,
} from "../utils/marketTime.js";
import {
  buildCrossVenueCanonicalEvent,
  type CanonicalEvent,
  type CanonicalOutcome,
} from "./canonicalPredictionMarket.js";
import type { CrossVenuePair } from "./crossVenueArbScanner.js";

const DEFAULT_MATCH_SCORE = 0.7;
const DEFAULT_MAX_PAIRS = 25;
const DEFAULT_KALSHI_MAX_PAGES = 5;
const MAX_RESOLUTION_TIME_DIFF_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_CLEAR_MATCH_SCORE_GAP = 0.05;

export type PolymarketBinaryMarket = {
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  category?: string;
  expectedResolutionAt?: number | null;
  liquidityDollars?: number | null;
  volume24h?: number | null;
  rulesText?: string;
  resolutionSource?: string;
};

export type CrossVenueMatchedPair = CrossVenuePair & {
  matchScore: number;
  matchReason: string;
  canonicalEvent?: CanonicalEvent;
  canonicalOutcome?: CanonicalOutcome;
};

export type CrossVenueMatchCandidatePreview = {
  kalshiTicker: string;
  kalshiTitle: string;
  kalshiSubtitle: string;
  polymarketSlug: string;
  polymarketQuestion: string;
  yesTokenId: string;
  noTokenId: string;
  outcomeLabel: string;
  category?: string;
  expectedResolutionAt?: number | null;
  kalshiLiquidityDollars?: number | null;
  kalshiVolume24h?: number | null;
  polymarketLiquidityDollars?: number | null;
  polymarketVolume24h?: number | null;
  liquidityDollars?: number | null;
  volume24h?: number | null;
  canonicalEventId?: string;
  canonicalOutcomeId?: string;
  canonicalOutcomeKey?: string;
  matchScore: number;
  matchReason: string;
  status:
    | "candidate"
    | "below_match_threshold"
    | "ambiguous_match"
    | "resolution_time_mismatch"
    | "resolution_terms_mismatch"
    | "compound_kalshi_market"
    | "missing_kalshi_title";
};

export type KalshiCrossVenueEligibility = {
  eligible: boolean;
  reason:
    | "simple_binary_market"
    | "compound_kalshi_market"
    | "missing_kalshi_title";
};

export type CrossVenueResolutionCompatibility = {
  compatible: boolean;
  reason:
    | "compatible"
    | "threshold_mismatch"
    | "year_mismatch"
    | "weak_shared_resolution_terms";
  sharedResolutionTokens: string[];
  kalshiConstraints: string[];
  polymarketConstraints: string[];
};

export type CrossVenueDiscoveryResult = {
  pairs: CrossVenueMatchedPair[];
  kalshiMarketCount: number;
  polymarketMarketCount: number;
  candidatePreview: CrossVenueMatchCandidatePreview[];
};

export type DiscoverCrossVenuePairsOptions = {
  fetchGammaEvents?: (limit: number) => Promise<GammaRawEvent[]>;
  fetchGammaSearchEvents?: (
    query: string,
    limit: number,
  ) => Promise<GammaRawEvent[]>;
  fetchKalshiMarkets?: (options?: {
    limit?: number;
    maxPages?: number;
    seriesTickers?: string[];
    eventTickers?: string[];
    status?: "open";
  }) => Promise<KalshiMarket[]>;
  gammaLimit?: number;
  gammaSearchLimit?: number;
  gammaSearchQueries?: string[];
  kalshiEventTickers?: string[];
  kalshiLimit?: number;
  kalshiMaxPages?: number;
  kalshiSeriesTickers?: string[];
  maxPairs?: number;
  minMatchScore?: number;
};

export async function discoverCrossVenuePairs(
  options: DiscoverCrossVenuePairsOptions = {},
): Promise<CrossVenueMatchedPair[]> {
  return (await discoverCrossVenuePairsWithDiagnostics(options)).pairs;
}

export async function discoverCrossVenuePairsWithDiagnostics(
  options: DiscoverCrossVenuePairsOptions = {},
): Promise<CrossVenueDiscoveryResult> {
  const gammaLimit = options.gammaLimit ?? 200;
  const gammaSearchLimit = options.gammaSearchLimit ?? 20;
  const kalshiLimit = options.kalshiLimit ?? 200;
  const kalshiMaxPages = options.kalshiMaxPages ?? DEFAULT_KALSHI_MAX_PAGES;
  const fetchGammaEvents = options.fetchGammaEvents ?? fetchActiveEvents;
  const fetchGammaSearchEvents =
    options.fetchGammaSearchEvents ?? fetchPublicSearchEvents;
  const fetchKalshiMarkets =
    options.fetchKalshiMarkets ?? fetchKalshiMarketsDefault;
  const gammaSearchQueries = [
    ...new Set(
      (options.gammaSearchQueries ?? [])
        .map((query) => query.trim())
        .filter(Boolean),
    ),
  ];
  const [gammaEvents, kalshiMarkets] = await Promise.all([
    gammaSearchQueries.length > 0
      ? fetchGammaSearchResultEvents(
          gammaSearchQueries,
          gammaSearchLimit,
          fetchGammaSearchEvents,
        )
      : fetchGammaEvents(gammaLimit),
    fetchKalshiMarkets({
      limit: kalshiLimit,
      maxPages: kalshiMaxPages,
      eventTickers: options.kalshiEventTickers,
      seriesTickers: options.kalshiSeriesTickers,
      status: "open",
    }),
  ]);
  const polymarketMarkets = buildPolymarketBinaryMarkets(gammaEvents);

  return {
    pairs: matchCrossVenueMarkets(kalshiMarkets, polymarketMarkets, {
      maxPairs: options.maxPairs,
      minMatchScore: options.minMatchScore,
    }),
    kalshiMarketCount: kalshiMarkets.length,
    polymarketMarketCount: polymarketMarkets.length,
    candidatePreview: rankCrossVenueMatchCandidates(
      kalshiMarkets,
      polymarketMarkets,
      {
        limit: 10,
        minMatchScore: options.minMatchScore,
      },
    ),
  };
}

async function fetchGammaSearchResultEvents(
  queries: string[],
  limit: number,
  fetchGammaSearchEvents: (
    query: string,
    limit: number,
  ) => Promise<GammaRawEvent[]>,
): Promise<GammaRawEvent[]> {
  return uniqueGammaEvents(
    (
      await Promise.all(
        queries.map((query) => fetchGammaSearchEvents(query, limit)),
      )
    ).flat(),
  );
}

function uniqueGammaEvents(events: GammaRawEvent[]): GammaRawEvent[] {
  const seen = new Set<string>();
  const result: GammaRawEvent[] = [];

  for (const event of events) {
    const key = gammaEventKey(event);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(event);
  }

  return result;
}

function gammaEventKey(event: GammaRawEvent): string {
  const id = event.id;
  if (typeof id === "string" || typeof id === "number") {
    return `id:${String(id)}`;
  }

  const slug = event.slug;
  if (typeof slug === "string" && slug) {
    return `slug:${slug}`;
  }

  const ticker = event.ticker;
  if (typeof ticker === "string" && ticker) {
    return `ticker:${ticker}`;
  }

  return JSON.stringify(event).slice(0, 500);
}

export function buildPolymarketBinaryMarkets(
  events: GammaRawEvent[],
): PolymarketBinaryMarket[] {
  const markets: PolymarketBinaryMarket[] = [];

  for (const event of events) {
    const eventResolutionAt = deriveExpectedResolutionAt(event);
    const rawMarkets = Array.isArray(event.markets) ? event.markets : [];

    for (const rawMarket of rawMarkets) {
      try {
        const market = normalizeGammaMarket(rawMarket);
        const tokenIds = extractBinaryTokenIds(market);

        if (!market.slug || !market.question || !tokenIds) {
          continue;
        }

        markets.push({
          slug: market.slug,
          question: market.question,
          yesTokenId: tokenIds.yesTokenId,
          noTokenId: tokenIds.noTokenId,
          category: inferPolymarketCategory(rawMarket, event),
          expectedResolutionAt:
            market.expectedResolutionAt ?? eventResolutionAt ?? null,
          ...(polymarketRulesText(market, rawMarket, event)
            ? { rulesText: polymarketRulesText(market, rawMarket, event) }
            : {}),
          ...(polymarketResolutionSource(market, rawMarket, event)
            ? {
                resolutionSource: polymarketResolutionSource(
                  market,
                  rawMarket,
                  event,
                ),
              }
            : {}),
          liquidityDollars: optionalNumber(
            rawMarket.liquidity ??
              rawMarket.liquidityNum ??
              rawMarket.liquidity_num ??
              event.liquidity ??
              event.liquidityNum,
          ),
          volume24h: optionalNumber(
            rawMarket.volume24hr ??
              rawMarket.volume24h ??
              rawMarket.volume_24h ??
              event.volume24hr ??
              event.volume24h ??
              event.volume_24h,
          ),
        });
      } catch {
        continue;
      }
    }
  }

  return markets;
}

export function matchCrossVenueMarkets(
  kalshiMarkets: KalshiMarket[],
  polymarketMarkets: PolymarketBinaryMarket[],
  options: {
    maxPairs?: number;
    minMatchScore?: number;
  } = {},
): CrossVenueMatchedPair[] {
  const minMatchScore = options.minMatchScore ?? DEFAULT_MATCH_SCORE;
  const maxPairs = options.maxPairs ?? DEFAULT_MAX_PAIRS;
  const candidates: ScoredMatchCandidate[] = [];

  for (const kalshi of kalshiMarkets) {
    const eligibility = classifyKalshiCrossVenueEligibility(kalshi);

    if (!eligibility.eligible || !kalshi.ticker) {
      continue;
    }

    for (const polymarket of polymarketMarkets) {
      const score = scoreMarketMatch(kalshi, polymarket);

      if (score.score < minMatchScore || !hasStrongSharedText(score)) {
        continue;
      }

      const kalshiResolutionAt = kalshiMarketResolutionAt(kalshi);

      if (hasResolutionTimeMismatch(kalshiResolutionAt, polymarket)) {
        continue;
      }

      const resolutionCompatibility = classifyCrossVenueResolutionCompatibility(
        kalshi,
        polymarket,
      );

      if (!resolutionCompatibility.compatible) {
        continue;
      }

      candidates.push({
        kalshi,
        kalshiResolutionAt,
        polymarket,
        score: score.score,
        sharedTokens: score.sharedTokens,
        anchorTokens: score.anchorTokens,
      });
    }
  }

  return selectClearMatchCandidates(candidates, kalshiMarkets)
    .map((candidate) => {
      const title = candidate.kalshi.title || candidate.polymarket.question;
      const outcomeLabel = candidate.kalshi.yesSubTitle || "YES";
      const category = inferCrossVenueCategory(
        candidate.kalshi,
        candidate.polymarket,
      );
      const expectedResolutionAt = latestKnownResolutionAt([
        candidate.kalshiResolutionAt,
        candidate.polymarket.expectedResolutionAt,
      ]);
      const canonical = buildCrossVenueCanonicalEvent({
        kalshi: candidate.kalshi,
        polymarket: candidate.polymarket,
        title,
        outcomeLabel,
        category,
        expectedResolutionAt,
      });

      return {
        id: `${candidate.kalshi.ticker}|${candidate.polymarket.slug}`,
        title,
        outcomeLabel,
        category,
        expectedResolutionAt,
        liquidityDollars: sumNullableNumbers([
          candidate.kalshi.liquidityDollars,
          candidate.polymarket.liquidityDollars,
        ]),
        volume24h: sumNullableNumbers([
          candidate.kalshi.volume24h,
          candidate.polymarket.volume24h,
        ]),
        canonicalEvent: canonical.event,
        canonicalOutcome: canonical.outcome,
        kalshi: {
          ticker: candidate.kalshi.ticker,
          title: [candidate.kalshi.title, candidate.kalshi.subtitle]
            .filter(Boolean)
            .join(" "),
          liquidityDollars: candidate.kalshi.liquidityDollars,
          volume24h: candidate.kalshi.volume24h,
        },
        polymarket: {
          slug: candidate.polymarket.slug,
          question: candidate.polymarket.question,
          yesTokenId: candidate.polymarket.yesTokenId,
          noTokenId: candidate.polymarket.noTokenId,
          liquidityDollars: candidate.polymarket.liquidityDollars,
          volume24h: candidate.polymarket.volume24h,
        },
        matchScore: roundScore(candidate.score),
        matchReason: formatMatchReason(
          candidate.sharedTokens,
          candidate.anchorTokens,
        ),
      };
    })
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore ||
        liquidityForTicker(kalshiMarkets, right.kalshi.ticker) -
          liquidityForTicker(kalshiMarkets, left.kalshi.ticker) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, maxPairs);
}

export function rankCrossVenueMatchCandidates(
  kalshiMarkets: KalshiMarket[],
  polymarketMarkets: PolymarketBinaryMarket[],
  options: {
    limit?: number;
    minMatchScore?: number;
  } = {},
): CrossVenueMatchCandidatePreview[] {
  const minMatchScore = options.minMatchScore ?? DEFAULT_MATCH_SCORE;
  const candidates: CrossVenueMatchCandidatePreview[] = [];

  for (const kalshi of kalshiMarkets) {
    const eligibility = classifyKalshiCrossVenueEligibility(kalshi);

    for (const polymarket of polymarketMarkets) {
      const score = scoreMarketMatch(kalshi, polymarket);

      if (score.sharedTokens.length === 0) {
        continue;
      }

      const kalshiResolutionAt = kalshiMarketResolutionAt(kalshi);
      const resolutionMismatch = hasResolutionTimeMismatch(
        kalshiResolutionAt,
        polymarket,
      );
      const resolutionCompatibility = classifyCrossVenueResolutionCompatibility(
        kalshi,
        polymarket,
      );
      const expectedResolutionAt = latestKnownResolutionAt([
        kalshiResolutionAt,
        polymarket.expectedResolutionAt,
      ]);
      const outcomeLabel = kalshi.yesSubTitle || "YES";
      const category = inferCrossVenueCategory(kalshi, polymarket);
      const canonical = buildCrossVenueCanonicalEvent({
        kalshi,
        polymarket,
        title: kalshi.title || polymarket.question,
        outcomeLabel,
        category,
        expectedResolutionAt,
      });

      candidates.push({
        kalshiTicker: kalshi.ticker,
        kalshiTitle: kalshi.title,
        kalshiSubtitle: kalshi.subtitle,
        polymarketSlug: polymarket.slug,
        polymarketQuestion: polymarket.question,
        yesTokenId: polymarket.yesTokenId,
        noTokenId: polymarket.noTokenId,
        outcomeLabel,
        category,
        expectedResolutionAt,
        kalshiLiquidityDollars: kalshi.liquidityDollars,
        kalshiVolume24h: kalshi.volume24h,
        polymarketLiquidityDollars: polymarket.liquidityDollars,
        polymarketVolume24h: polymarket.volume24h,
        liquidityDollars: sumNullableNumbers([
          kalshi.liquidityDollars,
          polymarket.liquidityDollars,
        ]),
        volume24h: sumNullableNumbers([
          kalshi.volume24h,
          polymarket.volume24h,
        ]),
        canonicalEventId: canonical.event.id,
        canonicalOutcomeId: canonical.outcome.id,
        canonicalOutcomeKey: canonical.outcome.outcomeKey,
        matchScore: roundScore(score.score),
        matchReason: formatMatchReason(
          score.sharedTokens,
          score.anchorTokens,
          resolutionCompatibility,
        ),
        status: classifyCandidateStatus({
          eligibility,
          minMatchScore,
          resolutionMismatch,
          resolutionTermsMismatch: !resolutionCompatibility.compatible,
          score: score.score,
          strongSharedText: hasStrongSharedText(score),
        }),
      });
    }
  }

  return candidates
    .sort(
      (left, right) =>
        candidateStatusPriority(left.status) -
          candidateStatusPriority(right.status) ||
        right.matchScore - left.matchScore ||
        left.kalshiTicker.localeCompare(right.kalshiTicker) ||
        left.polymarketSlug.localeCompare(right.polymarketSlug),
    )
    .slice(0, options.limit ?? 10);
}

export function normalizeTextTokens(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 1)
    .map(normalizeToken)
    .filter((token) => !STOPWORDS.has(token));

  return [...new Set(tokens)];
}

export function classifyKalshiCrossVenueEligibility(
  market: KalshiMarket,
): KalshiCrossVenueEligibility {
  const title = market.title.trim();
  const tickerText = [market.ticker, market.eventTicker].join(" ");

  if (!title) {
    return {
      eligible: false,
      reason: "missing_kalshi_title",
    };
  }

  if (/MULTIGAME|CROSSCATEGORY|PARLAY|COMBO/iu.test(tickerText)) {
    return {
      eligible: false,
      reason: "compound_kalshi_market",
    };
  }

  const commaSegments = title.split(",").map((segment) => segment.trim());
  const yesNoClauseCount = commaSegments.filter((segment) =>
    /^(yes|no)\b/iu.test(segment),
  ).length;

  if (
    commaSegments.length >= 3 ||
    (commaSegments.length >= 2 && yesNoClauseCount >= 2)
  ) {
    return {
      eligible: false,
      reason: "compound_kalshi_market",
    };
  }

  return {
    eligible: true,
    reason: "simple_binary_market",
  };
}

export function classifyCrossVenueResolutionCompatibility(
  kalshi: Pick<
    KalshiMarket,
    | "ticker"
    | "eventTicker"
    | "title"
    | "subtitle"
    | "yesSubTitle"
    | "noSubTitle"
    | "rulesPrimary"
    | "rulesSecondary"
  >,
  polymarket: Pick<
    PolymarketBinaryMarket,
    "slug" | "question" | "rulesText" | "resolutionSource"
  >,
): CrossVenueResolutionCompatibility {
  const kalshiSurface = kalshiResolutionSurfaceText(kalshi);
  const polymarketSurface = polymarketResolutionSurfaceText(polymarket);
  const kalshiFullText = compactText([
    kalshiSurface,
    kalshi.rulesPrimary,
    kalshi.rulesSecondary,
  ]);
  const polymarketFullText = compactText([
    polymarketSurface,
    polymarket.rulesText,
    polymarket.resolutionSource,
  ]);
  const kalshiConstraints = extractResolutionConstraints(kalshiFullText);
  const polymarketConstraints = extractResolutionConstraints(polymarketFullText);
  const constraintMismatchReason = resolutionConstraintMismatchReason(
    kalshiConstraints,
    polymarketConstraints,
  );
  const kalshiResolutionTokens = materialResolutionTokens(kalshiSurface);
  const polymarketResolutionTokens = materialResolutionTokens(polymarketSurface);
  const sharedResolutionTokens = kalshiResolutionTokens.filter((token) =>
    polymarketResolutionTokens.includes(token),
  );

  if (constraintMismatchReason) {
    return {
      compatible: false,
      reason: constraintMismatchReason,
      sharedResolutionTokens,
      kalshiConstraints: [...kalshiConstraints],
      polymarketConstraints: [...polymarketConstraints],
    };
  }

  if (
    hasWeakSharedResolutionTerms(
      kalshiResolutionTokens,
      polymarketResolutionTokens,
      sharedResolutionTokens,
    )
  ) {
    return {
      compatible: false,
      reason: "weak_shared_resolution_terms",
      sharedResolutionTokens,
      kalshiConstraints: [...kalshiConstraints],
      polymarketConstraints: [...polymarketConstraints],
    };
  }

  return {
    compatible: true,
    reason: "compatible",
    sharedResolutionTokens,
    kalshiConstraints: [...kalshiConstraints],
    polymarketConstraints: [...polymarketConstraints],
  };
}

function extractBinaryTokenIds(market: {
  clobTokenIds: string[];
  outcomes: string[];
}): { yesTokenId: string; noTokenId: string } | null {
  if (market.clobTokenIds.length < 2) {
    return null;
  }

  const outcomes = market.outcomes.map((outcome) => outcome.toLowerCase());
  const yesIndex = outcomes.findIndex((outcome) => outcome === "yes");
  const noIndex = outcomes.findIndex((outcome) => outcome === "no");

  if (yesIndex >= 0 && noIndex >= 0) {
    const yesTokenId = market.clobTokenIds[yesIndex];
    const noTokenId = market.clobTokenIds[noIndex];

    return yesTokenId && noTokenId ? { yesTokenId, noTokenId } : null;
  }

  if (market.clobTokenIds.length === 2 && market.outcomes.length <= 2) {
    return {
      yesTokenId: market.clobTokenIds[0],
      noTokenId: market.clobTokenIds[1],
    };
  }

  return null;
}

function scoreMarketMatch(
  kalshi: KalshiMarket,
  polymarket: PolymarketBinaryMarket,
): { score: number; sharedTokens: string[]; anchorTokens: string[] } {
  const kalshiTokens = normalizeTextTokens(
    [
      kalshi.title,
      kalshi.subtitle,
      kalshi.yesSubTitle,
      kalshi.noSubTitle,
      kalshi.eventTicker,
      kalshi.ticker,
    ].join(" "),
  );
  const polymarketTokens = normalizeTextTokens(
    [polymarket.question, polymarket.slug].join(" "),
  );
  const sharedTokens = kalshiTokens.filter((token) =>
    polymarketTokens.includes(token),
  );
  const anchorTokens = sharedTokens.filter(isAnchorMatchToken);

  if (sharedTokens.length < 2 || anchorTokens.length === 0) {
    return { score: 0, sharedTokens, anchorTokens };
  }

  const jaccard = jaccardScore(kalshiTokens, polymarketTokens);
  const overlap =
    sharedTokens.length /
    Math.max(1, Math.min(kalshiTokens.length, polymarketTokens.length));
  const anchorOverlap =
    anchorTokens.length /
    Math.max(
      1,
      Math.min(
        kalshiTokens.filter(isAnchorMatchToken).length,
        polymarketTokens.filter(isAnchorMatchToken).length,
      ),
    );
  const score = Math.min(1, jaccard * 0.45 + overlap * 0.35 + anchorOverlap * 0.2);

  return { score, sharedTokens, anchorTokens };
}

function hasResolutionTimeMismatch(
  kalshiResolutionAt: number | null,
  polymarket: PolymarketBinaryMarket,
): boolean {
  return Boolean(
    kalshiResolutionAt &&
      polymarket.expectedResolutionAt &&
      Math.abs(kalshiResolutionAt - polymarket.expectedResolutionAt) >
        MAX_RESOLUTION_TIME_DIFF_MS,
  );
}

function kalshiMarketResolutionAt(kalshi: KalshiMarket): number | null {
  return kalshi.closeTime ?? kalshi.expectedExpirationTime ?? null;
}

function kalshiResolutionSurfaceText(
  kalshi: Pick<
    KalshiMarket,
    "title" | "subtitle" | "yesSubTitle" | "noSubTitle"
  >,
): string {
  return compactText([
    kalshi.title,
    kalshi.subtitle,
    kalshi.yesSubTitle,
    kalshi.noSubTitle,
  ]);
}

function polymarketResolutionSurfaceText(
  polymarket: Pick<PolymarketBinaryMarket, "slug" | "question">,
): string {
  return compactText([polymarket.question, polymarket.slug]);
}

function extractResolutionConstraints(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/,/gu, "")
    .replace(/\s+/gu, " ");
  const constraints = new Set<string>();

  for (const match of normalized.matchAll(/\b(20[2-9]\d)\b/gu)) {
    if (match[1]) {
      constraints.add(`year:${match[1]}`);
    }
  }

  const thresholdPattern =
    /\b(?:(at\s+or\s+above|at\s+or\s+below|at\s+least|at\s+most|greater\s+than|less\s+than|more\s+than|no\s+less\s+than|no\s+more\s+than|above|below|over|under|exceeds?|exceeding)\s+)?(\$)?(\d+(?:\.\d+)?)\s*(%|percent|percentage\s+points?|points?|basis\s+points?|bps?|dollars?|usd|runs?|goals?|seats?|votes?)?\b/gu;

  for (const match of normalized.matchAll(thresholdPattern)) {
    const direction = normalizeThresholdDirection(match[1]);
    const currency = match[2] === "$";
    const value = normalizeConstraintNumber(match[3]);
    const unit = normalizeConstraintUnit(match[4], currency);

    if (!Number.isFinite(value) || (!direction && !unit)) {
      continue;
    }

    if (unit === "year") {
      continue;
    }

    constraints.add(
      `threshold:${direction || "exact"}:${formatConstraintNumber(value)}:${unit}`,
    );
  }

  return constraints;
}

function resolutionConstraintMismatchReason(
  kalshiConstraints: Set<string>,
  polymarketConstraints: Set<string>,
): CrossVenueResolutionCompatibility["reason"] | null {
  if (hasDisjointConstraintKind(kalshiConstraints, polymarketConstraints, "year:")) {
    return "year_mismatch";
  }

  if (
    hasDisjointConstraintKind(
      kalshiConstraints,
      polymarketConstraints,
      "threshold:",
    )
  ) {
    return "threshold_mismatch";
  }

  return null;
}

function hasDisjointConstraintKind(
  kalshiConstraints: Set<string>,
  polymarketConstraints: Set<string>,
  prefix: string,
): boolean {
  const left = [...kalshiConstraints].filter((constraint) =>
    constraint.startsWith(prefix),
  );
  const right = [...polymarketConstraints].filter((constraint) =>
    constraint.startsWith(prefix),
  );

  return (
    left.length > 0 &&
    right.length > 0 &&
    !left.some((constraint) => right.includes(constraint))
  );
}

function materialResolutionTokens(text: string): string[] {
  return normalizeTextTokens(text).filter(
    (token) =>
      !RESOLUTION_GENERIC_TOKENS.has(token) &&
      !/^\d+(?:\.\d+)?$/u.test(token),
  );
}

function hasWeakSharedResolutionTerms(
  kalshiTokens: string[],
  polymarketTokens: string[],
  sharedTokens: string[],
): boolean {
  const smallerSide = Math.min(kalshiTokens.length, polymarketTokens.length);
  const largerSide = Math.max(kalshiTokens.length, polymarketTokens.length);

  if (smallerSide < 2) {
    return false;
  }

  if (largerSide >= 3 && sharedTokens.length < 2) {
    return true;
  }

  return smallerSide >= 3 && sharedTokens.length / smallerSide < 0.5;
}

function normalizeThresholdDirection(value: string | undefined): string {
  const text = optionalString(value).toLowerCase().replace(/\s+/gu, " ");

  if (
    [
      "above",
      "over",
      "more than",
      "greater than",
      "exceed",
      "exceeds",
      "exceeding",
    ].includes(text)
  ) {
    return "above";
  }

  if (["at least", "at or above", "no less than"].includes(text)) {
    return "above_equal";
  }

  if (["below", "under", "less than"].includes(text)) {
    return "below";
  }

  if (["at most", "at or below", "no more than"].includes(text)) {
    return "below_equal";
  }

  return "";
}

function normalizeConstraintUnit(value: string | undefined, currency: boolean): string {
  const text = optionalString(value).toLowerCase().replace(/\s+/gu, " ");

  if (currency || ["dollar", "dollars", "usd"].includes(text)) {
    return "dollar";
  }

  if (["%", "percent", "percentage point", "percentage points"].includes(text)) {
    return "percent";
  }

  if (["basis point", "basis points", "bp", "bps"].includes(text)) {
    return "basis_point";
  }

  if (["point", "points"].includes(text)) {
    return "point";
  }

  if (["run", "runs"].includes(text)) {
    return "run";
  }

  if (["goal", "goals"].includes(text)) {
    return "goal";
  }

  if (["seat", "seats"].includes(text)) {
    return "seat";
  }

  if (["vote", "votes"].includes(text)) {
    return "vote";
  }

  return "";
}

function normalizeConstraintNumber(value: string | undefined): number {
  return Number(optionalString(value));
}

function formatConstraintNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundScore(value));
}

function classifyCandidateStatus(input: {
  eligibility: KalshiCrossVenueEligibility;
  minMatchScore: number;
  resolutionMismatch: boolean;
  resolutionTermsMismatch: boolean;
  score: number;
  strongSharedText: boolean;
}): CrossVenueMatchCandidatePreview["status"] {
  if (!input.eligibility.eligible) {
    return input.eligibility.reason === "compound_kalshi_market"
      ? "compound_kalshi_market"
      : "missing_kalshi_title";
  }

  if (input.score < input.minMatchScore || !input.strongSharedText) {
    return "below_match_threshold";
  }

  if (input.resolutionMismatch) {
    return "resolution_time_mismatch";
  }

  if (input.resolutionTermsMismatch) {
    return "resolution_terms_mismatch";
  }

  return "candidate";
}

function candidateStatusPriority(
  status: CrossVenueMatchCandidatePreview["status"],
): number {
  switch (status) {
    case "candidate":
      return 0;
    case "below_match_threshold":
      return 1;
    case "resolution_time_mismatch":
      return 2;
    case "resolution_terms_mismatch":
      return 3;
    case "ambiguous_match":
      return 4;
    case "compound_kalshi_market":
      return 5;
    case "missing_kalshi_title":
      return 6;
  }
}

function jaccardScore(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token));
  const union = new Set([...leftSet, ...rightSet]);

  return union.size === 0 ? 0 : intersection.length / union.size;
}

type ScoredMatchCandidate = {
  kalshi: KalshiMarket;
  kalshiResolutionAt: number | null;
  polymarket: PolymarketBinaryMarket;
  score: number;
  sharedTokens: string[];
  anchorTokens: string[];
};

function hasStrongSharedText(score: {
  sharedTokens: string[];
  anchorTokens: string[];
}): boolean {
  return score.sharedTokens.length >= 2 && score.anchorTokens.length >= 1;
}

function selectClearMatchCandidates(
  candidates: ScoredMatchCandidate[],
  kalshiMarkets: KalshiMarket[],
): ScoredMatchCandidate[] {
  const byKalshi = groupCandidates(candidates, (candidate) => candidate.kalshi.ticker);
  const byPolymarket = groupCandidates(
    candidates,
    (candidate) => candidate.polymarket.slug,
  );

  return candidates.filter(
    (candidate) =>
      isClearBestCandidate(
        candidate,
        byKalshi.get(candidate.kalshi.ticker) ?? [],
        kalshiMarkets,
      ) &&
      isClearBestCandidate(
        candidate,
        byPolymarket.get(candidate.polymarket.slug) ?? [],
        kalshiMarkets,
      ),
  );
}

function groupCandidates(
  candidates: ScoredMatchCandidate[],
  keyFn: (candidate: ScoredMatchCandidate) => string,
): Map<string, ScoredMatchCandidate[]> {
  const groups = new Map<string, ScoredMatchCandidate[]>();

  for (const candidate of candidates) {
    const key = keyFn(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  return groups;
}

function isClearBestCandidate(
  candidate: ScoredMatchCandidate,
  group: ScoredMatchCandidate[],
  kalshiMarkets: KalshiMarket[],
): boolean {
  const ranked = [...group].sort((left, right) =>
    compareScoredCandidates(left, right, kalshiMarkets),
  );
  const best = ranked[0];
  const second = ranked[1];

  if (!best || best !== candidate) {
    return false;
  }

  if (!second) {
    return true;
  }

  if (best.score - second.score >= MIN_CLEAR_MATCH_SCORE_GAP) {
    return true;
  }

  return (
    best.score === second.score &&
    liquidityForTicker(kalshiMarkets, best.kalshi.ticker) >=
      Math.max(1, liquidityForTicker(kalshiMarkets, second.kalshi.ticker)) * 2
  );
}

function compareScoredCandidates(
  left: ScoredMatchCandidate,
  right: ScoredMatchCandidate,
  kalshiMarkets: KalshiMarket[],
): number {
  return (
    right.score - left.score ||
    right.anchorTokens.length - left.anchorTokens.length ||
    right.sharedTokens.length - left.sharedTokens.length ||
    liquidityForTicker(kalshiMarkets, right.kalshi.ticker) -
      liquidityForTicker(kalshiMarkets, left.kalshi.ticker) ||
    left.kalshi.ticker.localeCompare(right.kalshi.ticker) ||
    left.polymarket.slug.localeCompare(right.polymarket.slug)
  );
}

function formatMatchReason(
  sharedTokens: string[],
  anchorTokens: string[],
  resolutionCompatibility?: CrossVenueResolutionCompatibility,
): string {
  const base = `shared=${sharedTokens.slice(0, 8).join(",")};anchors=${anchorTokens
    .slice(0, 6)
    .join(",")}`;

  if (!resolutionCompatibility || resolutionCompatibility.compatible) {
    return base;
  }

  return `${base};resolution=${resolutionCompatibility.reason}`;
}

function isAnchorMatchToken(token: string): boolean {
  return !GENERIC_MATCH_TOKENS.has(token) && !/^\d{1,4}$/u.test(token);
}

function normalizeToken(token: string): string {
  return TOKEN_SYNONYMS.get(token) ?? token;
}

function liquidityForTicker(markets: KalshiMarket[], ticker: string): number {
  return markets.find((market) => market.ticker === ticker)?.liquidityDollars ?? 0;
}

function inferPolymarketCategory(
  market: GammaRawMarket,
  event: GammaRawEvent,
): string | undefined {
  return (
    optionalString(
      market.category ??
        market.categorySlug ??
        market.category_slug ??
        event.category ??
        event.categorySlug ??
        event.category_slug,
    ) || undefined
  );
}

function polymarketRulesText(
  market: { description?: string },
  rawMarket: GammaRawMarket,
  event: GammaRawEvent,
): string {
  return firstNonEmptyText([
    market.description,
    rawMarket.description,
    rawMarket.rules,
    rawMarket.marketRules,
    rawMarket.market_rules,
    event.description,
    event.rules,
  ]);
}

function polymarketResolutionSource(
  market: { resolutionSource?: string },
  rawMarket: GammaRawMarket,
  event: GammaRawEvent,
): string {
  return firstNonEmptyText([
    market.resolutionSource,
    rawMarket.resolutionSource,
    rawMarket.resolution_source,
    event.resolutionSource,
    event.resolution_source,
  ]);
}

function firstNonEmptyText(values: unknown[]): string {
  return values.map(optionalString).find((value) => value.length > 0) ?? "";
}

function compactText(values: unknown[]): string {
  return values.map(optionalString).filter(Boolean).join(" ");
}

function inferCrossVenueCategory(
  kalshi: KalshiMarket,
  polymarket: PolymarketBinaryMarket,
): string {
  const explicit = normalizeCategory(polymarket.category);

  if (explicit !== "other") {
    return explicit;
  }

  return normalizeCategory(
    [
      kalshi.eventTicker,
      kalshi.ticker,
      kalshi.title,
      kalshi.subtitle,
      kalshi.yesSubTitle,
      polymarket.slug,
      polymarket.question,
    ].join(" "),
  );
}

function normalizeCategory(value: unknown): string {
  const text = optionalString(value).toLowerCase();

  if (/bitcoin|btc|ethereum|eth|crypto|solana|token|coin/u.test(text)) {
    return "crypto";
  }

  if (
    /fed|rate|inflation|cpi|gdp|recession|bank|oil|gold|stock|ipo|treasury|finance/u.test(
      text,
    )
  ) {
    return "finance";
  }

  if (
    /election|president|senate|governor|mayor|trump|biden|democrat|republican|congress|parliament/u.test(
      text,
    )
  ) {
    return "politics";
  }

  if (
    /nba|nfl|nhl|mlb|fifa|world cup|super bowl|champion|championship|league|open winner|sports/u.test(
      text,
    )
  ) {
    return "sports";
  }

  if (/oscar|grammy|movie|film|emmy|album|song|box office|eurovision/u.test(text)) {
    return "culture";
  }

  return "other";
}

function sumNullableNumbers(values: Array<number | null | undefined>): number | null {
  const parsed = values.filter((value): value is number => Number.isFinite(value));

  return parsed.length === 0
    ? null
    : Math.round(parsed.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function optionalNumber(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function roundScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

const TOKEN_SYNONYMS = new Map<string, string>([
  ["usa", "us"],
  ["u", "us"],
  ["united", "us"],
  ["states", "us"],
  ["election", "elect"],
  ["elections", "elect"],
  ["championship", "champion"],
  ["champions", "champion"],
  ["wins", "win"],
  ["winning", "win"],
  ["rates", "rate"],
]);

const GENERIC_MATCH_TOKENS = new Set([
  "above",
  "below",
  "cut",
  "elect",
  "event",
  "future",
  "happen",
  "high",
  "low",
  "market",
  "more",
  "no",
  "over",
  "president",
  "presidential",
  "price",
  "champion",
  "result",
  "than",
  "under",
  "win",
  "yes",
]);

const RESOLUTION_GENERIC_TOKENS = new Set([
  ...GENERIC_MATCH_TOKENS,
  "actual",
  "asked",
  "calendar",
  "date",
  "deadline",
  "during",
  "end",
  "final",
  "get",
  "happen",
  "highest",
  "how",
  "if",
  "outcome",
  "resolve",
  "resolves",
  "resolved",
  "settle",
  "settlement",
  "source",
  "time",
  "year",
]);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "as",
  "at",
  "be",
  "before",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "market",
  "of",
  "on",
  "or",
  "the",
  "to",
  "will",
  "with",
]);
