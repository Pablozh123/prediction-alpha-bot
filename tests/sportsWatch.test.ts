import { describe, expect, it } from "vitest";
import { loadSportsWatchConfig } from "../src/scripts/sportsWatch.js";

describe("sports watch config", () => {
  it("defaults to paper-only watch mode", () => {
    expect(loadSportsWatchConfig({})).toEqual({
      dbPath: undefined,
      paperFireEnabled: false,
      resolutionIntervalMs: 30_000,
    });
  });

  it("loads explicit local-only settings", () => {
    expect(
      loadSportsWatchConfig({
        DATABASE_PATH: "logs/sports-test.db",
        SPORTS_PAPER_FIRE_ENABLED: "true",
        SPORTS_RESOLUTION_INTERVAL_MS: "10000",
      }),
    ).toEqual({
      dbPath: "logs/sports-test.db",
      paperFireEnabled: true,
      resolutionIntervalMs: 10_000,
    });
  });
});
