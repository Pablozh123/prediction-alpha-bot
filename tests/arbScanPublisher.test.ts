import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { recordOpportunity, updateOpportunityStatus } from "../src/execution/opportunityJournal.js";
import { recordOpportunityLegs } from "../src/execution/opportunityLegJournal.js";
import { recordPaperDedupeSkip } from "../src/execution/paperDedupe.js";
import { recordScanCycle } from "../src/execution/scanCycleJournal.js";
import { recordScannerRun } from "../src/execution/scannerRunJournal.js";
import { recordPaperTrade } from "../src/execution/tradeJournal.js";
import {
  ARB_SCAN_FILENAME,
  arbScanSchema,
  buildArbScanSnapshot,
  createArbScanPublisher,
  publishArbScan,
} from "../src/publisher/arbScanPublisher.js";

const testDbPath = join("logs", "arb-scan-publisher-test.db");
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

describe("arb_scan publisher", () => {
  let publishDir: string;

  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
    publishDir = mkdtempSync(join(tmpdir(), "arb-scan-"));
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    rmSync(publishDir, { recursive: true, force: true });
  });

  it("builds a schema-valid snapshot from an empty journal with alive=true after a cycle", () => {
    recordScanCycle({
      success: true,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      timestamp: NOW - 5_000,
    });

    const snapshot = buildArbScanSnapshot({
      nowMs: NOW,
      scanIntervalMs: 10_000,
      gitSha: "abc123",
    });

    expect(arbScanSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot).toMatchObject({
      schema: "arb_scan/2",
      generated_at: "2026-09-04T12:00:00.000Z",
      generator: { repo: "prediction-alpha-bot", git_sha: "abc123", mode: "paper" },
      disclaimer: "Paper-only research. Not trading advice.",
      health: {
        last_cycle_at: "2026-09-04T11:59:55.000Z",
        cycles_24h: 1,
        errors_24h: 0,
        scan_interval_ms: 10_000,
        configured_interval_ms: 10_000,
        alive: true,
      },
      config: {
        hurdle_pct: 5,
        target_size_usd: 20,
        short_max_hours: 72,
        medium_max_days: 14,
        fee_model_version: "2026-07-30",
      },
      summary: {
        raw_candidates_24h: 0,
        near_miss_24h: 0,
        validated_24h: 0,
        candidates_24h: 0,
        paper_fired_24h: 0,
        open_paper_positions: 0,
        resolved_paper_trades: 0,
        resolved_paper_pnl_usd: null,
      },
      opportunities: [],
      chances: [],
      carry_candidates: [],
      rejected_examples: [],
      pairs: [],
      paper_positions: [],
      rejections_24h: [],
    });
    expect(snapshot.strategies.map((strategy) => [strategy.id, strategy.class])).toEqual([
      ["neg_risk_bracket_arb", "neg_risk_no_basket"],
      ["within_market_fast_arb", "same_market_complement"],
      ["clear_win_watch", "clear_win_convergence"],
      ["cross_venue_yes_no_arb", "cross_venue_complement"],
    ]);
    expect(snapshot.summary.sample_note).toContain("no PnL statement");
    // every word the website may show travels with the file
    expect(snapshot.vocabulary.classes.map((entry) => entry.id)).toContain("neg_risk_long_tail_no_carry");
    expect(snapshot.vocabulary.rejection_reasons).toContainEqual({
      id: "multi_winner_or_qualifier_basket",
      label: "legs can pay out more than once",
      gate: 1,
    });
    expect(snapshot.vocabulary.rule_review.map((entry) => entry.id)).toEqual([
      "none",
      "pending",
      "equivalent",
      "not_equivalent",
    ]);
  });

  it("reports the cadence the scanner keeps, not only the one it was configured for", () => {
    for (let index = 0; index < 8; index += 1) {
      recordScanCycle({
        success: true,
        opportunities: 0,
        paperTrades: 0,
        skippedDuplicates: 0,
        rejectedOpportunities: 0,
        timestamp: NOW - 8 * 16_000 + index * 16_000,
      });
    }

    const snapshot = buildArbScanSnapshot({ nowMs: NOW, scanIntervalMs: 10_000, gitSha: "x" });

    expect(snapshot.health.configured_interval_ms).toBe(10_000);
    expect(snapshot.health.scan_interval_ms).toBe(16_000);
  });

  it("marks the feed not alive when the last cycle is older than the stale floor", () => {
    recordScanCycle({
      success: false,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      error: "Gamma unavailable",
      timestamp: NOW - 15 * 60_000,
    });

    const snapshot = buildArbScanSnapshot({ nowMs: NOW, scanIntervalMs: 10_000, gitSha: "x" });

    expect(snapshot.health.alive).toBe(false);
    expect(snapshot.health.errors_24h).toBe(1);
    expect(snapshot.health.last_cycle_at).toBe("2026-09-04T11:45:00.000Z");
  });

  it("keeps a slow scanner alive within the ten-minute floor", () => {
    recordScanCycle({
      success: true,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      timestamp: NOW - 9 * 60_000,
    });

    const snapshot = buildArbScanSnapshot({ nowMs: NOW, scanIntervalMs: 10_000, gitSha: "x" });

    expect(snapshot.health.alive).toBe(true);
  });

  it("aggregates the window, ranks validated first by annualised return, and joins trades", () => {
    recordScanCycle({
      success: true,
      opportunities: 3,
      paperTrades: 2,
      skippedDuplicates: 1,
      rejectedOpportunities: 2,
      timestamp: NOW - 1_000,
    });
    recordScannerRun({
      strategy: "within_market_fast_arb",
      timestamp: NOW - 1_000,
      rawOpportunities: 12,
      validatedOpportunities: 1,
      rejectedOpportunities: 2,
      paperTrades: 2,
      durationMs: 50,
    });
    recordScannerRun({
      strategy: "cross_venue_yes_no_arb",
      timestamp: NOW - 1_000,
      rawOpportunities: 4,
      validatedOpportunities: 1,
      rejectedOpportunities: 1,
      durationMs: 80,
    });
    // an old row outside the window must not count
    recordScannerRun({
      strategy: "within_market_fast_arb",
      timestamp: NOW - 30 * HOUR,
      rawOpportunities: 999,
      durationMs: 1,
    });

    const fired = recordOpportunity({
      strategy: "within_market_fast_arb",
      slug: "will-it-rain",
      title: "Will it rain?",
      venues: ["polymarket"],
      tokenIds: ["yes-1", "no-1"],
      timestamp: NOW - 2 * HOUR,
      status: "raw_found",
    });
    // the same basket seen again an hour later: one published row, open 3600 s
    const firedAgain = recordOpportunity({
      strategy: "within_market_fast_arb",
      slug: "will-it-rain",
      title: "Will it rain?",
      venues: ["polymarket"],
      tokenIds: ["yes-1", "no-1"],
      timestamp: NOW - HOUR,
      status: "raw_found",
    });
    updateOpportunityStatus(firedAgain.id, {
      status: "paper_fired",
      executableEdge: 0.03,
      grossEdgeBps: 309.28,
      netEdgeBps: 53.04,
      capitalUsd: 19.4,
      depthUsd: 100,
      feeUsd: 0.5,
      daysToResolution: 2,
      annualizedPct: 96.8,
      ruleMatch: "reviewed",
      reason: "paper_trade_recorded",
    });
    recordOpportunityLegs([
      {
        opportunityId: firedAgain.id,
        strategy: "within_market_fast_arb",
        tokenId: "yes-1",
        side: "YES",
        averageFillPrice: 0.45,
        fillable: true,
        venue: "polymarket",
        role: "taker",
        sizeUsd: 9,
        feeUsd: 0.25,
        legIndex: 0,
        timestamp: NOW - HOUR,
      },
      {
        opportunityId: firedAgain.id,
        strategy: "within_market_fast_arb",
        tokenId: "no-1",
        side: "NO",
        averageFillPrice: 0.52,
        fillable: true,
        venue: "polymarket",
        role: "taker",
        sizeUsd: 10.4,
        feeUsd: 0.25,
        legIndex: 1,
        timestamp: NOW - HOUR,
      },
    ]);

    const crossVenue = recordOpportunity({
      strategy: "cross_venue_yes_no_arb",
      slug: "rubio-2028",
      title: "Will Marco Rubio win the 2028 US Presidential Election?",
      venues: ["kalshi", "polymarket"],
      tokenIds: ["KXPRESPERSON-28-MRUB", "rubio-2028"],
      timestamp: NOW - 30 * 60_000,
      status: "validated",
      reason: "cross_venue_yes_no_below_one",
      grossEdgeBps: 460,
      netEdgeBps: 307,
      capitalUsd: 30,
      depthUsd: 30,
      daysToResolution: 830,
      annualizedPct: 1.35,
      ruleMatch: "unverified",
    });
    recordOpportunity({
      strategy: "cross_venue_yes_no_arb",
      slug: "michigan-margin",
      title: "Michigan Democratic Senate primary margin of victory",
      venues: ["kalshi", "polymarket"],
      tokenIds: ["KXMIMARGIN", "el-sayed-michigan"],
      timestamp: NOW - 20 * 60_000,
      status: "rejected",
      reason: "question_type_mismatch",
      ruleMatch: "mismatch",
    });
    recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "rate-cuts-2026",
      tokenIds: ["no-a", "no-b"],
      timestamp: NOW - 10 * 60_000,
      status: "rejected",
      reason: "non_positive_executable_edge",
    });
    recordPaperDedupeSkip({
      dedupeKey: "k",
      strategy: "neg_risk_bracket_arb",
      tokenIds: ["no-a"],
      previousFireAt: NOW - HOUR,
      skippedAt: NOW - 5_000,
      cooldownMs: 1,
    });

    recordPaperTrade({
      strategy: "within_market_fast_arb",
      side: "YES",
      sizeUsd: 9,
      sizeShares: 20,
      entryPrice: 0.45,
      slug: "will-it-rain",
      question: "Will it rain?",
      tokenId: "yes-1",
      opportunityId: firedAgain.id,
      timestamp: NOW - HOUR,
    });
    recordPaperTrade({
      strategy: "within_market_fast_arb",
      side: "NO",
      sizeUsd: 10.4,
      sizeShares: 20,
      entryPrice: 0.52,
      slug: "will-it-rain",
      question: "Will it rain?",
      tokenId: "no-1",
      opportunityId: firedAgain.id,
      timestamp: NOW - HOUR + 1,
    });

    const snapshot = buildArbScanSnapshot({
      nowMs: NOW,
      scanIntervalMs: 10_000,
      gitSha: "abc123",
      sampleNote: "Pre-registered 14-day window from go-live",
    });

    expect(arbScanSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.summary).toMatchObject({
      raw_candidates_24h: 16,
      validated_24h: 2,
      paper_fired_24h: 2,
      open_paper_positions: 2,
      resolved_paper_trades: 0,
      resolved_paper_pnl_usd: null,
    });
    expect(snapshot.summary.sample_note).toContain("Pre-registered 14-day window");
    expect(snapshot.strategies.find((row) => row.id === "within_market_fast_arb")).toEqual({
      id: "within_market_fast_arb",
      label: "Within-market YES+NO (Polymarket)",
      class: "same_market_complement",
      raw_24h: 12,
      near_miss_24h: 0,
      validated_24h: 1,
      candidates_24h: 0,
      paper_24h: 2,
      top_rejection: null,
    });
    expect(snapshot.strategies.find((row) => row.id === "cross_venue_yes_no_arb")).toMatchObject({
      raw_24h: 4,
      validated_24h: 1,
      top_rejection: "question_type_mismatch",
    });
    // equal counts fall back to gate order: structure before economics before flow
    expect(snapshot.rejections_24h).toEqual([
      { reason: "question_type_mismatch", label: "titles ask different questions", gate: 1, count: 1 },
      { reason: "non_positive_executable_edge", label: "edge gone at executable prices", gate: 3, count: 1 },
      { reason: "duplicate_within_cooldown", label: "same basket fired within the cooldown", gate: 5, count: 1 },
    ]);

    expect(snapshot.opportunities.map((row) => [row.id, row.status])).toEqual([
      [firedAgain.id, "validated"],
      [crossVenue.id, "validated"],
      expect.arrayContaining(["rejected"]),
      expect.arrayContaining(["rejected"]),
    ]);
    expect(snapshot.chances.map((row) => row.id)).toEqual([firedAgain.id, crossVenue.id]);
    expect(snapshot.carry_candidates).toEqual([]);
    expect(snapshot.rejected_examples.map((entry) => [entry.reason, entry.count_24h, entry.examples.length])).toEqual([
      ["question_type_mismatch", 1, 1],
      ["non_positive_executable_edge", 1, 1],
      ["duplicate_within_cooldown", 1, 0],
    ]);
    // a row that failed gate 1 carries no return figures, whatever the journal holds
    expect(snapshot.rejected_examples[0]?.examples[0]).toMatchObject({
      gate_failed: 1,
      gross_edge_bps: null,
      executable_net_edge_bps: null,
      annualized_pct: null,
      rule_screen: "different_question",
      rule_review: "none",
    });
    expect(snapshot.opportunities).not.toContainEqual(
      expect.objectContaining({ id: fired.id }),
    );
    expect(snapshot.opportunities[0]).toMatchObject({
      strategy: "within_market_fast_arb",
      venues: ["polymarket"],
      title: "Will it rain?",
      market_ref: "will-it-rain",
      gross_edge_bps: 309.28,
      executable_net_edge_bps: 53.04,
      depth_usd: 100,
      capital_usd: 19.4,
      days_to_resolution: 2,
      annualized_pct: 96.8,
      status: "validated",
      rejection_reason: null,
      gate_failed: null,
      class: "same_market_complement",
      rule_match: "reviewed",
      rule_screen: "structural",
      rule_review: null,
      hurdle_met: true,
      first_seen_at: "2026-09-04T10:00:00.000Z",
      last_seen_at: "2026-09-04T11:00:00.000Z",
      open_seconds: 3600,
      legs: [
        { venue: "polymarket", side: "YES", price: 0.45, size_usd: 9, role: "taker", fee_usd: 0.25 },
        { venue: "polymarket", side: "NO", price: 0.52, size_usd: 10.4, role: "taker", fee_usd: 0.25 },
      ],
    });
    expect(snapshot.opportunities[1]).toMatchObject({
      strategy: "cross_venue_yes_no_arb",
      class: "cross_venue_complement",
      venues: ["kalshi", "polymarket"],
      annualized_pct: 1.35,
      hurdle_met: false,
      rule_match: "unverified",
      rule_screen: "passed",
      rule_review: "none",
      legs: [],
    });
    expect(
      snapshot.opportunities.find((row) => row.market_ref === "michigan-margin"),
    ).toMatchObject({
      status: "rejected",
      rejection_reason: "question_type_mismatch",
      rule_match: "mismatch",
    });

    expect(snapshot.paper_positions).toHaveLength(2);
    expect(snapshot.paper_positions[0]).toMatchObject({
      opportunity_id: firedAgain.id,
      strategy: "within_market_fast_arb",
      title: "Will it rain?",
      capital_usd: 10.4,
      expected_edge_bps: 53.04,
      status: "open",
      pnl_usd: null,
    });
  });

  it("writes the file atomically and only after validation", () => {
    recordScanCycle({
      success: true,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      timestamp: NOW - 1_000,
    });
    const snapshot = buildArbScanSnapshot({ nowMs: NOW, scanIntervalMs: 10_000, gitSha: "abc" });

    const result = publishArbScan(snapshot, publishDir);

    expect(result).toMatchObject({ written: true, path: join(publishDir, ARB_SCAN_FILENAME) });
    expect(readdirSync(publishDir)).toEqual([ARB_SCAN_FILENAME]);
    expect(JSON.parse(readFileSync(join(publishDir, ARB_SCAN_FILENAME), "utf8"))).toEqual(
      snapshot,
    );

    const invalid = { ...snapshot, schema: "arb_scan/0" } as unknown as typeof snapshot;
    expect(publishArbScan(invalid, publishDir)).toMatchObject({ written: false });

    const leaking = {
      ...snapshot,
      summary: { ...snapshot.summary, sample_note: "written from C:\\Users\\someone\\repo" },
    };
    expect(publishArbScan(leaking, publishDir)).toMatchObject({
      written: false,
      reason: expect.stringContaining("forbidden_content"),
    });
  });

  it("logs once and stays inert when no publish directory is configured", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const publisher = createArbScanPublisher({
      dir: undefined,
      scanIntervalMs: 10_000,
      logger,
      gitSha: "abc",
    });

    expect(publisher.enabled).toBe(false);
    expect(publisher.publish("after_cycle")).toEqual({
      written: false,
      reason: "publish_dir_unset",
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0]?.[0]).toContain("ARB_PUBLISH_DIR is not set");
    expect(existsSync(join(publishDir, ARB_SCAN_FILENAME))).toBe(false);
  });

  it("publishes through the publisher handle and records the time", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const publisher = createArbScanPublisher({
      dir: publishDir,
      scanIntervalMs: 10_000,
      logger,
      gitSha: "abc",
      now: () => NOW,
    });

    const result = publisher.publish("after_cycle");

    expect(result.written).toBe(true);
    expect(publisher.lastPublishedAt).toBe(NOW);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('"event":"arb_scan_published"'));
    expect(JSON.parse(readFileSync(join(publishDir, ARB_SCAN_FILENAME), "utf8"))).toMatchObject({
      health: { alive: false, cycles_24h: 0 },
      opportunities: [],
    });
  });
});
