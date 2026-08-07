import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCleanForwardRunConfig,
  getCleanForwardStatus,
  startCleanForwardRun,
  toPublicCleanForwardRunConfig,
} from "../src/scripts/cleanForwardRun.js";

const testDbPath = join("logs", "forward-clean-test.db");

describe("clean forward run controls", () => {
  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(testDbPath.replace(/\.db$/u, ".pid"), { force: true });
    rmSync(testDbPath.replace(/\.db$/u, ".out.log"), { force: true });
    rmSync(testDbPath.replace(/\.db$/u, ".err.log"), { force: true });
  });

  it("builds the default 24h paper-only forward-run configuration", () => {
    const config = buildCleanForwardRunConfig({
      date: "2026-05-22",
      env: {
        TELEGRAM_ALERTS_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "secret-chat",
      },
    });

    expect(config).toMatchObject({
      date: "2026-05-22",
      dbPath: resolve("logs", "forward-clean-2026-05-22.db"),
      maxScanCycles: 8_640,
      scanIntervalMs: 30_000,
      telegramDailyReportEnabled: true,
    });
    expect(config.env).toMatchObject({
      CLEAN_BASKET_FILTER_ENABLED: "true",
      CLEAN_BASKET_MAX_LEG_SPREAD_BPS: "250",
      CLEAN_BASKET_MIN_EDGE_BPS: "100",
      CLEAN_BASKET_MIN_LEG_DEPTH_USD: "100",
      CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD: "100",
      CLEAN_BASKET_MIN_ROI_BPS: "100",
      DATABASE_PATH: resolve("logs", "forward-clean-2026-05-22.db"),
      FAST_SCAN_ENABLED: "true",
      FAST_SCAN_INTERVAL_MS: "10000",
      MAX_SCAN_CYCLES: "8640",
      MAX_SHORT_ARB_DURATION_HOURS: "72",
      ORDERBOOK_SNAPSHOT_ENABLED: "true",
      ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT: "400",
      ORDERBOOK_SNAPSHOT_INTERVAL_MS: "300000",
      ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET: "16",
      ORDERBOOK_SNAPSHOT_TOKEN_LIMIT: "160",
      PAPER_FIRE_COOLDOWN_MS: "21600000",
      PAPER_ONLY: "true",
      TELEGRAM_DAILY_REPORT_ENABLED: "true",
    });
  });

  it("does not expose Telegram secrets in public dry-run config", () => {
    const config = buildCleanForwardRunConfig({
      dbPath: testDbPath,
      env: {
        TELEGRAM_ALERTS_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_CHAT_ID: "secret-chat",
      },
    });

    expect(JSON.stringify(toPublicCleanForwardRunConfig(config))).not.toContain(
      "secret-token",
    );
    expect(JSON.stringify(toPublicCleanForwardRunConfig(config))).not.toContain(
      "secret-chat",
    );
  });

  it("supports dry-run start without creating a process", () => {
    const result = startCleanForwardRun({
      dbPath: testDbPath,
      dryRun: true,
      env: { TELEGRAM_ALERTS_ENABLED: "false" },
    });

    expect(result).toMatchObject({
      dryRun: true,
      pid: null,
      running: false,
    });
    expect(result.config.dbPath).toBe(resolve(testDbPath));
  });

  it("reports missing PID and empty DB state safely", async () => {
    const status = await getCleanForwardStatus({
      checkHealth: false,
      dbPath: testDbPath,
    });

    expect(status).toMatchObject({
      pid: null,
      pidFileExists: false,
      running: false,
      db: {
        exists: false,
        liveTrades: 0,
        opportunities: 0,
        paperTrades: 0,
      },
      health: {
        ok: false,
        detail: "health_check_skipped",
      },
    });
  });
});
