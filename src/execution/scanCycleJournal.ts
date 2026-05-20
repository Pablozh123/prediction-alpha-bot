import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type RecordScanCycleInput = {
  success: boolean;
  opportunities: number;
  paperTrades: number;
  skippedDuplicates: number;
  rejectedOpportunities: number;
  error?: string;
  timestamp?: number;
};

export type ScanCycleRecord = {
  id: string;
  timestamp: number;
  success: boolean;
  opportunities: number;
  paperTrades: number;
  skippedDuplicates: number;
  rejectedOpportunities: number;
  error: string | null;
};

export function recordScanCycle(input: RecordScanCycleInput): ScanCycleRecord {
  const record: ScanCycleRecord = {
    id: uuidv4(),
    timestamp: input.timestamp ?? Date.now(),
    success: input.success,
    opportunities: input.opportunities,
    paperTrades: input.paperTrades,
    skippedDuplicates: input.skippedDuplicates,
    rejectedOpportunities: input.rejectedOpportunities,
    error: input.error ?? null
  };

  getDb()
    .prepare(
      `
      INSERT INTO scan_cycles (
        id,
        timestamp,
        success,
        opportunities,
        paper_trades,
        skipped_duplicates,
        rejected_opportunities,
        error
      ) VALUES (
        @id,
        @timestamp,
        @success,
        @opportunities,
        @paperTrades,
        @skippedDuplicates,
        @rejectedOpportunities,
        @error
      )
      `
    )
    .run({
      ...record,
      success: record.success ? 1 : 0
    });

  return record;
}
