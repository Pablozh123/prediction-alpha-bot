import { readFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { listRecentPaperTrades } from "../src/execution/tradeJournal.js";
import { listRecentOpportunities } from "../src/execution/opportunityJournal.js";
import {
  listRecentSportsResolutionWatches,
  recordSportsTick,
} from "../src/execution/sportsJournal.js";
import {
  analyzeSportsResolutionTicks,
  processSportsResolutionCandidate,
  runSportsResolutionCycle,
} from "../src/scanner/sportsResolutionScanner.js";
import {
  normalizeSportsTick,
  parseSportsPayload,
} from "../src/utils/polymarketSports.js";

const testDbPath = join("logs", "sports-resolution-test.db");
const nowMs = Date.parse("2026-05-26T20:00:00.000Z");

describe("sports resolution sniping", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("parses sports websocket payloads into final score ticks", () => {
    expect(
      parseSportsPayload(
        JSON.stringify({
          slug: "nba-away-home-2026-05-26",
          sport: "nba",
          awayTeam: "Away Team",
          homeTeam: "Home Team",
          away_score: 101,
          home_score: 105,
          status: "Final",
          ended: true,
          finished_timestamp: "2026-05-26T19:59:00.000Z",
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        slug: "nba-away-home-2026-05-26",
        awayScore: 101,
        homeScore: 105,
        ended: true,
      }),
    ]);
  });

  it("keeps Polymarket sports websocket ticks that have gameId but no slug", () => {
    expect(
      parseSportsPayload(
        JSON.stringify({
          gameId: 10078118,
          leagueAbbreviation: "mlb",
          homeTeam: "SF",
          awayTeam: "ARI",
          status: "Final",
          eventState: {
            score: "5-2",
            ended: true,
          },
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        slug: "game:10078118",
        sport: "mlb",
        league: "mlb",
        homeTeam: "SF",
        awayTeam: "ARI",
        homeScore: 5,
        awayScore: 2,
        ended: true,
      }),
    ]);
  });

  it("maps final sports ticks to Gamma outcomes by explicit team names", () => {
    const analysis = analyzeSportsResolutionTicks(
      [makeTick()],
      [makeGammaEvent()],
    );

    expect(analysis.mappings[0]).toMatchObject({
      mappingStatus: "mapped",
      awayOutcomeIndex: 0,
      homeOutcomeIndex: 1,
      awayTokenId: "away-token",
      homeTokenId: "home-token",
    });
    expect(analysis.candidates[0]).toMatchObject({
      winningSide: "home",
      winningTokenId: "home-token",
      marketPrice: 0.91,
      expectedEdge: 0.09,
      reason: "sports_resolution_watch_unverified",
    });
  });

  it("maps gameId-only sports ticks by binary team outcomes", () => {
    const tick = {
      ...makeTick(),
      slug: "game:10078118",
      homeTeam: "SF",
      awayTeam: "ARI",
      homeScore: 5,
      awayScore: 2,
    };
    const event = {
      slug: "diamondbacks-vs-giants-2026-05-27",
      markets: [
        {
          id: "market-1",
          slug: "diamondbacks-vs-giants-2026-05-27",
          question: "ARI vs SF",
          clobTokenIds: '["ari-token","sf-token"]',
          outcomes: '["ARI","SF"]',
          outcomePrices: '["0.12","0.88"]',
        },
      ],
    };
    const analysis = analyzeSportsResolutionTicks([tick], [event]);

    expect(analysis.mappings[0]).toMatchObject({
      mappingStatus: "mapped",
      awayTokenId: "ari-token",
      homeTokenId: "sf-token",
    });
    expect(analysis.candidates[0]).toMatchObject({
      sportsSlug: "game:10078118",
      winningSide: "home",
      winningTokenId: "sf-token",
      expectedEdge: 0.12,
    });
  });

  it("maps sports team abbreviations to full Gamma outcome names", () => {
    const tick = {
      ...makeTick(),
      slug: "game:10078118",
      homeTeam: "SF",
      awayTeam: "ARI",
      homeScore: 5,
      awayScore: 2,
    };
    const event = {
      slug: "diamondbacks-vs-giants-2026-05-30",
      markets: [
        {
          id: "market-1",
          slug: "diamondbacks-vs-giants-2026-05-30",
          question: "Arizona Diamondbacks vs San Francisco Giants",
          clobTokenIds: '["ari-token","sf-token"]',
          outcomes: '["Arizona Diamondbacks","San Francisco Giants"]',
          outcomePrices: '["0.18","0.82"]',
        },
      ],
    };
    const analysis = analyzeSportsResolutionTicks([tick], [event]);

    expect(analysis.mappings[0]).toMatchObject({
      mappingStatus: "mapped",
      awayOutcomeIndex: 0,
      homeOutcomeIndex: 1,
      awayTokenId: "ari-token",
      homeTokenId: "sf-token",
    });
  });

  it("records watch diagnostics without paper-firing when paper-fire is disabled", async () => {
    const result = await runSportsResolutionCycle({
      events: [makeGammaEvent()],
      nowMs,
      paperFireEnabled: false,
      ticks: [makeTick()],
    });

    expect(result).toMatchObject({
      candidates: 1,
      mappings: 1,
      paperTrades: 0,
      watches: 1,
    });
    expect(listRecentSportsResolutionWatches(10)[0]).toMatchObject({
      validationStatus: "watch_only",
      reason: "sports_resolution_watch_unverified",
      winningTokenId: "home-token",
    });
  });

  it("requires a second reference tick before paper-firing", async () => {
    const result = await processSportsResolutionCandidate(
      analyzeSportsResolutionTicks([makeTick()], [makeGammaEvent()]).candidates[0]!,
      {
        nowMs,
        paperFireEnabled: true,
        referenceTicks: [],
      },
    );

    expect(result).toMatchObject({
      paperTrades: 0,
      reason: "missing_secondary_reference",
      status: "rejected",
    });
    expect(listRecentPaperTrades(10)).toHaveLength(0);
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "rejected",
      reason: "missing_secondary_reference",
    });
  });

  it("paper-fires only after reference and orderbook validation", async () => {
    const execute = vi.fn();
    const result = await processSportsResolutionCandidate(
      analyzeSportsResolutionTicks([makeTick()], [makeGammaEvent()]).candidates[0]!,
      {
        execute,
        fetchBook: async () => ({
          tokenId: "home-token",
          bids: [{ price: 0.93, size: 10 }],
          asks: [{ price: 0.94, size: 10 }],
        }),
        nowMs,
        paperFireEnabled: true,
        referenceTicks: [makeReferenceTick()],
      },
    );

    expect(result).toMatchObject({
      paperTrades: 1,
      reason: "paper_trade_recorded",
      status: "paper_fired",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: "sports_resolution_snipe",
        tokenId: "home-token",
        side: "YES",
        entryPrice: 0.94,
        paperSizeShares: 1,
      }),
    );
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "paper_fired",
      executableEdge: 0.06,
    });
  });

  it("records stored sports ticks for later cycles", async () => {
    const tick = normalizeSportsTick({
      slug: "nba-away-home-2026-05-26",
      awayTeam: "Away Team",
      homeTeam: "Home Team",
      away_score: 101,
      home_score: 105,
      status: "Final",
      ended: true,
    });

    if (!tick) {
      throw new Error("Expected a normalized tick.");
    }

    recordSportsTick({
      ...tick,
      raw: tick.raw,
      receivedAt: nowMs,
    });

    const result = await runSportsResolutionCycle({
      events: [makeGammaEvent()],
      nowMs,
      paperFireEnabled: false,
    });

    expect(result.candidates).toBe(1);
  });

  it("contains no live-trading imports or order functions", async () => {
    const source = await readFile("src/scanner/sportsResolutionScanner.ts", "utf8");

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toMatch(/placeOrder|postOrder|buyLimit|sellPosition/);
    expect(source).not.toMatch(/private[_-]?key|seed phrase/i);
  });
});

function makeTick() {
  return {
    sport: "nba",
    league: "nba",
    gameId: "game-1",
    slug: "nba-away-home-2026-05-26",
    awayTeam: "Away Team",
    homeTeam: "Home Team",
    awayScore: 101,
    homeScore: 105,
    status: "Final",
    ended: true,
    finishedTimestamp: nowMs,
    raw: {},
  };
}

function makeReferenceTick() {
  return {
    ...makeTick(),
    raw: { source: "secondary" },
  };
}

function makeGammaEvent() {
  return {
    slug: "nba-away-home-2026-05-26",
    markets: [
      {
        id: "market-1",
        slug: "nba-away-home-2026-05-26",
        question: "Away Team vs Home Team",
        clobTokenIds: '["away-token","home-token"]',
        outcomes: '["Away Team","Home Team"]',
        outcomePrices: '["0.09","0.91"]',
      },
    ],
  };
}
