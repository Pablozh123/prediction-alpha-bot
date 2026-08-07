import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type SportsTickInput = {
  sport?: string | null;
  league?: string | null;
  gameId?: string | null;
  slug: string;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string | null;
  ended?: boolean;
  finishedTimestamp?: number | null;
  raw: unknown;
  receivedAt?: number;
};

export type SportsTickRecord = {
  id: string;
  sport: string | null;
  league: string | null;
  gameId: string | null;
  slug: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  ended: boolean;
  finishedTimestamp: number | null;
  rawJson: string;
  receivedAt: number;
};

export type SportsSlugMappingInput = {
  sportsSlug: string;
  marketSlug?: string | null;
  eventSlug?: string | null;
  sport?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  awayOutcomeIndex?: number | null;
  homeOutcomeIndex?: number | null;
  awayTokenId?: string | null;
  homeTokenId?: string | null;
  mappingStatus: string;
  reason?: string | null;
  updatedAt?: number;
};

export type SportsResolutionWatchInput = {
  strategy: string;
  sportsSlug: string;
  marketSlug?: string | null;
  eventSlug?: string | null;
  winningSide?: "home" | "away" | null;
  winningTeam?: string | null;
  winningTokenId?: string | null;
  losingTokenId?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  finalScore?: string | null;
  marketPrice?: number | null;
  bestAsk?: number | null;
  expectedEdge?: number | null;
  validationStatus: string;
  reason?: string | null;
  opportunityId?: string | null;
  timestamp?: number;
};

export type SportsResolutionWatchRecord = Required<
  Pick<
    SportsResolutionWatchInput,
    "strategy" | "sportsSlug" | "validationStatus"
  >
> & {
  id: string;
  marketSlug: string | null;
  eventSlug: string | null;
  winningSide: "home" | "away" | null;
  winningTeam: string | null;
  winningTokenId: string | null;
  losingTokenId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  finalScore: string | null;
  marketPrice: number | null;
  bestAsk: number | null;
  expectedEdge: number | null;
  reason: string | null;
  opportunityId: string | null;
  timestamp: number;
};

type SportsTickRow = {
  id: string;
  sport: string | null;
  league: string | null;
  game_id: string | null;
  slug: string;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  ended: number;
  finished_timestamp: number | null;
  raw_json: string;
  received_at: number;
};

type SportsWatchRow = {
  id: string;
  strategy: string;
  sports_slug: string;
  market_slug: string | null;
  event_slug: string | null;
  winning_side: "home" | "away" | null;
  winning_team: string | null;
  winning_token_id: string | null;
  losing_token_id: string | null;
  home_team: string | null;
  away_team: string | null;
  final_score: string | null;
  market_price: number | null;
  best_ask: number | null;
  expected_edge: number | null;
  validation_status: string;
  reason: string | null;
  opportunity_id: string | null;
  timestamp: number;
};

export function recordSportsTick(input: SportsTickInput): SportsTickRecord {
  if (!input.slug.trim()) {
    throw new Error("Cannot record sports tick: slug is required.");
  }

  const record: SportsTickRecord = {
    id: uuidv4(),
    sport: input.sport ?? null,
    league: input.league ?? null,
    gameId: input.gameId ?? null,
    slug: input.slug,
    homeTeam: input.homeTeam ?? null,
    awayTeam: input.awayTeam ?? null,
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    status: input.status ?? null,
    ended: input.ended ?? false,
    finishedTimestamp: input.finishedTimestamp ?? null,
    rawJson: JSON.stringify(input.raw),
    receivedAt: input.receivedAt ?? Date.now(),
  };

  getDb()
    .prepare(
      `
      INSERT INTO sports_ticks (
        id,
        sport,
        league,
        game_id,
        slug,
        home_team,
        away_team,
        home_score,
        away_score,
        status,
        ended,
        finished_timestamp,
        raw_json,
        received_at
      ) VALUES (
        @id,
        @sport,
        @league,
        @gameId,
        @slug,
        @homeTeam,
        @awayTeam,
        @homeScore,
        @awayScore,
        @status,
        @ended,
        @finishedTimestamp,
        @rawJson,
        @receivedAt
      )
      `,
    )
    .run({
      ...record,
      ended: record.ended ? 1 : 0,
    });

  return record;
}

export function upsertSportsSlugMapping(input: SportsSlugMappingInput): void {
  getDb()
    .prepare(
      `
      INSERT INTO sports_slug_mappings (
        id,
        sports_slug,
        market_slug,
        event_slug,
        sport,
        home_team,
        away_team,
        away_outcome_index,
        home_outcome_index,
        away_token_id,
        home_token_id,
        mapping_status,
        reason,
        updated_at
      ) VALUES (
        @id,
        @sportsSlug,
        @marketSlug,
        @eventSlug,
        @sport,
        @homeTeam,
        @awayTeam,
        @awayOutcomeIndex,
        @homeOutcomeIndex,
        @awayTokenId,
        @homeTokenId,
        @mappingStatus,
        @reason,
        @updatedAt
      )
      `,
    )
    .run({
      id: uuidv4(),
      sportsSlug: input.sportsSlug,
      marketSlug: input.marketSlug ?? null,
      eventSlug: input.eventSlug ?? null,
      sport: input.sport ?? null,
      homeTeam: input.homeTeam ?? null,
      awayTeam: input.awayTeam ?? null,
      awayOutcomeIndex: input.awayOutcomeIndex ?? null,
      homeOutcomeIndex: input.homeOutcomeIndex ?? null,
      awayTokenId: input.awayTokenId ?? null,
      homeTokenId: input.homeTokenId ?? null,
      mappingStatus: input.mappingStatus,
      reason: input.reason ?? null,
      updatedAt: input.updatedAt ?? Date.now(),
    });
}

export function recordSportsResolutionWatch(
  input: SportsResolutionWatchInput,
): SportsResolutionWatchRecord {
  const record: SportsResolutionWatchRecord = {
    id: uuidv4(),
    strategy: input.strategy,
    sportsSlug: input.sportsSlug,
    marketSlug: input.marketSlug ?? null,
    eventSlug: input.eventSlug ?? null,
    winningSide: input.winningSide ?? null,
    winningTeam: input.winningTeam ?? null,
    winningTokenId: input.winningTokenId ?? null,
    losingTokenId: input.losingTokenId ?? null,
    homeTeam: input.homeTeam ?? null,
    awayTeam: input.awayTeam ?? null,
    finalScore: input.finalScore ?? null,
    marketPrice: input.marketPrice ?? null,
    bestAsk: input.bestAsk ?? null,
    expectedEdge: input.expectedEdge ?? null,
    validationStatus: input.validationStatus,
    reason: input.reason ?? null,
    opportunityId: input.opportunityId ?? null,
    timestamp: input.timestamp ?? Date.now(),
  };

  getDb()
    .prepare(
      `
      INSERT INTO sports_resolution_watch (
        id,
        strategy,
        sports_slug,
        market_slug,
        event_slug,
        winning_side,
        winning_team,
        winning_token_id,
        losing_token_id,
        home_team,
        away_team,
        final_score,
        market_price,
        best_ask,
        expected_edge,
        validation_status,
        reason,
        opportunity_id,
        timestamp
      ) VALUES (
        @id,
        @strategy,
        @sportsSlug,
        @marketSlug,
        @eventSlug,
        @winningSide,
        @winningTeam,
        @winningTokenId,
        @losingTokenId,
        @homeTeam,
        @awayTeam,
        @finalScore,
        @marketPrice,
        @bestAsk,
        @expectedEdge,
        @validationStatus,
        @reason,
        @opportunityId,
        @timestamp
      )
      `,
    )
    .run(record);

  return record;
}

export function listRecentSportsTicks(limit: number): SportsTickRecord[] {
  return getDb()
    .prepare<SportsTickRow>(
      `
      SELECT
        id,
        sport,
        league,
        game_id,
        slug,
        home_team,
        away_team,
        home_score,
        away_score,
        status,
        ended,
        finished_timestamp,
        raw_json,
        received_at
      FROM sports_ticks
      ORDER BY received_at DESC
      LIMIT ?
      `,
    )
    .all(limit)
    .map(mapSportsTickRow);
}

export function listRecentSportsResolutionWatches(
  limit: number,
): SportsResolutionWatchRecord[] {
  return getDb()
    .prepare<SportsWatchRow>(
      `
      SELECT
        id,
        strategy,
        sports_slug,
        market_slug,
        event_slug,
        winning_side,
        winning_team,
        winning_token_id,
        losing_token_id,
        home_team,
        away_team,
        final_score,
        market_price,
        best_ask,
        expected_edge,
        validation_status,
        reason,
        opportunity_id,
        timestamp
      FROM sports_resolution_watch
      ORDER BY timestamp DESC
      LIMIT ?
      `,
    )
    .all(limit)
    .map(mapSportsWatchRow);
}

function mapSportsTickRow(row: SportsTickRow): SportsTickRecord {
  return {
    id: row.id,
    sport: row.sport,
    league: row.league,
    gameId: row.game_id,
    slug: row.slug,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: row.status,
    ended: row.ended === 1,
    finishedTimestamp: row.finished_timestamp,
    rawJson: row.raw_json,
    receivedAt: row.received_at,
  };
}

function mapSportsWatchRow(row: SportsWatchRow): SportsResolutionWatchRecord {
  return {
    id: row.id,
    strategy: row.strategy,
    sportsSlug: row.sports_slug,
    marketSlug: row.market_slug,
    eventSlug: row.event_slug,
    winningSide: row.winning_side,
    winningTeam: row.winning_team,
    winningTokenId: row.winning_token_id,
    losingTokenId: row.losing_token_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    finalScore: row.final_score,
    marketPrice: row.market_price,
    bestAsk: row.best_ask,
    expectedEdge: row.expected_edge,
    validationStatus: row.validation_status,
    reason: row.reason,
    opportunityId: row.opportunity_id,
    timestamp: row.timestamp,
  };
}
