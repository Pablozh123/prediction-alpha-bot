import WebSocket from "ws";
import {
  normalizeKalshiOrderBook,
  type KalshiOrderBook,
} from "../utils/kalshi.js";
import type { OrderBook, OrderBookLevel } from "../utils/orderbook.js";

const DEFAULT_ORDERBOOK_CACHE_MAX_AGE_MS = 15_000;
const DEFAULT_POLYMARKET_MARKET_WS_URL =
  "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const DEFAULT_KALSHI_ORDERBOOK_WS_URL =
  "wss://external-api-ws.kalshi.com/trade-api/ws/v2";
const DEFAULT_POLYMARKET_HEARTBEAT_MS = 10_000;
const DEFAULT_ORDERBOOK_RECONNECT_MS = 2_000;

export type LiveOrderBookSource = "rest" | "websocket";

export type LiveOrderBookCacheEntry<T> = {
  identifier: string;
  orderbook: T;
  source: LiveOrderBookSource;
  updatedAt: number;
  liveWatched: boolean;
  stale: boolean;
  staleByAge: boolean;
};

export type LiveOrderBookCacheOptions = {
  maxAgeMs?: number;
  now?: () => number;
};

export type PolymarketBookSnapshotMessage = {
  event_type: "book";
  asset_id: string;
  bids?: RawPolymarketLevel[];
  asks?: RawPolymarketLevel[];
  timestamp?: string | number;
};

export type PolymarketPriceChangeMessage = {
  event_type: "price_change";
  price_changes?: PolymarketRawPriceChange[];
  timestamp?: string | number;
};

export type PolymarketRawPriceChange = {
  asset_id?: string;
  price?: string | number;
  size?: string | number;
  side?: string;
};

export type RawPolymarketLevel =
  | {
      price?: string | number;
      size?: string | number;
    }
  | [string | number, string | number];

export type KalshiOrderbookSnapshotMessage = {
  type: "orderbook_snapshot";
  msg?: {
    market_ticker?: string;
    yes_dollars_fp?: RawKalshiLevel[];
    no_dollars_fp?: RawKalshiLevel[];
  };
};

export type KalshiOrderbookDeltaMessage = {
  type: "orderbook_delta";
  msg?: {
    market_ticker?: string;
    price_dollars?: string | number;
    delta_fp?: string | number;
    side?: string;
    ts_ms?: string | number;
  };
};

export type RawKalshiLevel = [string | number, string | number];

export type WebSocketLike = {
  send(data: string): void;
  close(): void;
  on(event: "open" | "message" | "close" | "error", listener: (...args: unknown[]) => void): unknown;
};

export type WebSocketFactory = (
  url: string,
  options?: { headers?: Record<string, string> },
) => WebSocketLike;

export type PolymarketMarketWebSocketIngestorOptions = {
  assetIds: string[];
  cache: LiveOrderBookCache;
  url?: string;
  heartbeatMs?: number;
  reconnectMs?: number;
  reconnect?: boolean;
  socketFactory?: WebSocketFactory;
  warn?: (message: string) => void;
};

export type KalshiWebSocketAuthHeadersProvider =
  () => Record<string, string> | Promise<Record<string, string>>;

export type KalshiOrderbookWebSocketIngestorOptions = {
  marketTickers: string[];
  cache: LiveOrderBookCache;
  authHeadersProvider: KalshiWebSocketAuthHeadersProvider;
  url?: string;
  reconnectMs?: number;
  reconnect?: boolean;
  socketFactory?: WebSocketFactory;
  warn?: (message: string) => void;
};

type InternalCacheEntry<T> = Omit<
  LiveOrderBookCacheEntry<T>,
  "liveWatched" | "stale" | "staleByAge"
>;

export class LiveOrderBookCache {
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  private readonly kalshiBooks = new Map<string, InternalCacheEntry<KalshiOrderBook>>();
  private readonly polymarketBooks = new Map<string, InternalCacheEntry<OrderBook>>();
  private readonly liveWatchedKalshiTickers = new Set<string>();
  private readonly liveWatchedPolymarketTokenIds = new Set<string>();

  constructor(options: LiveOrderBookCacheOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_ORDERBOOK_CACHE_MAX_AGE_MS;
    this.now = options.now ?? Date.now;
  }

  setKalshiBook(
    ticker: string,
    orderbook: KalshiOrderBook,
    source: LiveOrderBookSource = "rest",
    updatedAt = this.now(),
  ): void {
    if (!ticker.trim()) {
      return;
    }

    this.kalshiBooks.set(ticker, {
      identifier: ticker,
      orderbook,
      source,
      updatedAt,
    });
  }

  getKalshiBook(ticker: string, maxAgeMs = this.maxAgeMs):
    | LiveOrderBookCacheEntry<KalshiOrderBook>
    | undefined {
    return this.decorateEntry(
      this.kalshiBooks.get(ticker),
      maxAgeMs,
      this.liveWatchedKalshiTickers.has(ticker),
    );
  }

  getFreshKalshiBook(
    ticker: string,
    maxAgeMs = this.maxAgeMs,
  ): KalshiOrderBook | undefined {
    const entry = this.getKalshiBook(ticker, maxAgeMs);

    return entry && !entry.stale ? entry.orderbook : undefined;
  }

  setPolymarketBook(
    tokenId: string,
    orderbook: OrderBook,
    source: LiveOrderBookSource = "rest",
    updatedAt = this.now(),
  ): void {
    if (!tokenId.trim()) {
      return;
    }

    this.polymarketBooks.set(tokenId, {
      identifier: tokenId,
      orderbook: {
        ...orderbook,
        tokenId: orderbook.tokenId || tokenId,
      },
      source,
      updatedAt,
    });
  }

  getPolymarketBook(tokenId: string, maxAgeMs = this.maxAgeMs):
    | LiveOrderBookCacheEntry<OrderBook>
    | undefined {
    return this.decorateEntry(
      this.polymarketBooks.get(tokenId),
      maxAgeMs,
      this.liveWatchedPolymarketTokenIds.has(tokenId),
    );
  }

  getFreshPolymarketBook(
    tokenId: string,
    maxAgeMs = this.maxAgeMs,
  ): OrderBook | undefined {
    const entry = this.getPolymarketBook(tokenId, maxAgeMs);

    return entry && !entry.stale ? entry.orderbook : undefined;
  }

  applyPolymarketBookSnapshot(
    message: PolymarketBookSnapshotMessage,
    source: LiveOrderBookSource = "websocket",
  ): boolean {
    const tokenId = optionalString(message.asset_id);

    if (!tokenId) {
      return false;
    }

    this.setPolymarketBook(
      tokenId,
      {
        tokenId,
        bids: normalizeLevels(message.bids).sort(
          (left, right) => right.price - left.price,
        ),
        asks: normalizeLevels(message.asks).sort(
          (left, right) => left.price - right.price,
        ),
      },
      source,
      parseTimestampMs(message.timestamp) ?? this.now(),
    );

    return true;
  }

  applyPolymarketPriceChange(
    change: PolymarketRawPriceChange,
    timestamp?: string | number,
  ): boolean {
    const tokenId = optionalString(change.asset_id);
    const price = parsePrice(change.price);
    const size = parseSize(change.size);
    const side = optionalString(change.side).toUpperCase();

    if (!tokenId || !isPlausiblePrice(price) || !Number.isFinite(size)) {
      return false;
    }

    const existing = this.polymarketBooks.get(tokenId)?.orderbook ?? {
      tokenId,
      bids: [],
      asks: [],
    };
    const nextBook =
      side === "BUY"
        ? {
            ...existing,
            bids: upsertLevel(existing.bids, price, size).sort(
              (left, right) => right.price - left.price,
            ),
          }
        : side === "SELL"
          ? {
              ...existing,
              asks: upsertLevel(existing.asks, price, size).sort(
                (left, right) => left.price - right.price,
              ),
            }
          : null;

    if (!nextBook) {
      return false;
    }

    this.setPolymarketBook(
      tokenId,
      nextBook,
      "websocket",
      parseTimestampMs(timestamp) ?? this.now(),
    );

    return true;
  }

  ingestPolymarketWebSocketMessage(message: unknown): number {
    const parsed = parseWebSocketJson(message);
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    let applied = 0;

    for (const item of messages) {
      if (!isObject(item)) {
        continue;
      }

      if (item.event_type === "book") {
        applied += this.applyPolymarketBookSnapshot(
          item as PolymarketBookSnapshotMessage,
        )
          ? 1
          : 0;
        continue;
      }

      if (item.event_type === "price_change") {
        const priceChangeMessage = item as PolymarketPriceChangeMessage;
        for (const change of priceChangeMessage.price_changes ?? []) {
          applied += this.applyPolymarketPriceChange(
            change,
            priceChangeMessage.timestamp,
          )
            ? 1
            : 0;
        }
      }
    }

    return applied;
  }

  applyKalshiOrderbookSnapshot(
    message: KalshiOrderbookSnapshotMessage,
    source: LiveOrderBookSource = "websocket",
  ): boolean {
    const ticker = optionalString(message.msg?.market_ticker);

    if (!ticker) {
      return false;
    }

    this.setKalshiBook(
      ticker,
      normalizeKalshiOrderBook(
        {
          orderbook_fp: {
            yes_dollars: message.msg?.yes_dollars_fp ?? [],
            no_dollars: message.msg?.no_dollars_fp ?? [],
          },
        },
        ticker,
      ),
      source,
    );

    return true;
  }

  applyKalshiOrderbookDelta(message: KalshiOrderbookDeltaMessage): boolean {
    const ticker = optionalString(message.msg?.market_ticker);
    const price = parsePrice(message.msg?.price_dollars);
    const delta = parseSize(message.msg?.delta_fp);
    const side = optionalString(message.msg?.side).toLowerCase();

    if (
      !ticker ||
      !isPlausiblePrice(price) ||
      !Number.isFinite(delta) ||
      !["yes", "no"].includes(side)
    ) {
      return false;
    }

    const existing = this.kalshiBooks.get(ticker)?.orderbook ?? {
      ticker,
      yesBids: [],
      noBids: [],
      yesAsks: [],
      noAsks: [],
    };
    const yesBids =
      side === "yes"
        ? applyDeltaToBidLevels(existing.yesBids, price, delta)
        : existing.yesBids;
    const noBids =
      side === "no"
        ? applyDeltaToBidLevels(existing.noBids, price, delta)
        : existing.noBids;

    this.setKalshiBook(
      ticker,
      buildKalshiOrderbookFromBids(ticker, yesBids, noBids),
      "websocket",
      parseTimestampMs(message.msg?.ts_ms) ?? this.now(),
    );

    return true;
  }

  ingestKalshiWebSocketMessage(message: unknown): number {
    const parsed = parseWebSocketJson(message);
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    let applied = 0;

    for (const item of messages) {
      if (!isObject(item)) {
        continue;
      }

      if (item.type === "orderbook_snapshot") {
        applied += this.applyKalshiOrderbookSnapshot(
          item as KalshiOrderbookSnapshotMessage,
        )
          ? 1
          : 0;
        continue;
      }

      if (item.type === "orderbook_delta") {
        applied += this.applyKalshiOrderbookDelta(
          item as KalshiOrderbookDeltaMessage,
        )
          ? 1
          : 0;
      }
    }

    return applied;
  }

  stats(): {
    kalshiBooks: number;
    kalshiLiveWatched: number;
    polymarketBooks: number;
    polymarketLiveWatched: number;
  } {
    return {
      kalshiBooks: this.kalshiBooks.size,
      kalshiLiveWatched: this.liveWatchedKalshiTickers.size,
      polymarketBooks: this.polymarketBooks.size,
      polymarketLiveWatched: this.liveWatchedPolymarketTokenIds.size,
    };
  }

  setKalshiLiveWatched(tickers: string[], liveWatched: boolean): void {
    setLiveWatchedIdentifiers(
      this.liveWatchedKalshiTickers,
      tickers,
      liveWatched,
    );
  }

  setPolymarketLiveWatched(tokenIds: string[], liveWatched: boolean): void {
    setLiveWatchedIdentifiers(
      this.liveWatchedPolymarketTokenIds,
      tokenIds,
      liveWatched,
    );
  }

  private decorateEntry<T>(
    entry: InternalCacheEntry<T> | undefined,
    maxAgeMs: number,
    liveWatched: boolean,
  ): LiveOrderBookCacheEntry<T> | undefined {
    if (!entry) {
      return undefined;
    }
    const staleByAge = this.now() - entry.updatedAt > maxAgeMs;

    return {
      ...entry,
      liveWatched,
      stale: staleByAge && !liveWatched,
      staleByAge,
    };
  }
}

export class PolymarketMarketWebSocketIngestor {
  private readonly cache: LiveOrderBookCache;
  private readonly url: string;
  private readonly heartbeatMs: number;
  private readonly reconnectMs: number;
  private readonly reconnect: boolean;
  private readonly socketFactory: WebSocketFactory;
  private readonly warn: (message: string) => void;
  private assetIds: string[];
  private socket: WebSocketLike | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(options: PolymarketMarketWebSocketIngestorOptions) {
    this.cache = options.cache;
    this.assetIds = uniqueStrings(options.assetIds);
    this.url = options.url ?? DEFAULT_POLYMARKET_MARKET_WS_URL;
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_POLYMARKET_HEARTBEAT_MS;
    this.reconnectMs = options.reconnectMs ?? DEFAULT_ORDERBOOK_RECONNECT_MS;
    this.reconnect = options.reconnect ?? true;
    this.socketFactory = options.socketFactory ?? defaultWebSocketFactory;
    this.warn = options.warn ?? console.warn;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.clearReconnect();
    this.socket?.close();
    this.socket = null;
  }

  subscribe(assetIds: string[]): void {
    const nextAssetIds = uniqueStrings(assetIds);
    const newAssetIds = nextAssetIds.filter((assetId) => !this.assetIds.includes(assetId));

    this.assetIds = uniqueStrings([...this.assetIds, ...nextAssetIds]);

    if (!this.stopped && this.socket === null && newAssetIds.length > 0) {
      this.connect();
      return;
    }

    if (newAssetIds.length > 0) {
      if (!this.stopped && this.socket !== null) {
        this.cache.setPolymarketLiveWatched(newAssetIds, true);
      }
      this.sendJson({
        assets_ids: newAssetIds,
        operation: "subscribe",
        custom_feature_enabled: true,
      });
    }
  }

  unsubscribe(assetIds: string[]): void {
    const remove = new Set(uniqueStrings(assetIds));

    this.assetIds = this.assetIds.filter((assetId) => !remove.has(assetId));

    if (remove.size > 0) {
      this.cache.setPolymarketLiveWatched([...remove], false);
      this.sendJson({
        assets_ids: [...remove],
        operation: "unsubscribe",
      });
    }
  }

  status(): {
    assetIds: string[];
    connected: boolean;
    stopped: boolean;
  } {
    return {
      assetIds: [...this.assetIds],
      connected: this.socket !== null && !this.stopped,
      stopped: this.stopped,
    };
  }

  private connect(): void {
    if (this.assetIds.length === 0) {
      return;
    }

    const socket = this.socketFactory(this.url);
    this.socket = socket;

    socket.on("open", () => {
      this.cache.setPolymarketLiveWatched(this.assetIds, true);
      this.sendJson({
        assets_ids: this.assetIds,
        type: "market",
        custom_feature_enabled: true,
      });
      this.clearHeartbeat();
      this.heartbeat = setInterval(() => {
        try {
          socket.send("PING");
        } catch (error) {
          this.warn(`Polymarket WebSocket heartbeat failed: ${errorMessage(error)}`);
        }
      }, this.heartbeatMs);
    });
    socket.on("message", (data) => {
      try {
        this.cache.ingestPolymarketWebSocketMessage(data);
      } catch (error) {
        this.warn(`Polymarket WebSocket message ignored: ${errorMessage(error)}`);
      }
    });
    socket.on("close", () => {
      this.clearHeartbeat();
      this.cache.setPolymarketLiveWatched(this.assetIds, false);
      this.socket = null;
      if (!this.stopped && this.reconnect) {
        this.clearReconnect();
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectMs);
      }
    });
    socket.on("error", (error) => {
      this.warn(`Polymarket WebSocket error: ${errorMessage(error)}`);
    });
  }

  private sendJson(payload: unknown): void {
    this.socket?.send(JSON.stringify(payload));
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export class KalshiOrderbookWebSocketIngestor {
  private readonly cache: LiveOrderBookCache;
  private readonly authHeadersProvider: KalshiWebSocketAuthHeadersProvider;
  private readonly url: string;
  private readonly reconnectMs: number;
  private readonly reconnect: boolean;
  private readonly socketFactory: WebSocketFactory;
  private readonly warn: (message: string) => void;
  private marketTickers: string[];
  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private commandId = 1;
  private subscriptionId: number | null = null;

  constructor(options: KalshiOrderbookWebSocketIngestorOptions) {
    this.cache = options.cache;
    this.authHeadersProvider = options.authHeadersProvider;
    this.marketTickers = uniqueStrings(options.marketTickers);
    this.url = options.url ?? DEFAULT_KALSHI_ORDERBOOK_WS_URL;
    this.reconnectMs = options.reconnectMs ?? DEFAULT_ORDERBOOK_RECONNECT_MS;
    this.reconnect = options.reconnect ?? true;
    this.socketFactory = options.socketFactory ?? defaultWebSocketFactory;
    this.warn = options.warn ?? console.warn;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.socket?.close();
    this.socket = null;
  }

  subscribe(marketTickers: string[]): void {
    const nextTickers = uniqueStrings(marketTickers);
    const newTickers = nextTickers.filter(
      (ticker) => !this.marketTickers.includes(ticker),
    );

    this.marketTickers = uniqueStrings([...this.marketTickers, ...nextTickers]);

    if (newTickers.length === 0) {
      return;
    }

    if (!this.stopped && this.socket === null) {
      void this.connect();
      return;
    }

    if (this.subscriptionId !== null) {
      this.cache.setKalshiLiveWatched(newTickers, true);
      this.sendJson({
        id: this.nextCommandId(),
        cmd: "update_subscription",
        params: {
          sid: this.subscriptionId,
          market_tickers: newTickers,
          action: "add_markets",
        },
      });
    }
  }

  status(): {
    connected: boolean;
    marketTickers: string[];
    stopped: boolean;
    subscriptionId: number | null;
  } {
    return {
      connected: this.socket !== null && !this.stopped,
      marketTickers: [...this.marketTickers],
      stopped: this.stopped,
      subscriptionId: this.subscriptionId,
    };
  }

  private async connect(): Promise<void> {
    if (this.marketTickers.length === 0 || this.socket !== null) {
      return;
    }

    try {
      const headers = await this.authHeadersProvider();
      const socket = this.socketFactory(this.url, { headers });
      this.socket = socket;

      socket.on("open", () => {
        this.cache.setKalshiLiveWatched(this.marketTickers, true);
        this.sendJson({
          id: this.nextCommandId(),
          cmd: "subscribe",
          params: {
            channels: ["orderbook_delta"],
            market_tickers: this.marketTickers,
          },
        });
      });
      socket.on("message", (data) => {
        try {
          this.handleMessage(data);
        } catch (error) {
          this.warn(`Kalshi WebSocket message ignored: ${errorMessage(error)}`);
        }
      });
      socket.on("close", () => {
        this.cache.setKalshiLiveWatched(this.marketTickers, false);
        this.socket = null;
        this.subscriptionId = null;
        if (!this.stopped && this.reconnect) {
          this.clearReconnect();
          this.reconnectTimer = setTimeout(() => void this.connect(), this.reconnectMs);
        }
      });
      socket.on("error", (error) => {
        this.warn(`Kalshi WebSocket error: ${errorMessage(error)}`);
      });
    } catch (error) {
      this.warn(`Kalshi WebSocket connect failed: ${errorMessage(error)}`);
      if (!this.stopped && this.reconnect) {
        this.clearReconnect();
        this.reconnectTimer = setTimeout(() => void this.connect(), this.reconnectMs);
      }
    }
  }

  private handleMessage(data: unknown): void {
    const parsed = parseWebSocketJson(data);

    if (isObject(parsed) && parsed.type === "subscribed" && isObject(parsed.msg)) {
      const sid = Number(parsed.msg.sid);
      if (Number.isFinite(sid)) {
        this.subscriptionId = sid;
      }
    }

    this.cache.ingestKalshiWebSocketMessage(data);
  }

  private sendJson(payload: unknown): void {
    this.socket?.send(JSON.stringify(payload));
  }

  private nextCommandId(): number {
    const id = this.commandId;
    this.commandId += 1;
    return id;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

function defaultWebSocketFactory(
  url: string,
  options?: { headers?: Record<string, string> },
): WebSocketLike {
  return new WebSocket(url, options) as unknown as WebSocketLike;
}

function parseWebSocketJson(message: unknown): unknown {
  const text = rawWebSocketDataToString(message);

  if (!text || text === "PONG" || text === "PING") {
    return null;
  }

  return JSON.parse(text) as unknown;
}

function rawWebSocketDataToString(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (Buffer.isBuffer(message)) {
    return message.toString("utf8");
  }

  if (Array.isArray(message)) {
    return Buffer.concat(message.filter(Buffer.isBuffer)).toString("utf8");
  }

  if (message instanceof ArrayBuffer) {
    return Buffer.from(message).toString("utf8");
  }

  return "";
}

function normalizeLevels(levels: RawPolymarketLevel[] | undefined): OrderBookLevel[] {
  if (!Array.isArray(levels)) {
    return [];
  }

  return levels.flatMap((level) => {
    const price = parsePrice(Array.isArray(level) ? level[0] : level.price);
    const size = parseSize(Array.isArray(level) ? level[1] : level.size);

    if (!isPlausiblePrice(price) || !Number.isFinite(size) || size <= 0) {
      return [];
    }

    return [{ price: roundPrice(price), size }];
  });
}

function upsertLevel(
  levels: OrderBookLevel[],
  price: number,
  size: number,
): OrderBookLevel[] {
  const roundedPrice = roundPrice(price);
  const next = levels.filter((level) => roundPrice(level.price) !== roundedPrice);

  if (size <= 0) {
    return next;
  }

  return [...next, { price: roundedPrice, size }];
}

function applyDeltaToBidLevels(
  levels: OrderBookLevel[],
  price: number,
  delta: number,
): OrderBookLevel[] {
  const roundedPrice = roundPrice(price);
  const existing = levels.find((level) => roundPrice(level.price) === roundedPrice);
  const nextSize = Math.max(0, (existing?.size ?? 0) + delta);

  return upsertLevel(levels, roundedPrice, nextSize).sort(
    (left, right) => right.price - left.price,
  );
}

function buildKalshiOrderbookFromBids(
  ticker: string,
  yesBids: OrderBookLevel[],
  noBids: OrderBookLevel[],
): KalshiOrderBook {
  return {
    ticker,
    yesBids,
    noBids,
    yesAsks: deriveComplementaryAsks(noBids),
    noAsks: deriveComplementaryAsks(yesBids),
  };
}

function deriveComplementaryAsks(bids: OrderBookLevel[]): OrderBookLevel[] {
  return bids
    .map((bid) => ({
      price: roundPrice(1 - bid.price),
      size: bid.size,
    }))
    .filter((level) => isPlausiblePrice(level.price) && level.size > 0)
    .sort((left, right) => left.price - right.price);
}

function parsePrice(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? roundPrice(parsed) : Number.NaN;
}

function parseSize(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseTimestampMs(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function setLiveWatchedIdentifiers(
  target: Set<string>,
  values: string[],
  liveWatched: boolean,
): void {
  for (const value of uniqueStrings(values)) {
    if (liveWatched) {
      target.add(value);
    } else {
      target.delete(value);
    }
  }
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlausiblePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
