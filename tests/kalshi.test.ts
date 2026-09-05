import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import {
  fetchKalshiMarketSettlement,
  fetchKalshiOrderBook,
  fetchKalshiMarkets,
  kalshiPaperSlug,
  kalshiTickerFromPaperSlug,
  normalizeKalshiMarket,
  normalizeKalshiMarketSettlement,
  normalizeKalshiOrderBook,
} from "../src/utils/kalshi.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("kalshi paper legs and settlement", () => {
  it("names a Kalshi paper leg by its ticker and reads it back", () => {
    expect(kalshiPaperSlug(" KXTEST ")).toBe("kalshi:KXTEST");
    expect(kalshiTickerFromPaperSlug("kalshi:KXTEST")).toBe("KXTEST");
    expect(kalshiTickerFromPaperSlug("kalshi:")).toBeUndefined();
    expect(kalshiTickerFromPaperSlug("will-x-happen")).toBeUndefined();
  });

  it("normalizes a settled market's result and times", () => {
    expect(
      normalizeKalshiMarketSettlement({
        ticker: "KXTEST",
        status: "Settled",
        result: "Yes",
        close_time: "2026-09-01T15:00:00Z",
        expiration_time: "2026-09-02T15:00:00Z",
      }),
    ).toEqual({
      ticker: "KXTEST",
      status: "settled",
      result: "YES",
      closeTime: Date.parse("2026-09-01T15:00:00Z"),
      expirationTime: Date.parse("2026-09-02T15:00:00Z"),
    });
    expect(normalizeKalshiMarketSettlement({ ticker: "KXOPEN", status: "open" })).toMatchObject({
      result: null,
      closeTime: null,
    });
  });

  it("reads the market by ticker and treats a 404 as not a market", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { market: { ticker: "KXTEST", status: "settled", result: "no", close_time: "2026-09-01T15:00:00Z" } },
    });
    expect(await fetchKalshiMarketSettlement("KXTEST")).toMatchObject({ ticker: "KXTEST", result: "NO" });
    expect(vi.mocked(axios.get).mock.calls.at(-1)?.[0]).toBe(
      "https://external-api.kalshi.com/trade-api/v2/markets/KXTEST",
    );

    vi.mocked(axios.get).mockRejectedValue({ response: { status: 404 } });
    expect(await fetchKalshiMarketSettlement("KXNOPE")).toBeNull();
    vi.mocked(axios.get).mockReset();
  });
});

describe("kalshi utilities", () => {
  it("normalizes Kalshi bid-only books into complementary ask ladders", () => {
    expect(
      normalizeKalshiOrderBook(
        {
          orderbook_fp: {
            yes_dollars: [
              ["0.3000", "20.00"],
              ["0.4000", "10.00"],
            ],
            no_dollars: [
              ["0.5500", "5.00"],
              ["0.6000", "7.00"],
            ],
          },
        },
        "KXTEST-YES",
      ),
    ).toEqual({
      ticker: "KXTEST-YES",
      yesBids: [
        { price: 0.4, size: 10 },
        { price: 0.3, size: 20 },
      ],
      noBids: [
        { price: 0.6, size: 7 },
        { price: 0.55, size: 5 },
      ],
      yesAsks: [
        { price: 0.4, size: 7 },
        { price: 0.45, size: 5 },
      ],
      noAsks: [
        { price: 0.6, size: 10 },
        { price: 0.7, size: 20 },
      ],
    });
  });

  it("fetches Kalshi orderbooks read-only without auth headers", async () => {
    const get = vi.mocked(axios.get);

    get.mockResolvedValueOnce({
      data: {
        orderbook_fp: {
          yes_dollars: [["0.4000", "10.00"]],
          no_dollars: [["0.6000", "7.00"]],
        },
      },
    });

    await expect(fetchKalshiOrderBook("KXTEST-YES", 25)).resolves.toMatchObject({
      ticker: "KXTEST-YES",
      yesAsks: [{ price: 0.4, size: 7 }],
      noAsks: [{ price: 0.6, size: 10 }],
    });
    expect(get).toHaveBeenCalledWith(
      "https://external-api.kalshi.com/trade-api/v2/markets/KXTEST-YES/orderbook",
      {
        params: { depth: 25 },
        timeout: 10_000,
      },
    );
    expect(JSON.stringify(get.mock.calls)).not.toMatch(/KALSHI-ACCESS|authorization/i);
  });

  it("normalizes Kalshi market metadata for discovery", () => {
    expect(
      normalizeKalshiMarket({
        ticker: "KXTEST-26JUN-YES",
        event_ticker: "KXTEST-26JUN",
        title: "Will the Fed cut rates in June?",
        subtitle: "Federal Reserve decision",
        yes_sub_title: "Yes",
        no_sub_title: "No",
        expected_expiration_time: "2026-06-30T23:59:59Z",
        close_time: 1782864000,
        yes_ask_dollars: "0.42",
        no_ask: 62,
        liquidity_dollars: "1234.56",
        volume_24h: "78.9",
        rules_primary: "Resolves Yes if the Fed cuts rates in June.",
        rules_secondary: "Resolution source: Federal Reserve.",
      }),
    ).toMatchObject({
      ticker: "KXTEST-26JUN-YES",
      eventTicker: "KXTEST-26JUN",
      title: "Will the Fed cut rates in June?",
      yesAsk: 0.42,
      noAsk: 0.62,
      liquidityDollars: 1234.56,
      volume24h: 78.9,
      rulesPrimary: "Resolves Yes if the Fed cuts rates in June.",
      rulesSecondary: "Resolution source: Federal Reserve.",
    });
  });

  it("fetches Kalshi markets read-only without auth headers", async () => {
    const get = vi.mocked(axios.get);

    get.mockResolvedValueOnce({
      data: {
        markets: [
          {
            ticker: "KXTEST-1",
            title: "Test market",
            yes_ask_dollars: "0.40",
          },
        ],
      },
    });

    await expect(fetchKalshiMarkets({ limit: 10, maxPages: 1 })).resolves.toEqual([
      expect.objectContaining({
        ticker: "KXTEST-1",
        title: "Test market",
        yesAsk: 0.4,
      }),
    ]);
    expect(get).toHaveBeenCalledWith(
      "https://external-api.kalshi.com/trade-api/v2/markets",
      {
        params: { limit: 10, status: "open" },
        timeout: 10_000,
      },
    );
    expect(JSON.stringify(get.mock.calls)).not.toMatch(/KALSHI-ACCESS|authorization/i);
  });

  it("fetches scoped Kalshi market pages by series and event tickers", async () => {
    const get = vi.mocked(axios.get);

    get.mockClear();
    get.mockResolvedValueOnce({
      data: {
        markets: [
          {
            ticker: "KXBTC-1",
            title: "Bitcoin market",
          },
        ],
      },
    });
    get.mockResolvedValueOnce({
      data: {
        markets: [
          {
            ticker: "KXELONMARS-99",
            title: "Elon Mars market",
          },
        ],
      },
    });

    await expect(
      fetchKalshiMarkets({
        eventTickers: ["KXELONMARS-99"],
        limit: 25,
        maxPages: 1,
        seriesTickers: ["KXBTC"],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ ticker: "KXBTC-1" }),
      expect.objectContaining({ ticker: "KXELONMARS-99" }),
    ]);
    expect(get).toHaveBeenNthCalledWith(
      1,
      "https://external-api.kalshi.com/trade-api/v2/markets",
      {
        params: { limit: 25, status: "open", series_ticker: "KXBTC" },
        timeout: 10_000,
      },
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      "https://external-api.kalshi.com/trade-api/v2/markets",
      {
        params: { limit: 25, status: "open", event_ticker: "KXELONMARS-99" },
        timeout: 10_000,
      },
    );
  });

  it("contains no live order integration", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/utils/kalshi.ts", "utf8");

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toMatch(/placeOrder|postOrder|buyLimit|sellPosition/);
    expect(source).not.toMatch(/private[_-]?key|seed phrase/i);
  });
});
