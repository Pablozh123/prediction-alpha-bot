import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOddpoolReference,
  writeOddpoolReference,
  type OddpoolFetchJsonOptions,
} from "../src/scripts/oddpoolReference.js";

describe("oddpool reference script", () => {
  it("fetches Oddpool reference rows and writes output without the API key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "oddpool-reference-"));
    const outputPath = join(dir, "oddpool-reference.json");
    const calls: Array<{
      url: string;
      options: OddpoolFetchJsonOptions;
    }> = [];
    const apiKey = "oddpool_secret_for_test";
    const result = await writeOddpoolReference({
      apiKey,
      outputPath,
      now: () => new Date("2026-06-09T10:00:00.000Z"),
      fetchJson: async (url, options) => {
        calls.push({ url, options });

        if (url.endsWith("/arbitrage/current/difference")) {
          return [
            {
              event_title: "Inflation 2026",
              label: "Above 4%",
              side: "YES",
              side1: "Opinion",
              side2: "Polymarket",
              side1_price: 0.22,
              side2_price: 0.29,
              diff: 0.07,
              timestamp: "2026-06-09T09:59:00",
            },
          ];
        }

        return [
          {
            event_title: "Inflation 2026",
            label: "Above 4%",
            buy_yes_market: "opinion",
            buy_no_market: "polymarket",
            net_cents: 4.2,
            executable_size: 100,
            max_profit_dollars: 4.2,
            timestamp: "2026-06-09T09:58:00",
          },
        ];
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.options).toMatchObject({
      apiKey,
      params: {
        min_net_cents: 0.5,
        orderbook: true,
      },
    });
    expect(calls[1]?.options).toMatchObject({
      apiKey,
      params: {
        minutes: 10,
      },
    });
    expect(result.data).toMatchObject({
      generatedAt: "2026-06-09T10:00:00.000Z",
      summary: {
        arbitrageCount: 1,
        priceSpreadCount: 1,
        topArbitrage: [
          {
            eventTitle: "Inflation 2026",
            label: "Above 4%",
            buyYesMarket: "opinion",
            buyNoMarket: "polymarket",
            netCents: 4.2,
          },
        ],
      },
    });
    expect(readFileSync(outputPath, "utf8")).not.toContain(apiKey);
  });

  it("rejects missing or placeholder API keys", async () => {
    await expect(
      buildOddpoolReference({
        apiKey: "paste_your_oddpool_key_here",
        fetchJson: async () => [],
      }),
    ).rejects.toThrow("Missing Oddpool API key");
  });
});
