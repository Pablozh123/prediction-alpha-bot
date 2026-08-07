import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type RecordOpportunityLegInput = {
  opportunityId: string;
  strategy: string;
  slug?: string | null;
  marketId?: string | null;
  question?: string | null;
  tokenId: string;
  side: string;
  rawYesPrice?: number | null;
  averageFillPrice?: number | null;
  maxFillableUsd?: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  fillable: boolean;
  reason?: string | null;
  legIndex: number;
  timestamp?: number;
};

export type OpportunityLegRecord = {
  id: string;
  opportunityId: string;
  strategy: string;
  slug: string | null;
  marketId: string | null;
  question: string | null;
  tokenId: string;
  side: string;
  rawYesPrice: number | null;
  averageFillPrice: number | null;
  maxFillableUsd: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  fillable: boolean;
  reason: string | null;
  legIndex: number;
  timestamp: number;
};

type OpportunityLegRow = {
  id: string;
  opportunity_id: string;
  strategy: string;
  slug: string | null;
  market_id: string | null;
  question: string | null;
  token_id: string;
  side: string;
  raw_yes_price: number | null;
  average_fill_price: number | null;
  max_fillable_usd: number | null;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  fillable: number;
  reason: string | null;
  leg_index: number;
  timestamp: number;
};

export function recordOpportunityLegs(
  legs: RecordOpportunityLegInput[]
): OpportunityLegRecord[] {
  if (legs.length === 0) {
    return [];
  }

  const records = legs.map((leg): OpportunityLegRecord => {
    const spread =
      leg.bestAsk === null ||
      leg.bestAsk === undefined ||
      leg.bestBid === null ||
      leg.bestBid === undefined
        ? null
        : roundPrice(leg.bestAsk - leg.bestBid);

    return {
      id: uuidv4(),
      opportunityId: leg.opportunityId,
      strategy: leg.strategy,
      slug: leg.slug ?? null,
      marketId: leg.marketId ?? null,
      question: leg.question ?? null,
      tokenId: leg.tokenId,
      side: leg.side,
      rawYesPrice: leg.rawYesPrice ?? null,
      averageFillPrice: leg.averageFillPrice ?? null,
      maxFillableUsd: leg.maxFillableUsd ?? null,
      bestBid: leg.bestBid ?? null,
      bestAsk: leg.bestAsk ?? null,
      spread,
      fillable: leg.fillable,
      reason: leg.reason ?? null,
      legIndex: leg.legIndex,
      timestamp: leg.timestamp ?? Date.now()
    };
  });

  const statement = getDb().prepare(
    `
    INSERT INTO opportunity_legs (
      id,
      opportunity_id,
      strategy,
      slug,
      market_id,
      question,
      token_id,
      side,
      raw_yes_price,
      average_fill_price,
      max_fillable_usd,
      best_bid,
      best_ask,
      spread,
      fillable,
      reason,
      leg_index,
      timestamp
    ) VALUES (
      @id,
      @opportunityId,
      @strategy,
      @slug,
      @marketId,
      @question,
      @tokenId,
      @side,
      @rawYesPrice,
      @averageFillPrice,
      @maxFillableUsd,
      @bestBid,
      @bestAsk,
      @spread,
      @fillable,
      @reason,
      @legIndex,
      @timestamp
    )
    `
  );

  for (const record of records) {
    statement.run({
      ...record,
      fillable: record.fillable ? 1 : 0
    });
  }

  return records;
}

export function listOpportunityLegs(
  opportunityId: string
): OpportunityLegRecord[] {
  return getDb()
    .prepare<OpportunityLegRow>(
      `
      SELECT
        id,
        opportunity_id,
        strategy,
        slug,
        market_id,
        question,
        token_id,
        side,
        raw_yes_price,
        average_fill_price,
        max_fillable_usd,
        best_bid,
        best_ask,
        spread,
        fillable,
        reason,
        leg_index,
        timestamp
      FROM opportunity_legs
      WHERE opportunity_id = ?
      ORDER BY leg_index ASC
      `
    )
    .all(opportunityId)
    .map(mapOpportunityLegRow);
}

function mapOpportunityLegRow(row: OpportunityLegRow): OpportunityLegRecord {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    strategy: row.strategy,
    slug: row.slug,
    marketId: row.market_id,
    question: row.question,
    tokenId: row.token_id,
    side: row.side,
    rawYesPrice: row.raw_yes_price,
    averageFillPrice: row.average_fill_price,
    maxFillableUsd: row.max_fillable_usd,
    bestBid: row.best_bid,
    bestAsk: row.best_ask,
    spread: row.spread,
    fillable: row.fillable === 1,
    reason: row.reason,
    legIndex: row.leg_index,
    timestamp: row.timestamp
  };
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
