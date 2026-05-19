import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { reconcileLivePnl } from "../src/execution/reconciliation.js";

const testDbPath = join("logs", "reconciliation-test.db");

describe("reconcileLivePnl", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("skips when no address is configured", async () => {
    const logger = { info: vi.fn() };
    const fetchPositions = vi.fn();
    const fetchActivity = vi.fn();

    await expect(
      reconcileLivePnl(undefined, {
        fetchPositions,
        fetchActivity,
        logger
      })
    ).resolves.toEqual({
      skipped: true,
      positionsProcessed: 0,
      activityProcessed: 0,
      suspectLiveTradesMarked: 0
    });

    expect(logger.info).toHaveBeenCalledWith(
      "reconciliation skipped: no address"
    );
    expect(fetchPositions).not.toHaveBeenCalled();
    expect(fetchActivity).not.toHaveBeenCalled();
  });

  it("processes mocked positions and activity without computing PnL", async () => {
    const logger = { info: vi.fn() };
    const fetchPositions = vi.fn().mockResolvedValue([
      { asset: "token-1", size: 1 },
      { asset: "token-2", size: 2 }
    ]);
    const fetchActivity = vi.fn().mockResolvedValue([{ type: "TRADE" }]);

    await expect(
      reconcileLivePnl("0x0000000000000000000000000000000000000000", {
        fetchPositions,
        fetchActivity,
        logger
      })
    ).resolves.toEqual({
      skipped: false,
      positionsProcessed: 2,
      activityProcessed: 1,
      suspectLiveTradesMarked: 0
    });

    expect(fetchPositions).toHaveBeenCalledWith(
      "0x0000000000000000000000000000000000000000"
    );
    expect(fetchActivity).toHaveBeenCalledWith(
      "0x0000000000000000000000000000000000000000"
    );
    expect(countPaperRowsWithPnl()).toBe(0);
  });

  it("marks live trades without actual_fill_price as suspect", async () => {
    const db = initDb(testDbPath);
    db.prepare(
      `
      INSERT INTO live_trades (
        id,
        strategy,
        side,
        size_usd,
        entry_price,
        actual_fill_price,
        exit_stamping_suspect,
        timestamp
      ) VALUES (
        @id,
        @strategy,
        @side,
        @sizeUsd,
        @entryPrice,
        @actualFillPrice,
        @exitStampingSuspect,
        @timestamp
      )
      `
    ).run({
      id: "live-missing-fill",
      strategy: "neg_risk_bracket_arb",
      side: "NO",
      sizeUsd: 1,
      entryPrice: 0.5,
      actualFillPrice: null,
      exitStampingSuspect: 0,
      timestamp: 1
    });
    db.prepare(
      `
      INSERT INTO live_trades (
        id,
        strategy,
        side,
        size_usd,
        entry_price,
        actual_fill_price,
        exit_stamping_suspect,
        timestamp
      ) VALUES (
        @id,
        @strategy,
        @side,
        @sizeUsd,
        @entryPrice,
        @actualFillPrice,
        @exitStampingSuspect,
        @timestamp
      )
      `
    ).run({
      id: "live-with-fill",
      strategy: "neg_risk_bracket_arb",
      side: "NO",
      sizeUsd: 1,
      entryPrice: 0.5,
      actualFillPrice: 0.51,
      exitStampingSuspect: 0,
      timestamp: 2
    });

    const result = await reconcileLivePnl(
      "0x0000000000000000000000000000000000000000",
      {
        fetchPositions: async () => [],
        fetchActivity: async () => [],
        logger: { info: vi.fn() }
      }
    );

    expect(result.suspectLiveTradesMarked).toBe(1);
    expect(getExitStampingSuspect("live-missing-fill")).toBe(1);
    expect(getExitStampingSuspect("live-with-fill")).toBe(0);
  });

  it("contains no live order integration", () => {
    const source = [
      readFileSync("src/execution/reconciliation.ts", "utf8"),
      readFileSync("src/utils/polymarketDataApi.ts", "utf8")
    ].join("\n");

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toContain("createAndPostOrder");
    expect(source).not.toContain("placeOrder");
    expect(source).not.toContain("postOrder");
    expect(source).not.toContain("buyLimit");
    expect(source).not.toContain("sellPosition");
  });
});

function countPaperRowsWithPnl(): number {
  return (
    initDb(testDbPath)
      .prepare<{ count: number }>(
        "SELECT COUNT(*) AS count FROM paper_trades WHERE pnl IS NOT NULL OR resolved != 0"
      )
      .get()?.count ?? 0
  );
}

function getExitStampingSuspect(id: string): number | undefined {
  return initDb(testDbPath)
    .prepare<{ exit_stamping_suspect: number }>(
      "SELECT exit_stamping_suspect FROM live_trades WHERE id = ?"
    )
    .get(id)?.exit_stamping_suspect;
}
