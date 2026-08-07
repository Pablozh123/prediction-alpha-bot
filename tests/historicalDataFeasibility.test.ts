import { describe, expect, it } from "vitest";
import {
  buildHistoricalDataFeasibilityReport,
  renderHistoricalDataFeasibilityMarkdown,
  type FeasibilityCheck,
  type LocalHistoricalDataState
} from "../src/scripts/historicalDataFeasibility.js";

describe("historical data feasibility", () => {
  it("does not mark true historical orderbook backtests as ready without snapshots", () => {
    const report = buildHistoricalDataFeasibilityReport({
      checks: [dataApiCheck("skipped")],
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      local: makeLocalState({
        orderbookSnapshotTable: false,
        orderbookSnapshots: 0
      }),
      networkMode: "offline"
    });

    expect(report.verdict).toEqual({
      trueHistoricalOrderbookBacktest: "not_ready",
      tradePrintProxyBacktest: "not_ready",
      forwardOrderbookReplay: "needs_snapshot_table"
    });
  });

  it("allows trade-print proxy research when Data API activity is available", () => {
    const report = buildHistoricalDataFeasibilityReport({
      checks: [dataApiCheck("available")],
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      local: makeLocalState({
        orderbookSnapshotTable: true,
        orderbookSnapshots: 12
      }),
      networkMode: "online"
    });

    expect(report.verdict).toEqual({
      trueHistoricalOrderbookBacktest: "not_ready",
      tradePrintProxyBacktest: "possible_with_caveats",
      forwardOrderbookReplay: "ready_to_collect"
    });
  });

  it("renders safety boundaries without leaking supplied secrets", () => {
    const report = buildHistoricalDataFeasibilityReport({
      checks: [
        {
          ...dataApiCheck("available"),
          evidence: "activity smoke test ok"
        }
      ],
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      local: makeLocalState({}),
      networkMode: "online"
    });
    const markdown = renderHistoricalDataFeasibilityMarkdown(report);

    expect(markdown).toContain("No orders are placed");
    expect(markdown).toContain("True historical orderbook backtest");
    expect(markdown).not.toContain("super-secret-private-key");
  });
});

function dataApiCheck(status: FeasibilityCheck["status"]): FeasibilityCheck {
  return {
    source: "Polymarket Data API activity",
    status,
    evidence: status === "available" ? "10 activity rows" : "not checked",
    backtestUse: "Historical trade-print proxy research.",
    limitation: "No resting orderbook depth."
  };
}

function makeLocalState(
  overrides: Partial<LocalHistoricalDataState>
): LocalHistoricalDataState {
  return {
    dbExists: true,
    opportunities: 0,
    paperTrades: 0,
    unlinkedPaperTrades: 0,
    orderbookSnapshotTable: true,
    orderbookSnapshots: 0,
    opportunityLegs: 0,
    sampleTokenId: null,
    ...overrides
  };
}
