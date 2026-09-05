import "dotenv/config";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { closeDb, getDb, initDb } from "../execution/db.js";
import { upsertCrossVenuePair } from "../execution/crossVenuePairJournal.js";
import { recordOpportunity, updateOpportunityStatus } from "../execution/opportunityJournal.js";
import { recordOpportunityLegs } from "../execution/opportunityLegJournal.js";
import { recordScanCycle } from "../execution/scanCycleJournal.js";
import { recordScannerRun } from "../execution/scannerRunJournal.js";
import { recordPaperTrade } from "../execution/tradeJournal.js";
import {
  arbScanSchema,
  buildArbScanSnapshot,
  compareOpportunities,
  type ArbScanSnapshot,
  type PublishedOpportunity,
} from "../publisher/arbScanPublisher.js";

/**
 * Writes a fixture of the published feed from a seeded journal.
 *
 * The website tests treat `tests/fixtures/arb_scan_example.json` as the
 * contract of the feed. Before 2026-09-05 that file was typed by hand and
 * used strategy and reason names the scanner never wrote. This script seeds
 * a throwaway journal with one row per class, status and gate, builds the
 * snapshot through the real publisher, and rewrites the random ids into
 * stable ones so the fixture is byte-for-byte reproducible.
 *
 *   npm run feed:fixture -- --out ../prediction-market-terminal/tests/fixtures/arb_scan_example.json
 *
 * Read-only towards every venue: nothing here talks to a network.
 */

export const FIXTURE_NOW = Date.UTC(2026, 8, 5, 14, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function buildFixtureSnapshot(dbPath: string): ArbScanSnapshot {
  rmSync(dbPath, { force: true });
  initDb(dbPath);

  try {
    seedJournals();

    const snapshot = buildArbScanSnapshot({
      nowMs: FIXTURE_NOW,
      scanIntervalMs: 10_000,
      gitSha: "fixture",
      sampleNote:
        "Pre-registered 2026-09-04: 14-day measurement window from go-live; criterion is resolved, candidate-linked paper trades with positive net edge after fees",
      config: {
        hurdlePct: 10,
        targetSizeUsd: 20,
        minExecutableDepthUsd: 5,
        cleanBasketMinEdgeBps: 100,
        crossVenueMinNetCents: 0.5,
        shortMaxHours: 72,
        executionRoleMode: "taker",
      },
    });

    return arbScanSchema.parse(stabilizeIds(snapshot));
  } finally {
    closeDb();
    rmSync(dbPath, { force: true });
  }
}

function seedJournals(): void {
  // Cycles thirty seconds apart against a configured interval of ten: the
  // feed reports the cadence kept, and the website's render harness pins its
  // health cases to a limit of three such intervals.
  for (let index = 0; index < 6; index += 1) {
    recordScanCycle({
      success: index !== 4,
      opportunities: 40,
      paperTrades: index === 0 ? 2 : 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 12,
      error: index === 4 ? "Gamma timeout" : undefined,
      timestamp: FIXTURE_NOW - 5 * 30_000 + index * 30_000,
    });
  }

  recordScannerRun({
    strategy: "within_market_fast_arb",
    timestamp: FIXTURE_NOW - 30_000,
    rawOpportunities: 41,
    nearMissOpportunities: 612,
    validatedOpportunities: 1,
    candidateOpportunities: 0,
    rejectedOpportunities: 40,
    paperTrades: 2,
    durationMs: 9_800,
  });
  recordScannerRun({
    strategy: "neg_risk_bracket_arb",
    timestamp: FIXTURE_NOW - 30_000,
    rawOpportunities: 5,
    validatedOpportunities: 0,
    candidateOpportunities: 1,
    rejectedOpportunities: 4,
    paperTrades: 0,
    durationMs: 4_200,
  });
  recordScannerRun({
    strategy: "clear_win_watch",
    timestamp: FIXTURE_NOW - 30_000,
    rawOpportunities: 1,
    rejectedOpportunities: 1,
    durationMs: 300,
  });
  recordScannerRun({
    strategy: "cross_venue_yes_no_arb",
    timestamp: FIXTURE_NOW - 120_000,
    rawOpportunities: 7,
    validatedOpportunities: 1,
    candidateOpportunities: 1,
    rejectedOpportunities: 5,
    durationMs: 6_100,
  });

  // A same-market chance that paper-fired: short lock, structural rule.
  const fired = recordOpportunity({
    strategy: "within_market_fast_arb",
    slug: "fed-decision-september-2026-cut-25bps",
    title: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
    venues: ["polymarket"],
    category: "economics",
    rawEdge: 0.021,
    status: "raw_found",
    reason: "yes_no_ask_sum_below_threshold",
    tokenIds: ["fix-fed-yes", "fix-fed-no"],
    timestamp: FIXTURE_NOW - 27 * 60_000,
    expectedResolutionAt: FIXTURE_NOW + 26 * HOUR,
    durationHours: 26,
    capitalLockClass: "short",
    ruleScreen: "structural",
    ruleMatch: "reviewed",
  });
  updateOpportunityStatus(fired.id, {
    status: "paper_fired",
    executableEdge: 0.019,
    fillableUsd: 19.6,
    minLegDepthUsd: 380,
    legCount: 2,
    executableSum: 0.981,
    feeAdjustedEdge: 0.0144,
    grossEdgeBps: 193.68,
    netEdgeBps: 146.79,
    feeUsd: 0.092,
    capitalUsd: 19.62,
    depthUsd: 380,
    netProfitUsd: 0.288,
    daysToResolution: 1.0833,
    annualizedPct: 535.79,
    expectedResolutionAt: FIXTURE_NOW + 26 * HOUR,
    durationHours: 26,
    capitalLockClass: "short",
    ruleScreen: "structural",
    ruleMatch: "reviewed",
    reason: "paper_trade_recorded",
  });
  recordOpportunityLegs([
    leg(fired.id, "within_market_fast_arb", "fix-fed-yes", "YES", "polymarket", 0.615, 12.3, 0.047),
    leg(fired.id, "within_market_fast_arb", "fix-fed-no", "NO", "polymarket", 0.366, 7.32, 0.045),
  ]);
  recordPaperTrade({
    strategy: "within_market_fast_arb",
    slug: "fed-decision-september-2026-cut-25bps",
    question: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
    tokenId: "fix-fed-yes",
    opportunityId: fired.id,
    side: "YES",
    sizeUsd: 12.3,
    sizeShares: 20,
    entryPrice: 0.615,
    arbClass: "within_market_fast_arb",
    timestamp: FIXTURE_NOW - 27 * 60_000,
  });
  recordPaperTrade({
    strategy: "within_market_fast_arb",
    slug: "fed-decision-september-2026-cut-25bps",
    question: "Will the Fed cut rates by 25 bps at the September 2026 meeting?",
    tokenId: "fix-fed-no",
    opportunityId: fired.id,
    side: "NO",
    sizeUsd: 7.32,
    sizeShares: 20,
    entryPrice: 0.366,
    arbClass: "within_market_fast_arb",
    timestamp: FIXTURE_NOW - 27 * 60_000 + 1,
  });

  // A resolved paper trade from an earlier chance, for the PnL tile.
  const earlier = recordOpportunity({
    strategy: "within_market_fast_arb",
    slug: "jobless-claims-above-230k-week-of-29-august",
    title: "Jobless claims above 230k for the week of 29 August?",
    venues: ["polymarket"],
    category: "economics",
    rawEdge: 0.012,
    status: "paper_fired",
    reason: "paper_trade_recorded",
    tokenIds: ["fix-claims-yes", "fix-claims-no"],
    timestamp: FIXTURE_NOW - 3 * DAY,
    netEdgeBps: 88.4,
    grossEdgeBps: 120.5,
    capitalUsd: 19.9,
    netProfitUsd: 0.176,
    annualizedPct: 322.7,
    daysToResolution: 1,
    capitalLockClass: "short",
    ruleScreen: "structural",
    ruleMatch: "reviewed",
  });
  const resolvedTrade = recordPaperTrade({
    strategy: "within_market_fast_arb",
    slug: "jobless-claims-above-230k-week-of-29-august",
    question: "Jobless claims above 230k for the week of 29 August?",
    tokenId: "fix-claims-yes",
    opportunityId: earlier.id,
    side: "YES",
    sizeUsd: 9.8,
    sizeShares: 20,
    entryPrice: 0.49,
    arbClass: "within_market_fast_arb",
    timestamp: FIXTURE_NOW - 3 * DAY,
  });
  getDb()
    .prepare(
      `
      UPDATE paper_trades
      SET resolved = 1, exit_price = @exitPrice, pnl = @pnl, resolved_at = @resolvedAt,
          resolution_reason = @resolutionReason
      WHERE id = @id
      `,
    )
    .run({
      id: resolvedTrade.id,
      exitPrice: 1,
      pnl: 10.2,
      resolvedAt: FIXTURE_NOW - 2 * DAY,
      resolutionReason: "gamma_resolved_yes",
    });

  // A same-market row that failed at the book: gate 3, negative net edge.
  const thinBook = recordOpportunity({
    strategy: "within_market_fast_arb",
    slug: "macron-out-by-december-31-2026",
    title: "Macron out as President of France by December 31, 2026?",
    venues: ["polymarket"],
    category: "politics",
    rawEdge: 0.004,
    status: "raw_found",
    reason: "yes_no_ask_sum_below_threshold",
    tokenIds: ["fix-macron-yes", "fix-macron-no"],
    timestamp: FIXTURE_NOW - 40_000,
    expectedResolutionAt: FIXTURE_NOW + 117 * DAY,
    durationHours: 117 * 24,
    capitalLockClass: "long",
    ruleScreen: "structural",
    ruleMatch: "reviewed",
  });
  updateOpportunityStatus(thinBook.id, {
    status: "rejected",
    executableEdge: -0.0046,
    grossEdgeBps: -46.18,
    netEdgeBps: -91.2,
    capitalUsd: 20,
    depthUsd: 37_194.87,
    netProfitUsd: -0.182,
    daysToResolution: 117.64,
    annualizedPct: -2.83,
    gateFailed: 3,
    ruleScreen: "structural",
    ruleMatch: "reviewed",
    reason: "non_positive_executable_edge",
  });
  recordOpportunityLegs([
    leg(thinBook.id, "within_market_fast_arb", "fix-macron-yes", "YES", "polymarket", 0.12, 2.4, 0.011),
    leg(thinBook.id, "within_market_fast_arb", "fix-macron-no", "NO", "polymarket", 0.885, 17.7, 0.02),
  ]);

  // A clean NEG_RISK basket, 41 days out, above the hurdle: a carry candidate.
  const carry = recordOpportunity({
    strategy: "neg_risk_bracket_arb",
    slug: "opensea-fdv-above-one-day-after-launch",
    title: "OpenSea FDV one day after launch",
    venues: ["polymarket"],
    category: "crypto",
    rawEdge: 0.034,
    status: "raw_found",
    reason: "needs_orderbook_depth_check",
    tokenIds: ["fix-os-1", "fix-os-2", "fix-os-3", "fix-os-4", "fix-os-5"],
    timestamp: FIXTURE_NOW - 50_000,
    expectedResolutionAt: FIXTURE_NOW + 41 * DAY,
    durationHours: 41 * 24,
    capitalLockClass: "long",
  });
  updateOpportunityStatus(carry.id, {
    status: "candidate",
    executableEdge: 0.128,
    fillableUsd: 19.77,
    minLegDepthUsd: 953,
    legCount: 5,
    executableSum: 3.872,
    feeAdjustedEdge: 0.116,
    grossEdgeBps: 330.6,
    netEdgeBps: 299.1,
    feeUsd: 0.061,
    capitalUsd: 19.77,
    depthUsd: 4_763.67,
    netProfitUsd: 0.591,
    daysToResolution: 41,
    annualizedPct: 26.63,
    ruleScreen: "passed",
    ruleMatch: "unverified",
    reason: "carry_candidate",
  });
  recordOpportunityLegs(
    [0.81, 0.86, 0.945, 0.959, 0.94].map((price, index) =>
      leg(carry.id, "neg_risk_bracket_arb", `fix-os-${index + 1}`, "NO", "polymarket", price, round(price * 5.105), 0.012),
    ),
  );

  // The basket that was ranked first on 2026-09-05: two near-certain legs,
  // a runoff with two participants. It fails gate 1 and carries no returns.
  recordOpportunity({
    strategy: "neg_risk_bracket_arb",
    slug: "which-candidates-will-advance-to-brazils-presidential-runoff",
    title: "Which candidates will advance to Brazil's presidential runoff?",
    venues: ["polymarket"],
    category: "politics",
    rawEdge: 0.145,
    status: "rejected",
    reason: "multi_winner_or_qualifier_basket",
    gateFailed: 1,
    legCount: 9,
    tokenIds: ["fix-br-1", "fix-br-2", "fix-br-3"],
    timestamp: FIXTURE_NOW - 45_000,
    expectedResolutionAt: FIXTURE_NOW + 28 * DAY,
    durationHours: 28 * 24,
    capitalLockClass: "long",
  });

  // A clean basket whose annualised return is below the hurdle: gate 4.
  recordOpportunity({
    strategy: "neg_risk_bracket_arb",
    slug: "2028-republican-presidential-nominee",
    title: "2028 Republican presidential nominee",
    venues: ["polymarket"],
    category: "politics",
    rawEdge: 0.008,
    status: "rejected",
    reason: "below_annualized_hurdle",
    gateFailed: 4,
    legCount: 12,
    grossEdgeBps: 71.2,
    netEdgeBps: 42.8,
    capitalUsd: 19.9,
    depthUsd: 12_400,
    netProfitUsd: 0.085,
    daysToResolution: 690,
    annualizedPct: 0.23,
    ruleScreen: "passed",
    ruleMatch: "unverified",
    tokenIds: ["fix-gop-1", "fix-gop-2"],
    timestamp: FIXTURE_NOW - 44_000,
    expectedResolutionAt: FIXTURE_NOW + 690 * DAY,
    durationHours: 690 * 24,
    capitalLockClass: "long",
  });

  // Cross-venue: reviewed equivalent, above the hurdle: a validated chance.
  const somaliland = recordOpportunity({
    strategy: "cross_venue_yes_no_arb",
    slug: "will-trump-recognize-somaliland-before-2027",
    title: "Will Trump recognize Somaliland before 2027?",
    venues: ["kalshi", "polymarket"],
    category: "geopolitics",
    rawEdge: 0.071,
    status: "validated",
    reason: "cross_venue_yes_no_below_one",
    tokenIds: ["KXRECOGSOMALI-29-27", "will-trump-recognize-somaliland-before-2027"],
    timestamp: FIXTURE_NOW - 130_000,
    legCount: 2,
    executableSum: 0.929,
    grossEdgeBps: 764.26,
    netEdgeBps: 611.4,
    feeUsd: 1.42,
    capitalUsd: 92.9,
    depthUsd: 92.9,
    netProfitUsd: 5.68,
    daysToResolution: 117.4,
    annualizedPct: 19.0,
    expectedResolutionAt: FIXTURE_NOW + 117.4 * DAY,
    durationHours: 117.4 * 24,
    capitalLockClass: "long",
    ruleScreen: "passed",
    ruleReview: "equivalent",
    ruleMatch: "reviewed",
    resolutionAtKalshi: FIXTURE_NOW + 117.4 * DAY,
    resolutionAtPolymarket: FIXTURE_NOW + 117 * DAY,
  });
  recordOpportunityLegs([
    leg(somaliland.id, "cross_venue_yes_no_arb", "KXRECOGSOMALI-29-27", "YES", "kalshi", 0.36, 36, 0.9),
    leg(somaliland.id, "cross_venue_yes_no_arb", "will-trump-recognize-somaliland-before-2027", "NO", "polymarket", 0.569, 56.9, 0.52),
  ]);

  // Cross-venue: automated screen passed, nobody has read the rulebooks: a candidate.
  const lePen = recordOpportunity({
    strategy: "cross_venue_yes_no_arb",
    slug: "will-marine-le-pen-win-the-2027-french-presidential-election",
    title: "Will Marine Le Pen win the 2027 French presidential election?",
    venues: ["polymarket", "kalshi"],
    category: "politics",
    rawEdge: 0.04,
    status: "candidate",
    reason: "cross_venue_candidate",
    tokenIds: ["KXFRENCHPRES-27-MLEP", "will-marine-le-pen-win-the-2027-french-presidential-election"],
    timestamp: FIXTURE_NOW - 130_000,
    legCount: 2,
    executableSum: 0.96,
    grossEdgeBps: 416.67,
    netEdgeBps: 137.5,
    feeUsd: 2.68,
    capitalUsd: 96,
    depthUsd: 96,
    netProfitUsd: 1.32,
    daysToResolution: 237,
    annualizedPct: 12.1,
    expectedResolutionAt: FIXTURE_NOW + 237 * DAY,
    durationHours: 237 * 24,
    capitalLockClass: "long",
    ruleScreen: "passed",
    ruleReview: "none",
    ruleMatch: "unverified",
    resolutionAtKalshi: FIXTURE_NOW + 632 * DAY,
    resolutionAtPolymarket: FIXTURE_NOW + 237 * DAY,
  });
  recordOpportunityLegs([
    leg(lePen.id, "cross_venue_yes_no_arb", "will-marine-le-pen-win-the-2027-french-presidential-election", "YES", "polymarket", 0.33, 33, 0.88),
    leg(lePen.id, "cross_venue_yes_no_arb", "KXFRENCHPRES-27-MLEP", "NO", "kalshi", 0.63, 63, 1.8),
  ]);

  // Cross-venue: a person found the rulebooks different: gate 1, no returns.
  recordOpportunity({
    strategy: "cross_venue_yes_no_arb",
    slug: "will-marco-rubio-win-the-2028-us-presidential-election",
    title: "Will Marco Rubio win the 2028 US Presidential Election?",
    venues: ["kalshi", "polymarket"],
    category: "politics",
    rawEdge: null,
    status: "rejected",
    reason: "rule_review_not_equivalent",
    gateFailed: 1,
    legCount: 2,
    tokenIds: ["KXPRESPERSON-28-MRUB", "will-marco-rubio-win-the-2028-us-presidential-election"],
    timestamp: FIXTURE_NOW - 130_000,
    expectedResolutionAt: FIXTURE_NOW + 1_158 * DAY,
    durationHours: 1_158 * 24,
    capitalLockClass: "long",
    ruleScreen: "passed",
    ruleReview: "not_equivalent",
    ruleMatch: "mismatch",
    resolutionAtKalshi: FIXTURE_NOW + 1_158 * DAY,
    resolutionAtPolymarket: FIXTURE_NOW + 793 * DAY,
  });

  // Cross-venue: the automated screen said no.
  recordOpportunity({
    strategy: "cross_venue_yes_no_arb",
    slug: "will-abdul-el-sayed-win-the-2026-michigan-democratic-senate-primary",
    title: "Will Abdul El-Sayed win the 2026 Michigan Democratic Senate primary?",
    venues: ["kalshi", "polymarket"],
    category: "politics",
    rawEdge: null,
    status: "rejected",
    reason: "question_type_mismatch",
    gateFailed: 1,
    legCount: 2,
    tokenIds: ["KXMISENPRIMMARGIN-26", "will-abdul-el-sayed-win-the-2026-michigan-democratic-senate-primary"],
    timestamp: FIXTURE_NOW - 130_000,
    ruleScreen: "different_question",
    ruleReview: "none",
    ruleMatch: "mismatch",
    capitalLockClass: "unknown",
  });

  // Clear-win watch: diagnostic only.
  recordOpportunity({
    strategy: "clear_win_watch",
    slug: "nfl-week-1-chiefs-vs-chargers",
    title: "nfl-week-1-chiefs-vs-chargers",
    venues: ["polymarket"],
    rawEdge: null,
    status: "rejected",
    reason: "near_resolution_watch",
    gateFailed: 5,
    tokenIds: ["fix-nfl-home"],
    timestamp: FIXTURE_NOW - 35_000,
    expectedResolutionAt: FIXTURE_NOW + 3 * HOUR,
    durationHours: 3,
    capitalLockClass: "short",
  });

  // The pair board.
  upsertCrossVenuePair({
    pairId: "KXRECOGSOMALI-29-27|will-trump-recognize-somaliland-before-2027",
    title: "Will Trump recognize Somaliland before 2027?",
    kalshiTicker: "KXRECOGSOMALI-29-27",
    polymarketSlug: "will-trump-recognize-somaliland-before-2027",
    kalshiTitle: "Will the US recognize Somaliland before 2027?",
    polymarketQuestion: "Will Trump recognize Somaliland before 2027?",
    category: "geopolitics",
    source: "config",
    resolutionAtKalshi: FIXTURE_NOW + 117.4 * DAY,
    resolutionAtPolymarket: FIXTURE_NOW + 117 * DAY,
    ruleScreen: "passed",
    ruleReview: "equivalent",
    review: {
      verdict: "equivalent",
      date: "2026-09-08",
      reviewer: "cc",
      note: "Both venues resolve on a formal US government recognition of Somaliland before 2027-01-01; both name official US government sources.",
      checklist: { "1": true, "2": true, "3": true, "4": true, "5": true, "6": true, "7": "0 days apart" },
      source: "manual review 2026-09-08",
    },
    kalshiRulesExcerpt: "If the United States formally recognizes Somaliland as an independent state before January 1, 2027, then the market resolves to Yes.",
    polymarketRulesExcerpt: "This market will resolve to Yes if the United States government formally recognizes Somaliland as a sovereign state by December 31, 2026, 11:59 PM ET. Resolution source: official US government statements or a consensus of credible reporting.",
    lastGrossCents: 7.1,
    lastNetCents: 5.68,
    lastAnnualizedPct: 19.0,
    lastExecutableSize: 100,
    lastStatus: "validated",
    timestamp: FIXTURE_NOW - 130_000,
  });
  upsertCrossVenuePair({
    pairId: "KXFRENCHPRES-27-MLEP|will-marine-le-pen-win-the-2027-french-presidential-election",
    title: "Will Marine Le Pen win the 2027 French presidential election?",
    kalshiTicker: "KXFRENCHPRES-27-MLEP",
    polymarketSlug: "will-marine-le-pen-win-the-2027-french-presidential-election",
    kalshiTitle: "Who will win the 2027 French presidential election? Marine Le Pen",
    polymarketQuestion: "Will Marine Le Pen win the 2027 French presidential election?",
    category: "politics",
    source: "config",
    resolutionAtKalshi: FIXTURE_NOW + 632 * DAY,
    resolutionAtPolymarket: FIXTURE_NOW + 237 * DAY,
    ruleScreen: "passed",
    ruleReview: "none",
    review: null,
    kalshiRulesExcerpt: "If Marine Le Pen wins the next French presidential election, then the market resolves to Yes.",
    polymarketRulesExcerpt: "This market will resolve according to the candidate who wins the next French presidential election, including any second round. If results are not known by December 31, 2027, this market will resolve to Other.",
    lastGrossCents: 4.0,
    lastNetCents: 1.32,
    lastAnnualizedPct: 12.1,
    lastExecutableSize: 100,
    lastStatus: "candidate",
    timestamp: FIXTURE_NOW - 130_000,
  });
  upsertCrossVenuePair({
    pairId: "KXPRESPERSON-28-MRUB|will-marco-rubio-win-the-2028-us-presidential-election",
    title: "Will Marco Rubio win the 2028 US Presidential Election?",
    kalshiTicker: "KXPRESPERSON-28-MRUB",
    polymarketSlug: "will-marco-rubio-win-the-2028-us-presidential-election",
    kalshiTitle: "Who will be inaugurated as President in 2029? Marco Rubio",
    polymarketQuestion: "Will Marco Rubio win the 2028 US Presidential Election?",
    category: "politics",
    source: "config",
    resolutionAtKalshi: FIXTURE_NOW + 1_158 * DAY,
    resolutionAtPolymarket: FIXTURE_NOW + 793 * DAY,
    ruleScreen: "passed",
    ruleReview: "not_equivalent",
    review: {
      verdict: "not_equivalent",
      date: "2026-07-31",
      reviewer: "cc",
      note: "Kalshi pays on who is inaugurated in 2029; Polymarket on who wins the election per AP, Fox and NBC. A winner who is not inaugurated pays YES on one venue and NO on the other.",
      checklist: { "1": true, "2": false, "3": false, "4": true, "5": false, "6": true, "7": "365 days apart, Kalshi later" },
      source: "docs/research/resolution_rules_2026-07-31.md",
    },
    kalshiRulesExcerpt: "If Marco Rubio is the next person inaugurated as President for the term beginning in 2029, then the market resolves to Yes.",
    polymarketRulesExcerpt: "This market will resolve to the person who wins the 2028 US Presidential Election. The resolution source is the Associated Press, Fox News, and NBC; if all three have not called the race by January 20, 2029, it resolves based on who is inaugurated.",
    lastGrossCents: 4.6,
    lastNetCents: 3.07,
    lastAnnualizedPct: 1.4,
    lastExecutableSize: 100,
    lastStatus: "rejected",
    timestamp: FIXTURE_NOW - 130_000,
  });
  upsertCrossVenuePair({
    pairId: "KXMISENPRIMMARGIN-26|will-abdul-el-sayed-win-the-2026-michigan-democratic-senate-primary",
    title: "Will Abdul El-Sayed win the 2026 Michigan Democratic Senate primary?",
    kalshiTicker: "KXMISENPRIMMARGIN-26",
    polymarketSlug: "will-abdul-el-sayed-win-the-2026-michigan-democratic-senate-primary",
    kalshiTitle: "Michigan Democratic Senate primary margin of victory",
    polymarketQuestion: "Will Abdul El-Sayed win the 2026 Michigan Democratic Senate primary?",
    category: "politics",
    source: "discovery",
    ruleScreen: "different_question",
    ruleScreenDetail: "different question types: result against margin",
    ruleReview: "none",
    lastStatus: "rejected",
    timestamp: FIXTURE_NOW - 130_000,
  });
}

function leg(
  opportunityId: string,
  strategy: string,
  tokenId: string,
  side: "YES" | "NO",
  venue: "kalshi" | "polymarket",
  price: number,
  sizeUsd: number,
  feeUsd: number,
) {
  return {
    opportunityId,
    strategy,
    tokenId,
    side,
    venue,
    role: "taker",
    averageFillPrice: price,
    bestAsk: price,
    bestBid: round(price - 0.01),
    maxFillableUsd: sizeUsd * 20,
    fillable: true,
    reason: "fillable",
    shares: round(sizeUsd / price),
    sizeUsd,
    feeUsd,
    legIndex: 0,
    timestamp: FIXTURE_NOW - 60_000,
  };
}

/**
 * Journal ids are random uuids, and the publisher breaks ties on them. The
 * fixture swaps them for names derived from the row's content, then
 * re-sorts every list with the publisher's own comparator, so a regenerated
 * fixture only changes when the feed changes.
 */
export function stabilizeIds(snapshot: ArbScanSnapshot): ArbScanSnapshot {
  const mapping = new Map<string, string>();
  const rows = new Map<string, PublishedOpportunity>();

  for (const list of [
    snapshot.opportunities,
    snapshot.chances,
    snapshot.carry_candidates,
    ...snapshot.rejected_examples.map((entry) => entry.examples),
  ]) {
    for (const row of list) {
      rows.set(row.id, row);
    }
  }

  const contentKey = (row: PublishedOpportunity): string =>
    [row.strategy, row.status, row.rejection_reason ?? "", row.title, row.market_ref, row.first_seen_at].join("|");

  [...rows.values()]
    .sort((left, right) => contentKey(left).localeCompare(contentKey(right)))
    .forEach((row, index) => {
      mapping.set(row.id, `opp-${String(index + 1).padStart(4, "0")}`);
    });

  const tradeKey = (trade: ArbScanSnapshot["paper_positions"][number]): string =>
    [trade.opened_at, trade.strategy, trade.title, trade.capital_usd].join("|");

  [...snapshot.paper_positions]
    .sort((left, right) => tradeKey(left).localeCompare(tradeKey(right)))
    .forEach((trade, index) => {
      mapping.set(trade.trade_id, `pt-${String(index + 1).padStart(4, "0")}`);

      if (trade.opportunity_id && !mapping.has(trade.opportunity_id)) {
        mapping.set(trade.opportunity_id, `opp-${String(rows.size + index + 1).padStart(4, "0")}`);
      }
    });

  const remapRow = (row: PublishedOpportunity): PublishedOpportunity => ({
    ...row,
    id: mapping.get(row.id) ?? row.id,
  });
  const remapList = (list: PublishedOpportunity[]): PublishedOpportunity[] =>
    list.map(remapRow).sort(compareOpportunities);

  return {
    ...snapshot,
    opportunities: remapList(snapshot.opportunities),
    chances: remapList(snapshot.chances),
    carry_candidates: remapList(snapshot.carry_candidates),
    rejected_examples: snapshot.rejected_examples.map((entry) => ({
      ...entry,
      examples: entry.examples
        .map(remapRow)
        .sort(
          (left, right) =>
            right.last_seen_at.localeCompare(left.last_seen_at) || left.id.localeCompare(right.id),
        ),
    })),
    paper_positions: snapshot.paper_positions
      .map((trade) => ({
        ...trade,
        trade_id: mapping.get(trade.trade_id) ?? trade.trade_id,
        opportunity_id: trade.opportunity_id
          ? (mapping.get(trade.opportunity_id) ?? trade.opportunity_id)
          : null,
      }))
      .sort(
        (left, right) =>
          right.opened_at.localeCompare(left.opened_at) || left.trade_id.localeCompare(right.trade_id),
      ),
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export function writeFixture(outPath: string): { path: string; bytes: number } {
  const dbPath = join(tmpdir(), `arb-scan-fixture-${process.pid}.db`);
  const snapshot = buildFixtureSnapshot(dbPath);
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const target = resolve(outPath);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json, "utf8");

  return { path: target, bytes: Buffer.byteLength(json, "utf8") };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

if (isMainModule()) {
  const outArg = process.argv.slice(2).find((arg) => arg.startsWith("--out="));
  const outIndex = process.argv.indexOf("--out");
  const outPath =
    outArg?.slice("--out=".length) ??
    (outIndex >= 0 ? process.argv[outIndex + 1] : undefined) ??
    join("docs", "reports", "arb_scan_fixture.json");
  const written = writeFixture(outPath);

  console.log(`arb_scan fixture written: ${written.bytes} bytes`);
}
