import { describe, expect, it } from "vitest";
import {
  renderDailyTelegramMarkdown,
  renderDailyTelegramMessage,
  type DailyTelegramReport
} from "../src/scripts/dailyTelegramReport.js";

describe("daily Telegram report", () => {
  it("renders a compact paper-only Telegram summary", () => {
    const message = renderDailyTelegramMessage(makeReport());

    expect(message).toContain("Paper bot daily report");
    expect(message).toContain("paper-only");
    expect(message).toContain("liveTrades: 0");
    expect(message).toContain("blocked orderbook tokens: 2");
    expect(message).toContain("neg_risk_bracket_arb");
    expect(message).toContain("neg-risk classes: clean 1, duration 2, directional 3, ambiguous 4");
    expect(message).toContain("sports watch: ticks mapped 2, candidates 1, rows 1");
    expect(message).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(message).not.toContain("private-key");
  });

  it("renders markdown without PnL or live-order claims", () => {
    const markdown = renderDailyTelegramMarkdown(makeReport());

    expect(markdown).toContain("Forward replay uses orderbook quote movement");
    expect(markdown).toContain("No live trading");
    expect(markdown).not.toContain("placeOrder");
    expect(markdown).toContain("not realized PnL");
  });
});

function makeReport(): DailyTelegramReport {
  return {
    generatedAt: "2026-05-20T00:00:00.000Z",
    dbPath: "logs/test.db",
    windowHours: 24,
    since: 1_700_000_000_000,
    scanCycles: {
      total: 10,
      successful: 10,
      failed: 0
    },
    scannerSummaries: [
      {
        strategy: "neg_risk_bracket_arb",
        rawOpportunities: 3,
        validatedOpportunities: 0,
        rejectedOpportunities: 3,
        paperTrades: 0
      }
    ],
    rejectionReasons: [
      {
        strategy: "neg_risk_bracket_arb",
        reason: "non_positive_executable_edge",
        count: 3
      }
    ],
    paperTrades: 0,
    liveTrades: 0,
    snapshots: {
      total: 48,
      uniqueTokens: 24,
      uniqueMarkets: 12,
      duplicateChecksums: 0
    },
    activeOrderbookTokenBlocks: 2,
    shortDurationCandidates: 1,
    shortDurationPaperFires: 0,
    longDurationWatch: 2,
    nearResolutionWatch: 1,
    negRiskBasketClasses: {
      clean_arb: 1,
      duration_risk: 2,
      directional_bucket: 3,
      invalid_or_ambiguous: 4
    },
    sportsWatch: {
      candidates: 1,
      mapped: 2,
      watchRows: 1
    },
    forwardReplay: {
      averageLatestMarkToBidMove: -0.004,
      averageBestMarkToBidMove: -0.002,
      tokensWithPositiveLatestBidMove: 0,
      tokensWithPositiveBestBidMove: 1,
      topTokens: []
    }
  };
}
