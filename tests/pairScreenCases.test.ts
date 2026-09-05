import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  screenTitlePair,
  type PairScreenVerdict,
} from "../src/scanner/crossVenueQuestionMatch.js";

type ScreenCase = {
  id: string;
  polymarket: { title: string; end?: string };
  kalshi: { title: string; ticker?: string; end?: string };
  expected: PairScreenVerdict;
  source: string;
};

type ScreenCaseFile = {
  schema: string;
  vocabulary: PairScreenVerdict[];
  resolution_gap_tolerance_days: number;
  cases: ScreenCase[];
};

const FILE = JSON.parse(
  readFileSync(new URL("../config/pair_screen_cases.json", import.meta.url), "utf8"),
) as ScreenCaseFile;

/**
 * The shared specification of stage 1 of the pair protocol. The website's
 * matcher runs the same file; a case that passes here and fails there, or
 * the other way round, is a bug in one of the two, never a matter of taste.
 */
describe("pair screen cases", () => {
  it("is the file both repositories read", () => {
    expect(FILE.schema).toBe("pair_screen_cases/1");
    expect(FILE.vocabulary).toEqual([
      "passed",
      "inverted",
      "different_question",
      "compound_market",
      "resolution_time_mismatch",
    ]);
    expect(FILE.resolution_gap_tolerance_days).toBe(7);
    expect(FILE.cases.length).toBeGreaterThanOrEqual(15);
    expect(new Set(FILE.cases.map((entry) => entry.id)).size).toBe(FILE.cases.length);
  });

  for (const entry of FILE.cases) {
    it(`${entry.id}: ${entry.expected}`, () => {
      const result = screenTitlePair({
        polymarketTitle: entry.polymarket.title,
        kalshiTitle: entry.kalshi.title,
        kalshiTicker: entry.kalshi.ticker ?? null,
        polymarketEnd: entry.polymarket.end ?? null,
        kalshiEnd: entry.kalshi.end ?? null,
        toleranceDays: FILE.resolution_gap_tolerance_days,
      });

      expect(result.verdict, `${entry.id} (${entry.source}): ${result.reasons.join("; ")}`).toBe(
        entry.expected,
      );
    });
  }
});
