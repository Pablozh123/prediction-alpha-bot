import { rmSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import {
  closeHealthServer,
  getHealthPayload,
  renderHealthJson,
  startHealthServer
} from "../src/utils/health.js";
import {
  addLiveTrades,
  addOpportunitiesFound,
  addPaperTrades,
  getMetricsSnapshot,
  incrementErrors,
  incrementScanCycles,
  renderPrometheusMetrics,
  resetMetrics
} from "../src/utils/metrics.js";
import { runScanCycle } from "../src/scanner/runScanCycle.js";

const testDbPath = join("logs", "metrics-test.db");

describe("health and metrics", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
    resetMetrics();
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    delete process.env.POLYMARKET_PRIVATE_KEY;
    delete process.env.API_KEY;
  });

  it("renders health JSON without secrets", () => {
    process.env.POLYMARKET_PRIVATE_KEY = "super-secret-private-key";

    const payload = getHealthPayload(11_000, 1_000);
    const json = renderHealthJson(payload);

    expect(JSON.parse(json)).toEqual({
      status: "ok",
      paperOnly: true,
      uptimeSeconds: 10
    });
    expect(json).not.toContain("super-secret-private-key");
    expect(json).not.toContain("POLYMARKET_PRIVATE_KEY");
  });

  it("renders Prometheus-style metrics text", () => {
    incrementScanCycles();
    addOpportunitiesFound(3);
    addPaperTrades(7);
    addLiveTrades(0);
    incrementErrors();

    expect(getMetricsSnapshot()).toEqual({
      botScanCyclesTotal: 1,
      botOpportunitiesFoundTotal: 3,
      botPaperTradesTotal: 7,
      botLiveTradesTotal: 0,
      botErrorsTotal: 1
    });
    expect(renderPrometheusMetrics()).toBe(
      [
        "# TYPE bot_scan_cycles_total counter",
        "bot_scan_cycles_total 1",
        "# TYPE bot_opportunities_found_total counter",
        "bot_opportunities_found_total 3",
        "# TYPE bot_paper_trades_total counter",
        "bot_paper_trades_total 7",
        "# TYPE bot_live_trades_total counter",
        "bot_live_trades_total 0",
        "# TYPE bot_errors_total counter",
        "bot_errors_total 1",
        ""
      ].join("\n")
    );
  });

  it("does not render configured secrets in metrics", () => {
    process.env.API_KEY = "secret-api-key";

    const metrics = renderPrometheusMetrics({
      botScanCyclesTotal: 1,
      botOpportunitiesFoundTotal: 2,
      botPaperTradesTotal: 3,
      botLiveTradesTotal: 0,
      botErrorsTotal: 4
    });

    expect(metrics).toContain("bot_scan_cycles_total 1");
    expect(metrics).not.toContain("secret-api-key");
    expect(metrics).not.toContain("API_KEY");
  });

  it("serves /health and /metrics over local HTTP", async () => {
    const server = startHealthServer({
      port: 0,
      logger: {
        info: vi.fn(),
        error: vi.fn()
      }
    });

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address() as AddressInfo;
      const health = await readLocalHttp(address.port, "/health");
      const metrics = await readLocalHttp(address.port, "/metrics");

      expect(JSON.parse(health)).toMatchObject({
        status: "ok",
        paperOnly: true
      });
      expect(metrics).toContain("bot_scan_cycles_total");
      expect(metrics).toContain("bot_live_trades_total");
    } finally {
      await closeHealthServer(server);
    }
  });

  it("increments scan metrics from the scan cycle", async () => {
    const execute = vi.fn();

    await runScanCycle({
      execute,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      },
      scanner: async () => [
        {
          eventSlug: "rate-cuts-2026",
          sumYes: 1.06,
          threshold: 1.03,
          expectedEdge: 0.03,
          reason: "needs_orderbook_depth_check",
          legs: [
            {
              marketId: "m1",
              slug: "zero-cuts",
              question: "Zero cuts?",
              yesTokenId: "m1-yes",
              noTokenId: "m1-no",
              yesPrice: 0.4,
              sideToPaperTrade: "NO"
            }
          ]
        }
      ]
    });

    expect(getMetricsSnapshot()).toMatchObject({
      botScanCyclesTotal: 1,
      botOpportunitiesFoundTotal: 1,
      botPaperTradesTotal: 1,
      botLiveTradesTotal: 0,
      botErrorsTotal: 0
    });
  });
});

function readLocalHttp(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        method: "GET",
        path,
        port
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve(body));
      }
    );

    req.on("error", reject);
    req.end();
  });
}
