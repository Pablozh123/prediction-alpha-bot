import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { executeOrPaper } from "../src/execution/executeOrPaper.js";
import { listRecentPaperTrades } from "../src/execution/tradeJournal.js";

const testDbPath = join("logs", "execute-or-paper-test.db");

describe("executeOrPaper", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("writes a paper trade in paper-only mode", () => {
    const result = executeOrPaper({
      strategy: "neg_risk_bracket_arb",
      slug: "rate-cuts-2026",
      question: "How many rate cuts in 2026?",
      tokenId: "token-no",
      opportunityId: "opp-1",
      side: "NO",
      entryPrice: 0.66,
      paperSizeUsd: 10,
      paperSizeShares: 15.151515,
      arbClass: "neg_risk_bracket_arb"
    });

    expect(result).toMatchObject({
      paper: true,
      live: false,
      reason: "paper_only"
    });
    expect(listRecentPaperTrades(10)).toEqual([result.paperTrade]);
    expect(result.paperTrade).toMatchObject({
      strategy: "neg_risk_bracket_arb",
      slug: "rate-cuts-2026",
      question: "How many rate cuts in 2026?",
      tokenId: "token-no",
      opportunityId: "opp-1",
      side: "NO",
      sizeUsd: 10,
      sizeShares: 15.151515,
      entryPrice: 0.66,
      arbClass: "neg_risk_bracket_arb",
      linkStatus: "linked"
    });
  });

  it("refuses a paper trade that cannot be joined to a candidate", () => {
    expect(() =>
      executeOrPaper({
        strategy: "neg_risk_bracket_arb",
        tokenId: "token-no",
        opportunityId: "   ",
        side: "NO",
        entryPrice: 0.66,
        paperSizeUsd: 10
      })
    ).toThrow();
    expect(listRecentPaperTrades(10)).toHaveLength(0);
  });

  it("rejects a live request because live trading is not implemented", () => {
    const result = executeOrPaper({
      strategy: "neg_risk_bracket_arb",
      slug: "rate-cuts-2026",
      question: "How many rate cuts in 2026?",
      tokenId: "token-no",
      opportunityId: "opp-1",
      side: "NO",
      entryPrice: 0.66,
      paperSizeUsd: 10,
      liveSizeUsd: 1,
      arbClass: "neg_risk_bracket_arb"
    });

    expect(result).toMatchObject({
      paper: true,
      live: false,
      reason: "live_not_implemented"
    });
    expect(listRecentPaperTrades(10)).toHaveLength(1);
  });

  it("rejects invalid inputs before writing a paper trade", () => {
    expect(() =>
      executeOrPaper({
        strategy: "",
        tokenId: "token-no",
        opportunityId: "opp-1",
        side: "NO",
        entryPrice: 1.2,
        paperSizeUsd: 0
      })
    ).toThrow();

    expect(listRecentPaperTrades(10)).toEqual([]);
  });

  it("refuses a fill at zero: it is not a fill", () => {
    expect(() =>
      executeOrPaper({
        strategy: "neg_risk_bracket_arb",
        tokenId: "token-no",
        opportunityId: "opp-1",
        side: "NO",
        entryPrice: 0,
        paperSizeUsd: 1
      })
    ).toThrow();

    expect(listRecentPaperTrades(10)).toEqual([]);
  });
});
