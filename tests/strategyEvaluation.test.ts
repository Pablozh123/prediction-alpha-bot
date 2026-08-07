import { describe, expect, it } from "vitest";
import {
  buildRejectionReasons,
  buildStrategyEvaluation,
  classifyStrategy,
  edgeToBps,
  median,
  type EdgeQualityMetrics,
  type FunnelMetrics,
  type OpportunityEvaluationRow,
  type SchemaInfo,
} from "../src/scripts/strategyEvaluation.js";

describe("strategy evaluation helpers", () => {
  it("aggregates funnel counts and conversion rates", () => {
    const report = buildStrategyEvaluation({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      schema: makeSchema(),
      opportunities: [
        makeOpportunity({ status: "paper_fired" }),
        makeOpportunity({
          status: "rejected",
          reason: "duplicate_within_cooldown",
        }),
        makeOpportunity({ status: "raw_found" }),
      ],
      paperTrades: [],
      scanCycles: [],
      paperFireDedup: [],
      liveTradesCount: { available: true, value: 0 },
    });

    expect(report.funnel).toEqual([
      {
        strategy: "within_market_yes_no_arb",
        rawFound: 3,
        currentRawFound: 1,
        validated: 1,
        rejected: 0,
        paperFired: 1,
        dedupeSkipped: 1,
        validatedRate: 0.3333,
        rejectedRate: 0,
        paperFiredRate: 0.3333,
        dedupeSkippedRate: 0.3333,
      },
    ]);
  });

  it("groups rejection reasons by strategy and reason", () => {
    expect(
      buildRejectionReasons([
        makeOpportunity({
          strategy: "a",
          status: "rejected",
          reason: "partial_basket_invalid",
        }),
        makeOpportunity({
          strategy: "a",
          status: "rejected",
          reason: "partial_basket_invalid",
        }),
        makeOpportunity({
          strategy: "b",
          status: "rejected",
          reason: "orderbook_error",
        }),
        makeOpportunity({
          strategy: "b",
          status: "rejected",
          reason: "duplicate_within_cooldown",
        }),
        makeOpportunity({ strategy: "b", status: "paper_fired" }),
      ]),
    ).toEqual([
      {
        strategy: "a",
        reason: "partial_basket_invalid",
        count: 2,
      },
      {
        strategy: "b",
        reason: "orderbook_error",
        count: 1,
      },
    ]);
  });

  it("calculates medians and edge bps", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(edgeToBps(0.0123)).toBe(123);
    expect(edgeToBps(null)).toBeNull();
  });

  it("classifies strategy verdicts", () => {
    expect(
      classifyStrategy({
        funnel: makeFunnel({
          rawFound: 10,
          validated: 3,
          rejected: 2,
          paperFired: 3,
        }),
        edgeQuality: makeEdgeQuality({ avg: 42, median: 35 }),
        rejectionReasons: [],
      }).verdict,
    ).toBe("CONTINUE_TESTING");

    expect(
      classifyStrategy({
        funnel: makeFunnel({
          rawFound: 10,
          validated: 0,
          rejected: 6,
          paperFired: 0,
        }),
        edgeQuality: makeEdgeQuality({ avg: null, median: null }),
        rejectionReasons: [
          {
            strategy: "within_market_yes_no_arb",
            reason: "duplicate_within_cooldown",
            count: 6,
          },
        ],
      }).verdict,
    ).toBe("NEEDS_FIX");

    expect(
      classifyStrategy({
        funnel: makeFunnel({
          rawFound: 10,
          validated: 0,
          rejected: 10,
          paperFired: 0,
        }),
        edgeQuality: makeEdgeQuality({ avg: null, median: null }),
        rejectionReasons: [
          {
            strategy: "within_market_yes_no_arb",
            reason: "partial_basket_invalid",
            count: 10,
          },
        ],
      }).verdict,
    ).toBe("PAUSE");
  });

  it("marks unavailable metrics when optional columns are missing", () => {
    const report = buildStrategyEvaluation({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      schema: makeSchema({
        opportunities: [
          "id",
          "strategy",
          "slug",
          "raw_edge",
          "executable_edge",
          "status",
          "reason",
          "token_ids",
          "timestamp",
        ],
      }),
      opportunities: [
        makeOpportunity({
          status: "paper_fired",
          executableEdge: 0.02,
          fillableUsd: null,
        }),
      ],
      paperTrades: [],
      scanCycles: [],
      paperFireDedup: [],
      liveTradesCount: { available: true, value: 0 },
    });

    expect(report.capacity[0]?.fillableUsd).toEqual({
      available: false,
      reason: "opportunities.fillable_usd column unavailable",
    });
    expect(report.edgeQuality[0]?.feeAdjustedEdgeBps).toEqual({
      available: false,
      reason: "opportunities.fee_adjusted_edge column unavailable",
    });
    expect(report.topByExecutableEdgeTimesFillableUsd).toEqual({
      available: false,
      reason: "opportunities.fillable_usd column unavailable",
    });
  });

  it("keeps scanner-run strategies visible even with zero opportunities", () => {
    const report = buildStrategyEvaluation({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      schema: makeSchema(),
      opportunities: [],
      paperTrades: [],
      scanCycles: [],
      scannerRuns: [
        {
          strategy: "neg_risk_bracket_arb",
          timestamp: 1_764_000_000_000,
          rawOpportunities: 0,
          validatedOpportunities: 0,
          rejectedOpportunities: 0,
          dedupeSkips: 0,
          paperTrades: 0,
        },
      ],
      paperFireDedup: [],
      liveTradesCount: { available: true, value: 0 },
    });

    expect(report.runSummary.strategiesFound).toEqual(["neg_risk_bracket_arb"]);
    expect(report.funnel[0]).toMatchObject({
      strategy: "neg_risk_bracket_arb",
      rawFound: 0,
      paperFired: 0,
    });
    expect(report.verdicts[0]).toMatchObject({
      strategy: "neg_risk_bracket_arb",
      verdict: "PAUSE",
    });
  });
});

function makeSchema(
  overrides: Partial<Record<keyof SchemaInfo, string[]>> = {},
): SchemaInfo {
  return {
    opportunities: {
      exists: true,
      columns: overrides.opportunities ?? [
        "id",
        "strategy",
        "slug",
        "raw_edge",
        "executable_edge",
        "status",
        "reason",
        "token_ids",
        "timestamp",
        "fillable_usd",
        "min_leg_depth_usd",
        "leg_count",
        "executable_sum",
        "fee_adjusted_edge",
      ],
    },
    opportunity_legs: {
      exists: true,
      columns: overrides.opportunity_legs ?? ["opportunity_id", "token_id"],
    },
    orderbook_snapshots: {
      exists: true,
      columns: overrides.orderbook_snapshots ?? ["token_id", "captured_at"],
    },
    scanner_runs: {
      exists: true,
      columns: overrides.scanner_runs ?? [
        "strategy",
        "timestamp",
        "raw_opportunities",
        "validated_opportunities",
        "rejected_opportunities",
        "dedupe_skips",
        "paper_trades",
      ],
    },
    paper_trades: {
      exists: true,
      columns: overrides.paper_trades ?? [
        "strategy",
        "resolved",
        "pnl",
        "opportunity_id",
        "timestamp",
      ],
    },
    scan_cycles: {
      exists: true,
      columns: overrides.scan_cycles ?? [
        "timestamp",
        "success",
        "opportunities",
        "paper_trades",
        "skipped_duplicates",
        "rejected_opportunities",
      ],
    },
    paper_fire_dedup: {
      exists: true,
      columns: overrides.paper_fire_dedup ?? ["strategy", "fired_at"],
    },
    paper_dedupe_skips: {
      exists: true,
      columns: overrides.paper_dedupe_skips ?? ["strategy", "skipped_at"],
    },
    live_trades: {
      exists: true,
      columns: overrides.live_trades ?? ["id"],
    },
  };
}

function makeOpportunity(
  overrides: Partial<OpportunityEvaluationRow> = {},
): OpportunityEvaluationRow {
  return {
    id: "opportunity-1",
    strategy: "within_market_yes_no_arb",
    slug: "market",
    rawEdge: 0.03,
    executableEdge: 0.02,
    status: "raw_found",
    reason: null,
    tokenIds: null,
    timestamp: 1_764_000_000_000,
    fillableUsd: 100,
    minLegDepthUsd: 50,
    legCount: 2,
    executableSum: 0.97,
    feeAdjustedEdge: 0.015,
    ...overrides,
  };
}

function makeFunnel(overrides: Partial<FunnelMetrics>): FunnelMetrics {
  const rawFound = overrides.rawFound ?? 0;
  const validated = overrides.validated ?? 0;
  const rejected = overrides.rejected ?? 0;
  const paperFired = overrides.paperFired ?? 0;
  const base: FunnelMetrics = {
    strategy: "within_market_yes_no_arb",
    rawFound: 0,
    currentRawFound: 0,
    validated: 0,
    rejected: 0,
    paperFired: 0,
    dedupeSkipped: 0,
    validatedRate: null,
    rejectedRate: null,
    paperFiredRate: null,
    dedupeSkippedRate: null,
  };

  return {
    ...base,
    ...overrides,
    validatedRate: rawFound > 0 ? validated / rawFound : null,
    rejectedRate: rawFound > 0 ? rejected / rawFound : null,
    paperFiredRate: rawFound > 0 ? paperFired / rawFound : null,
  };
}

function makeEdgeQuality(summary: {
  avg: number | null;
  median: number | null;
}): EdgeQualityMetrics {
  return {
    strategy: "within_market_yes_no_arb",
    rawEdgeBps: {
      avg: 100,
      median: 100,
      min: 100,
      max: 100,
    },
    executableEdgeBps: {
      avg: summary.avg,
      median: summary.median,
      min: summary.median,
      max: summary.avg,
    },
    feeAdjustedEdgeBps: {
      available: false,
      reason: "opportunities.fee_adjusted_edge column unavailable",
    },
  };
}
