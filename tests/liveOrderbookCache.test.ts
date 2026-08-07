import { describe, expect, it } from "vitest";
import {
  KalshiOrderbookWebSocketIngestor,
  LiveOrderBookCache,
  PolymarketMarketWebSocketIngestor,
  type WebSocketLike,
} from "../src/scanner/liveOrderbookCache.js";

describe("live orderbook cache", () => {
  it("returns fresh entries and marks stale entries", () => {
    let now = 1_000;
    const cache = new LiveOrderBookCache({
      maxAgeMs: 500,
      now: () => now,
    });

    cache.setPolymarketBook(
      "yes-token",
      {
        tokenId: "yes-token",
        bids: [{ price: 0.48, size: 10 }],
        asks: [{ price: 0.52, size: 10 }],
      },
      "rest",
    );

    expect(cache.getFreshPolymarketBook("yes-token")).toMatchObject({
      tokenId: "yes-token",
    });

    now = 2_000;

    expect(cache.getPolymarketBook("yes-token")?.stale).toBe(true);
    expect(cache.getFreshPolymarketBook("yes-token")).toBeUndefined();
  });

  it("keeps live-watched baseline books usable after the age TTL", () => {
    let now = 1_000;
    const cache = new LiveOrderBookCache({
      maxAgeMs: 500,
      now: () => now,
    });

    cache.setPolymarketBook(
      "yes-token",
      {
        tokenId: "yes-token",
        bids: [{ price: 0.48, size: 10 }],
        asks: [{ price: 0.52, size: 10 }],
      },
      "rest",
    );

    now = 2_000;

    expect(cache.getPolymarketBook("yes-token")).toMatchObject({
      stale: true,
      staleByAge: true,
      liveWatched: false,
    });

    cache.setPolymarketLiveWatched(["yes-token"], true);

    expect(cache.getPolymarketBook("yes-token")).toMatchObject({
      stale: false,
      staleByAge: true,
      liveWatched: true,
    });
    expect(cache.getFreshPolymarketBook("yes-token")).toMatchObject({
      tokenId: "yes-token",
    });
    expect(cache.stats()).toMatchObject({
      polymarketLiveWatched: 1,
    });
  });

  it("ingests Polymarket websocket book snapshots and price changes", () => {
    const cache = new LiveOrderBookCache({ now: () => 1_100 });

    expect(
      cache.ingestPolymarketWebSocketMessage(
        JSON.stringify({
          event_type: "book",
          asset_id: "yes-token",
          bids: [{ price: "0.48", size: "10" }],
          asks: [{ price: "0.52", size: "5" }],
          timestamp: "1000",
        }),
      ),
    ).toBe(1);
    expect(cache.getFreshPolymarketBook("yes-token")).toMatchObject({
      bids: [{ price: 0.48, size: 10 }],
      asks: [{ price: 0.52, size: 5 }],
    });

    expect(
      cache.ingestPolymarketWebSocketMessage(
        JSON.stringify({
          event_type: "price_change",
          timestamp: "1100",
          price_changes: [
            {
              asset_id: "yes-token",
              price: "0.53",
              size: "12",
              side: "SELL",
            },
            {
              asset_id: "yes-token",
              price: "0.48",
              size: "0",
              side: "BUY",
            },
          ],
        }),
      ),
    ).toBe(2);
    expect(cache.getFreshPolymarketBook("yes-token")).toMatchObject({
      bids: [],
      asks: [
        { price: 0.52, size: 5 },
        { price: 0.53, size: 12 },
      ],
    });
  });

  it("subscribes to the public Polymarket market websocket and writes messages into cache", () => {
    const cache = new LiveOrderBookCache();
    const sockets: FakeSocket[] = [];
    const ingestor = new PolymarketMarketWebSocketIngestor({
      assetIds: ["yes-token"],
      cache,
      heartbeatMs: 1_000_000,
      reconnect: false,
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    ingestor.start();
    sockets[0]?.emit("open");

    expect(cache.stats()).toMatchObject({
      polymarketLiveWatched: 1,
    });
    expect(JSON.parse(sockets[0]?.sent[0] ?? "{}")).toMatchObject({
      assets_ids: ["yes-token"],
      type: "market",
      custom_feature_enabled: true,
    });

    sockets[0]?.emit(
      "message",
      JSON.stringify({
        event_type: "book",
        asset_id: "yes-token",
        bids: [{ price: "0.48", size: "10" }],
        asks: [{ price: "0.52", size: "5" }],
      }),
    );

    expect(cache.getFreshPolymarketBook("yes-token")?.asks[0]).toEqual({
      price: 0.52,
      size: 5,
    });

    ingestor.stop();
    expect(cache.stats()).toMatchObject({
      polymarketLiveWatched: 0,
    });
  });

  it("ingests Kalshi orderbook snapshots and deltas into derived ask ladders", () => {
    const cache = new LiveOrderBookCache({ now: () => 2_000 });

    expect(
      cache.ingestKalshiWebSocketMessage(
        JSON.stringify({
          type: "orderbook_snapshot",
          msg: {
            market_ticker: "KXTEST",
            yes_dollars_fp: [["0.42", "10"]],
            no_dollars_fp: [["0.57", "5"]],
          },
        }),
      ),
    ).toBe(1);
    expect(cache.getFreshKalshiBook("KXTEST")).toMatchObject({
      ticker: "KXTEST",
      yesBids: [{ price: 0.42, size: 10 }],
      noBids: [{ price: 0.57, size: 5 }],
      yesAsks: [{ price: 0.43, size: 5 }],
      noAsks: [{ price: 0.58, size: 10 }],
    });

    expect(
      cache.ingestKalshiWebSocketMessage(
        JSON.stringify({
          type: "orderbook_delta",
          msg: {
            market_ticker: "KXTEST",
            price_dollars: "0.42",
            delta_fp: "-4",
            side: "yes",
            ts_ms: 2_000,
          },
        }),
      ),
    ).toBe(1);
    expect(cache.getFreshKalshiBook("KXTEST")?.yesBids).toEqual([
      { price: 0.42, size: 6 },
    ]);
  });

  it("connects to Kalshi with injected auth headers and subscribes to orderbook deltas", async () => {
    const cache = new LiveOrderBookCache();
    const sockets: FakeSocket[] = [];
    const socketOptions: Array<{ headers?: Record<string, string> } | undefined> = [];
    const ingestor = new KalshiOrderbookWebSocketIngestor({
      marketTickers: ["KXTEST"],
      cache,
      authHeadersProvider: () => ({
        "KALSHI-ACCESS-KEY": "test-key",
        "KALSHI-ACCESS-SIGNATURE": "test-signature",
        "KALSHI-ACCESS-TIMESTAMP": "123",
      }),
      reconnect: false,
      socketFactory: (_url, options) => {
        const socket = new FakeSocket();
        sockets.push(socket);
        socketOptions.push(options);
        return socket;
      },
    });

    ingestor.start();
    await Promise.resolve();
    sockets[0]?.emit("open");

    expect(cache.stats()).toMatchObject({
      kalshiLiveWatched: 1,
    });
    expect(socketOptions[0]?.headers).toMatchObject({
      "KALSHI-ACCESS-KEY": "test-key",
    });
    expect(JSON.parse(sockets[0]?.sent[0] ?? "{}")).toMatchObject({
      cmd: "subscribe",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: ["KXTEST"],
      },
    });

    sockets[0]?.emit(
      "message",
      JSON.stringify({
        type: "subscribed",
        msg: { channel: "orderbook_delta", sid: 7 },
      }),
    );
    ingestor.subscribe(["KXNEXT"]);

    expect(ingestor.status()).toMatchObject({
      connected: true,
      subscriptionId: 7,
      marketTickers: ["KXTEST", "KXNEXT"],
    });
    expect(JSON.parse(sockets[0]?.sent[1] ?? "{}")).toMatchObject({
      cmd: "update_subscription",
      params: {
        sid: 7,
        market_tickers: ["KXNEXT"],
        action: "add_markets",
      },
    });

    ingestor.stop();
    expect(cache.stats()).toMatchObject({
      kalshiLiveWatched: 0,
    });
  });
});

class FakeSocket implements WebSocketLike {
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit("close");
  }

  on(event: string, listener: (...args: unknown[]) => void): unknown {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}
