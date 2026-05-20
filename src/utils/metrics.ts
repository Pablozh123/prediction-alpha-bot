export type MetricsSnapshot = {
  botScanCyclesTotal: number;
  botOpportunitiesFoundTotal: number;
  botPaperTradesTotal: number;
  botLiveTradesTotal: number;
  botErrorsTotal: number;
  botScanOverlapSkipsTotal: number;
  botScanCycleDurationMsLast: number;
  botScanCycleDurationMsSum: number;
  botScanCycleDurationMsCount: number;
};

const counters: MetricsSnapshot = {
  botScanCyclesTotal: 0,
  botOpportunitiesFoundTotal: 0,
  botPaperTradesTotal: 0,
  botLiveTradesTotal: 0,
  botErrorsTotal: 0,
  botScanOverlapSkipsTotal: 0,
  botScanCycleDurationMsLast: 0,
  botScanCycleDurationMsSum: 0,
  botScanCycleDurationMsCount: 0
};

export function resetMetrics(snapshot: Partial<MetricsSnapshot> = {}): void {
  counters.botScanCyclesTotal = snapshot.botScanCyclesTotal ?? 0;
  counters.botOpportunitiesFoundTotal =
    snapshot.botOpportunitiesFoundTotal ?? 0;
  counters.botPaperTradesTotal = snapshot.botPaperTradesTotal ?? 0;
  counters.botLiveTradesTotal = snapshot.botLiveTradesTotal ?? 0;
  counters.botErrorsTotal = snapshot.botErrorsTotal ?? 0;
  counters.botScanOverlapSkipsTotal = snapshot.botScanOverlapSkipsTotal ?? 0;
  counters.botScanCycleDurationMsLast =
    snapshot.botScanCycleDurationMsLast ?? 0;
  counters.botScanCycleDurationMsSum =
    snapshot.botScanCycleDurationMsSum ?? 0;
  counters.botScanCycleDurationMsCount =
    snapshot.botScanCycleDurationMsCount ?? 0;
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

export function incrementScanOverlapSkips(): void {
  counters.botScanOverlapSkipsTotal += 1;
}

export function observeScanCycleDuration(durationMs: number): void {
  const safeDuration = Number.isFinite(durationMs)
    ? Math.max(0, Math.round(durationMs))
    : 0;

  counters.botScanCycleDurationMsLast = safeDuration;
  counters.botScanCycleDurationMsSum += safeDuration;
  counters.botScanCycleDurationMsCount += 1;
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
    "# TYPE bot_scan_overlap_skips_total counter",
    `bot_scan_overlap_skips_total ${snapshot.botScanOverlapSkipsTotal}`,
    "# TYPE bot_scan_cycle_duration_ms gauge",
    `bot_scan_cycle_duration_ms ${snapshot.botScanCycleDurationMsLast}`,
    "# TYPE bot_scan_cycle_duration_ms_sum counter",
    `bot_scan_cycle_duration_ms_sum ${snapshot.botScanCycleDurationMsSum}`,
    "# TYPE bot_scan_cycle_duration_ms_count counter",
    `bot_scan_cycle_duration_ms_count ${snapshot.botScanCycleDurationMsCount}`,
    ""
  ].join("\n");
}
