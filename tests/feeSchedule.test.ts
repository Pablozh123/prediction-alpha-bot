import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FEE_MODEL_VERSION,
  FEE_SOURCES,
  KALSHI_MAKER_RATE,
  KALSHI_TAKER_RATE,
  POLYMARKET_DEFAULT_CATEGORY,
  POLYMARKET_MAKER_RATE,
  POLYMARKET_RATE_DISPUTE_NOTE,
  POLYMARKET_TAKER_RATES,
} from "../src/core/venueFees.js";

type FeeSchedule = {
  schema: string;
  version: string;
  sources: { polymarket: string; kalshi: string };
  polymarket: {
    taker_rates_by_category: Record<string, number>;
    default_category: string;
    maker_rate: number;
    general_rate_dispute: { documented: number; secondary_sources: number; used: string };
  };
  kalshi: { taker_rate: number; maker_rate: number };
};

const FILE = JSON.parse(
  readFileSync(new URL("../config/fee_schedule_2026-07-30.json", import.meta.url), "utf8"),
) as FeeSchedule;

/**
 * The fee table exists twice, once per language. This file is the one both
 * repositories check themselves against, so a rate changed in one place and
 * not the other fails a test instead of shifting every net figure quietly.
 */
describe("fee schedule parity", () => {
  it("matches the constants in venueFees.ts", () => {
    expect(FILE.schema).toBe("fee_schedule/1");
    expect(FILE.version).toBe(FEE_MODEL_VERSION);
    expect(FILE.sources).toEqual(FEE_SOURCES);
    expect(FILE.polymarket.taker_rates_by_category).toEqual(POLYMARKET_TAKER_RATES);
    expect(FILE.polymarket.default_category).toBe(POLYMARKET_DEFAULT_CATEGORY);
    expect(FILE.polymarket.maker_rate).toBe(POLYMARKET_MAKER_RATE);
    expect(FILE.kalshi.taker_rate).toBe(KALSHI_TAKER_RATE);
    expect(FILE.kalshi.maker_rate).toBe(KALSHI_MAKER_RATE);
  });

  it("carries the disputed general rate the way the note describes it", () => {
    expect(FILE.polymarket.general_rate_dispute.documented).toBe(
      POLYMARKET_TAKER_RATES[POLYMARKET_DEFAULT_CATEGORY],
    );
    expect(FILE.polymarket.general_rate_dispute.used).toBe("documented");
    expect(POLYMARKET_RATE_DISPUTE_NOTE).toContain("5%");
    expect(POLYMARKET_RATE_DISPUTE_NOTE).toContain("3%");
    expect(FILE.polymarket.general_rate_dispute.secondary_sources).toBe(0.03);
  });
});
