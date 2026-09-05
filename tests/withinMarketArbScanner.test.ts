import { describe, expect, it, vi } from "vitest";
import type {
  ExecuteOrPaperInput,
  ExecuteOrPaperResult,
} from "../src/execution/executeOrPaper.js";
import {
  DEFAULT_WITHIN_MARKET_ARB_THRESHOLD,
  DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD,
  paperWithinMarketArbOpportunity,
  scanWithinMarketArbs,
  scanWithinMarketGammaEvents,
  scanWithinMarketSnapshotOpportunities,
  WITHIN_MARKET_ARB_STRATEGY,
  type WithinMarketSnapshotRow,
  type WithinMarketArbMarket,
} from "../src/scanner/withinMarketArbScanner.js";

describe("scanWithinMarketArbs", () => {
  it("finds YES+NO candidates below the default conservative threshold", () => {
    expect(
      scanWithinMarketArbs([
        makeMarket({
          askYes: 0.45,
          askNo: 0.52,
        }),
      ]),
    ).toEqual([
      {
        slug: "binary-market",
        question: "Will this resolve yes?",
        askYes: 0.45,
        askNo: 0.52,
        totalCost: 0.97,
        expectedEdge: 0.03,
        tokenIds: {
          yes: "yes-token",
          no: "no-token",
        },
        reason: "yes_no_ask_sum_below_threshold",
      },
    ]);
  });

  it("does not flag candidates at or above the default threshold", () => {
    expect(
      scanWithinMarketArbs([
        makeMarket({
          askYes: 0.49,
          askNo: 0.49,
        }),
        makeMarket({
          askYes: 0.5,
          askNo: 0.49,
        }),
      ]),
    ).toEqual([]);
  });

  it("supports a custom threshold", () => {
    expect(
      scanWithinMarketArbs(
        [
          makeMarket({
            askYes: 0.49,
            askNo: 0.49,
          }),
        ],
        { threshold: 0.99 },
      ),
    ).toHaveLength(1);
  });

  it("skips invalid market fields and warns", () => {
    const warn = vi.fn();

    expect(
      scanWithinMarketArbs(
        [
          makeMarket({
            askYes: 0,
            askNo: 0.5,
          }),
        ],
        { warn },
      ),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping within-market arb candidate "binary-market": invalid market fields.',
    );
  });

  it("uses the documented default threshold", () => {
    expect(DEFAULT_WITHIN_MARKET_ARB_THRESHOLD).toBe(0.98);
    expect(DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD).toBe(1.01);
  });

  it("finds snapshot-derived YES+NO candidates below the threshold", () => {
    expect(
      scanWithinMarketSnapshotOpportunities({
        snapshots: [
          makeSnapshot({ side: "YES", bestAsk: 0.45, capturedAt: 1_000 }),
          makeSnapshot({
            tokenId: "no-token",
            side: "NO",
            bestAsk: 0.52,
            expectedResolutionAt: 2_000,
            capturedAt: 1_100,
          }),
        ],
      }),
    ).toEqual([
      {
        slug: "binary-market",
        question: "binary-market",
        askYes: 0.45,
        askNo: 0.52,
        totalCost: 0.97,
        expectedEdge: 0.03,
        expectedResolutionAt: 2_000,
        tokenIds: {
          yes: "yes-token",
          no: "no-token",
        },
        reason: "yes_no_ask_sum_below_threshold",
      },
    ]);
  });

  it("ignores snapshot candidates with a missing side", () => {
    expect(
      scanWithinMarketSnapshotOpportunities({
        snapshots: [
          makeSnapshot({ side: "YES", bestAsk: 0.45 }),
          makeSnapshot({
            tokenId: "other-yes-token",
            side: "YES",
            bestAsk: 0.52,
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("ignores stale snapshot side pairs", () => {
    expect(
      scanWithinMarketSnapshotOpportunities({
        maxStalenessMs: 600_000,
        snapshots: [
          makeSnapshot({ side: "YES", bestAsk: 0.45, capturedAt: 1_000 }),
          makeSnapshot({
            tokenId: "no-token",
            side: "NO",
            bestAsk: 0.52,
            capturedAt: 700_000,
          }),
        ],
      }),
    ).toEqual([]);
  });
});

describe("paperWithinMarketArbOpportunity", () => {
  it("papers both YES and NO legs through executeOrPaper", () => {
    const [opportunity] = scanWithinMarketArbs([
      makeMarket({
        askYes: 0.45,
        askNo: 0.52,
      }),
    ]);
    const execute = vi.fn(
      (input: ExecuteOrPaperInput): ExecuteOrPaperResult => ({
        paper: true,
        live: false,
        reason: "paper_only" as const,
        paperTrade: {
          id: `${input.side}-trade`,
          strategy: input.strategy,
          slug: input.slug ?? null,
          question: input.question ?? null,
          tokenId: input.tokenId,
          opportunityId: input.opportunityId ?? null,
          side: input.side,
          sizeUsd: input.paperSizeUsd,
          sizeShares: input.paperSizeShares ?? null,
          entryPrice: input.entryPrice,
          exitPrice: null,
          resolved: false,
          pnl: null,
          inflationFlagged: false,
          resolutionReason: null,
          arbClass: input.arbClass ?? null,
          linkStatus: "linked",
          timestamp: 1,
          resolvedAt: null,
        },
      }),
    );

    const results = paperWithinMarketArbOpportunity(opportunity!, {
      execute,
      opportunityId: "opp-within-1",
      paperSizeUsd: 2,
    });

    expect(results).toHaveLength(2);
    expect(execute).toHaveBeenNthCalledWith(1, {
      strategy: WITHIN_MARKET_ARB_STRATEGY,
      slug: "binary-market",
      question: "Will this resolve yes?",
      tokenId: "yes-token",
      opportunityId: "opp-within-1",
      side: "YES",
      entryPrice: 0.45,
      paperSizeUsd: 2,
      arbClass: WITHIN_MARKET_ARB_STRATEGY,
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      strategy: WITHIN_MARKET_ARB_STRATEGY,
      slug: "binary-market",
      question: "Will this resolve yes?",
      tokenId: "no-token",
      opportunityId: "opp-within-1",
      side: "NO",
      entryPrice: 0.52,
      paperSizeUsd: 2,
      arbClass: WITHIN_MARKET_ARB_STRATEGY,
    });
  });

  it("contains no live order integration", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/scanner/withinMarketArbScanner.ts",
      "utf8",
    );

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toContain("createAndPostOrder");
    expect(source).not.toContain("placeOrder");
    expect(source).not.toContain("postOrder");
    expect(source).not.toContain("buyLimit");
    expect(source).not.toContain("sellPosition");
  });
});

describe("scanWithinMarketGammaEvents", () => {
  it("drops a closed market inside an active event before it can look like a candidate", () => {
    const open = {
      id: "m1",
      slug: "open-market",
      question: "Open?",
      clobTokenIds: '["y1","n1"]',
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.45","0.52"]',
    };
    // Last prices on a settled market sum to nothing like a dollar; without
    // the flag they would read as the widest gap on the venue.
    const closed = {
      ...open,
      id: "m2",
      slug: "closed-market",
      closed: true,
      outcomePrices: '["0.01","0.02"]',
    };
    const stopped = { ...open, id: "m3", slug: "stopped-market", acceptingOrders: false };

    const found = scanWithinMarketGammaEvents([
      { slug: "event", markets: [open, closed, stopped] },
    ]);

    expect(found.map((opportunity) => opportunity.slug)).toEqual(["open-market"]);
  });
});

function makeMarket(
  overrides: Partial<WithinMarketArbMarket> = {},
): WithinMarketArbMarket {
  return {
    slug: "binary-market",
    question: "Will this resolve yes?",
    askYes: 0.5,
    askNo: 0.5,
    tokenIds: {
      yes: "yes-token",
      no: "no-token",
    },
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<WithinMarketSnapshotRow> = {},
): WithinMarketSnapshotRow {
  return {
    tokenId: "yes-token",
    marketSlug: "binary-market",
    marketId: "market-1",
    side: "YES",
    asks: [{ price: 0.45, size: 10 }],
    bestAsk: null,
    capturedAt: 1_000,
    ...overrides,
  };
}
