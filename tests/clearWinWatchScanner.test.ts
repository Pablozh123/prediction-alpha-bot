import { describe, expect, it } from "vitest";
import {
  scanClearWinWatchEvents,
} from "../src/scanner/clearWinWatchScanner.js";

describe("clear-win-watch scanner", () => {
  it("emits near-resolution diagnostics but no executable paper opportunity", () => {
    const nowMs = Date.parse("2026-05-26T12:00:00.000Z");
    const opportunities = scanClearWinWatchEvents(
      [
        {
          endDate: "2026-05-26T18:00:00.000Z",
          markets: [
            {
              id: "m1",
              slug: "near-resolution-market",
              question: "Will this settle soon?",
              clobTokenIds: '["yes-token","no-token"]',
              outcomes: '["Yes","No"]',
              outcomePrices: '["0.91","0.09"]',
            },
          ],
        },
      ],
      { nowMs },
    );

    expect(opportunities).toEqual([
      expect.objectContaining({
        slug: "near-resolution-market",
        tokenId: "yes-token",
        side: "YES",
        impliedPrice: 0.91,
        capitalLockClass: "short",
        reason: "near_resolution_watch",
      }),
    ]);
  });

  it("ignores candidates without a near resolution timestamp", () => {
    expect(
      scanClearWinWatchEvents([
        {
          markets: [
            {
              id: "m1",
              slug: "unknown-duration-market",
              question: "Will this settle?",
              clobTokenIds: '["yes-token","no-token"]',
              outcomes: '["Yes","No"]',
              outcomePrices: '["0.91","0.09"]',
            },
          ],
        },
      ]),
    ).toEqual([]);
  });
});
