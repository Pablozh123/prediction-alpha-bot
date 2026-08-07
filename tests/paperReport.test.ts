import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { recordPaperTrade } from "../src/execution/tradeJournal.js";
import { runPaperReport } from "../src/scripts/paperReport.js";

const testDbPath = join("logs", "paper-report-test.db");
const reportPath = join("docs", "reports", "paper-report-2099-01-02.md");

describe("paper report", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    rmSync(reportPath, { force: true });
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    rmSync(reportPath, { force: true });
  });

  it("reads the explicit DB path instead of the default journal", () => {
    initDb(testDbPath);
    recordPaperTrade({
      strategy: "within_market_yes_no_arb",
      side: "YES",
      sizeUsd: 1,
      entryPrice: 0.5,
      timestamp: 1
    });
    closeDb();

    const report = runPaperReport({
      dbPath: testDbPath,
      reportDate: "2099-01-02"
    });

    expect(report).toContain(testDbPath);
    expect(report).toContain("| within_market_yes_no_arb | 1 |");
    expect(report).not.toContain("TELEGRAM_BOT_TOKEN");
  });
});
