import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../src/execution/db.js";
import { arbScanSchema } from "../src/publisher/arbScanPublisher.js";
import { buildFixtureSnapshot, writeFixture } from "../src/scripts/arbScanFixture.js";

describe("arb_scan fixture", () => {
  let dir: string;

  beforeEach(() => {
    closeDb();
    dir = mkdtempSync(join(tmpdir(), "arb-scan-fixture-test-"));
  });

  afterEach(() => {
    closeDb();
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds a schema-valid, reproducible feed with one row per class, status and gate", () => {
    const first = buildFixtureSnapshot(join(dir, "a.db"));
    const second = buildFixtureSnapshot(join(dir, "b.db"));

    expect(arbScanSchema.safeParse(first).success).toBe(true);
    // random journal ids are rewritten, so two builds are identical
    expect(second).toEqual(first);

    expect(first.chances.map((row) => [row.strategy, row.rule_screen, row.rule_review])).toEqual([
      ["cross_venue_yes_no_arb", "passed", "equivalent"],
      ["within_market_fast_arb", "structural", null],
    ]);
    expect(first.carry_candidates.map((row) => [row.class, row.capital_lock_class])).toEqual([
      ["cross_venue_complement", "long"],
      ["neg_risk_no_basket", "long"],
    ]);
    expect(first.rejected_examples.map((entry) => [entry.reason, entry.gate])).toEqual([
      ["multi_winner_or_qualifier_basket", 1],
      ["question_type_mismatch", 1],
      ["rule_review_not_equivalent", 1],
      ["non_positive_executable_edge", 3],
      ["below_annualized_hurdle", 4],
      ["near_resolution_watch", 5],
    ]);
    expect(first.pairs.map((pair) => [pair.rule_review, pair.hedged])).toEqual([
      ["equivalent", true],
      ["not_equivalent", false],
      ["none", false],
      ["none", false],
    ]);
    expect(first.summary.near_miss_24h).toBe(612);
    expect(first.health.scan_interval_ms).toBe(30_000);
    expect(first.health.configured_interval_ms).toBe(10_000);

    const structureFailed = first.opportunities.find(
      (row) => row.rejection_reason === "multi_winner_or_qualifier_basket",
    );

    expect(structureFailed).toMatchObject({
      gate_failed: 1,
      gross_edge_bps: null,
      executable_net_edge_bps: null,
      annualized_pct: null,
      hurdle_met: null,
    });
  });

  it("writes the fixture file without any local path in it", () => {
    const written = writeFixture(join(dir, "out", "arb_scan_example.json"));
    const text = readFileSync(written.path, "utf8");

    expect(written.bytes).toBeGreaterThan(10_000);
    expect(text).not.toMatch(/[A-Za-z]:\\/u);
    expect(text).not.toMatch(/\/Users\//u);
    expect(JSON.parse(text)).toMatchObject({ schema: "arb_scan/2" });
  });
});
