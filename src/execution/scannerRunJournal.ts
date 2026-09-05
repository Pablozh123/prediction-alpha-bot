import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type RecordScannerRunInput = {
  strategy: string;
  timestamp?: number;
  /** Candidates with a positive gross edge at the quote (or at the book). */
  rawOpportunities: number;
  /**
   * Candidates inside the watch band whose quote and book showed no gross
   * edge. Counted so the funnel can say how wide the net was cast, kept out
   * of `rawOpportunities` so the funnel stays readable.
   */
  nearMissOpportunities?: number;
  validatedOpportunities?: number;
  /** Structurally clean and above the hurdle, but carry or unreviewed. */
  candidateOpportunities?: number;
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
  nearMissOpportunities: number;
  validatedOpportunities: number;
  candidateOpportunities: number;
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
    nearMissOpportunities: input.nearMissOpportunities ?? 0,
    validatedOpportunities: input.validatedOpportunities ?? 0,
    candidateOpportunities: input.candidateOpportunities ?? 0,
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
        near_miss_opportunities,
        validated_opportunities,
        candidate_opportunities,
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
        @nearMissOpportunities,
        @validatedOpportunities,
        @candidateOpportunities,
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
