export type MetricsSnapshot = {
  botScanCyclesTotal: number;
  botOpportunitiesFoundTotal: number;
  botPaperTradesTotal: number;
  botLiveTradesTotal: number;
  botErrorsTotal: number;
};

const counters: MetricsSnapshot = {
  botScanCyclesTotal: 0,
  botOpportunitiesFoundTotal: 0,
  botPaperTradesTotal: 0,
  botLiveTradesTotal: 0,
  botErrorsTotal: 0
};

export function resetMetrics(snapshot: Partial<MetricsSnapshot> = {}): void {
  counters.botScanCyclesTotal = snapshot.botScanCyclesTotal ?? 0;
  counters.botOpportunitiesFoundTotal =
    snapshot.botOpportunitiesFoundTotal ?? 0;
  counters.botPaperTradesTotal = snapshot.botPaperTradesTotal ?? 0;
  counters.botLiveTradesTotal = snapshot.botLiveTradesTotal ?? 0;
  counters.botErrorsTotal = snapshot.botErrorsTotal ?? 0;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return { ...counters };
}

export function incrementScanCycles(): void {
  counters.botScanCyclesTotal += 1;
}

export function addOpportunitiesFound(count: number): void {
  counters.botOpportunitiesFoundTotal += count;
}

export function addPaperTrades(count: number): void {
  counters.botPaperTradesTotal += count;
}

export function addLiveTrades(count: number): void {
  counters.botLiveTradesTotal += count;
}

export function incrementErrors(): void {
  counters.botErrorsTotal += 1;
}

export function renderPrometheusMetrics(
  snapshot: MetricsSnapshot = getMetricsSnapshot()
): string {
  return [
    "# TYPE bot_scan_cycles_total counter",
    `bot_scan_cycles_total ${snapshot.botScanCyclesTotal}`,
    "# TYPE bot_opportunities_found_total counter",
    `bot_opportunities_found_total ${snapshot.botOpportunitiesFoundTotal}`,
    "# TYPE bot_paper_trades_total counter",
    `bot_paper_trades_total ${snapshot.botPaperTradesTotal}`,
    "# TYPE bot_live_trades_total counter",
    `bot_live_trades_total ${snapshot.botLiveTradesTotal}`,
    "# TYPE bot_errors_total counter",
    `bot_errors_total ${snapshot.botErrorsTotal}`,
    ""
  ].join("\n");
}
