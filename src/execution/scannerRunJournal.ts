import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type RecordScannerRunInput = {
  strategy: string;
  timestamp?: number;
  rawOpportunities: number;
  validatedOpportunities?: number;
  rejectedOpportunities?: number;
  dedupeSkips?: number;
  paperTrades?: number;
  durationMs: number;
  error?: string | null;
};

export type ScannerRunRecord = {
  id: string;
  strategy: string;
  timestamp: number;
  rawOpportunities: number;
  validatedOpportunities: number;
  rejectedOpportunities: number;
  dedupeSkips: number;
  paperTrades: number;
  durationMs: number;
  error: string | null;
};

export function recordScannerRun(
  input: RecordScannerRunInput
): ScannerRunRecord {
  const record: ScannerRunRecord = {
    id: uuidv4(),
    strategy: input.strategy,
    timestamp: input.timestamp ?? Date.now(),
    rawOpportunities: input.rawOpportunities,
    validatedOpportunities: input.validatedOpportunities ?? 0,
    rejectedOpportunities: input.rejectedOpportunities ?? 0,
    dedupeSkips: input.dedupeSkips ?? 0,
    paperTrades: input.paperTrades ?? 0,
    durationMs: input.durationMs,
    error: input.error ?? null
  };

  getDb()
    .prepare(
      `
      INSERT INTO scanner_runs (
        id,
        strategy,
        timestamp,
        raw_opportunities,
        validated_opportunities,
        rejected_opportunities,
        dedupe_skips,
        paper_trades,
        duration_ms,
        error
      ) VALUES (
        @id,
        @strategy,
        @timestamp,
        @rawOpportunities,
        @validatedOpportunities,
        @rejectedOpportunities,
        @dedupeSkips,
        @paperTrades,
        @durationMs,
        @error
      )
      `
    )
    .run(record);

  return record;
}
