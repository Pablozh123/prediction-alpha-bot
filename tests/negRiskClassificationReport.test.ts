import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { recordOpportunity } from "../src/execution/opportunityJournal.js";
import { recordOpportunityLegs } from "../src/execution/opportunityLegJournal.js";
import { recordPaperTrade } from "../src/execution/tradeJournal.js";
import { runNegRiskClassificationReport } from "../src/scripts/negRiskClassificationReport.js";

const testDbPath = join("logs", "neg-risk-classification-test.db");
const nowMs = Date.parse("2026-05-29T12:00:00.000Z");

describe("NEG_RISK classification report", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    rmSync(join("docs", "reports", "neg-risk-classification-2099-01-03.md"), {
      force: true,
    });
  });

  it("separates clean, duration-risk, and directional paper fires", () => {
    const clean = recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "2026-nba-champion",
      status: "paper_fired",
      reason: "paper_trade_recorded",
      expectedResolutionAt: nowMs + 60 * 60 * 1000,
      timestamp: nowMs,
    });
    recordOpportunityLegs([
      {
        opportunityId: clean.id,
        strategy: "neg_risk_bracket_arb",
        slug: "will-the-knicks-win-the-2026-nba-finals",
        question: "Will the Knicks win the 2026 NBA Finals?",
        tokenId: "clean-no",
        side: "NO",
        fillable: true,
        legIndex: 0,
        timestamp: nowMs,
      },
    ]);
    recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      slug: "will-the-knicks-win-the-2026-nba-finals",
      tokenId: "clean-no",
      opportunityId: clean.id,
      side: "NO",
      sizeUsd: 0.5,
      entryPrice: 0.5,
      timestamp: nowMs,
    });

    const risky = recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "what-will-happen-before-gta-vi",
      status: "paper_fired",
      reason: "paper_trade_recorded",
      timestamp: nowMs,
    });
    recordOpportunityLegs([
      {
        opportunityId: risky.id,
        strategy: "neg_risk_bracket_arb",
        slug: "will-bitcoin-hit-1m-before-gta-vi",
        question: "Will Bitcoin hit $1m before GTA VI?",
        tokenId: "risky-no",
        side: "NO",
        fillable: true,
        legIndex: 0,
        timestamp: nowMs,
      },
    ]);

    const report = runNegRiskClassificationReport({
      dbPath: testDbPath,
      reportDate: "2099-01-03",
    });

    expect(report).toContain("| clean_arb | 1 |");
    expect(report).toContain("| directional_bucket | 1 |");
    expect(report).toContain("- Risky legacy paper-fired baskets: 1");
    expect(report).toContain("what-will-happen-before-gta-vi");
    expect(report).not.toContain("secret-token");
  });
});
