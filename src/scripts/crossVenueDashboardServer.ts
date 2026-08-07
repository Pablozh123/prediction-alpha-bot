import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  scanCrossVenuePairs,
  type CrossVenueFeeConfig,
  type CrossVenuePair,
  type CrossVenueScanResult,
  type ScanCrossVenuePairsOptions,
} from "../scanner/crossVenueArbScanner.js";
import { buildCrossVenueCanonicalEvent } from "../scanner/canonicalPredictionMarket.js";
import {
  KalshiOrderbookWebSocketIngestor,
  LiveOrderBookCache,
  PolymarketMarketWebSocketIngestor,
} from "../scanner/liveOrderbookCache.js";
import {
  readCrossVenueLiveFeed,
  runCrossVenueArbScan,
  type CrossVenueReportData,
  type CrossVenueScanCliOptions,
} from "./crossVenueArbScan.js";
import {
  buildPolymarketBinaryMarkets,
  classifyCrossVenueResolutionCompatibility,
  discoverCrossVenuePairsWithDiagnostics,
  normalizeTextTokens,
  type CrossVenueDiscoveryResult,
  type CrossVenueMatchCandidatePreview,
  type PolymarketBinaryMarket,
} from "../scanner/crossVenueMatcher.js";
import {
  fetchActiveEvents,
  fetchPublicSearchEvents,
  type GammaRawEvent,
} from "../utils/gamma.js";
import {
  fetchKalshiMarkets as fetchKalshiMarketsDefault,
  type KalshiMarket,
} from "../utils/kalshi.js";
import { latestKnownResolutionAt } from "../utils/marketTime.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_REPORT_DIR = resolve("docs", "reports");
const DEFAULT_PAIRS_PATH = "config/crossVenuePairs.json";
const DEFAULT_DISCOVERY_REVIEW_PATH = resolve("config", "crossVenueDiscoveryReview.json");
const DEFAULT_LIVE_FEED_PATH = resolve("docs", "reports", "cross-venue-live-feed.json");
const DEFAULT_ORDERBOOK_CACHE_MAX_AGE_MS = 15_000;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

type ScanResultPaths = {
  jsonPath: string;
};

export type CrossVenueDashboardServerOptions = {
  host?: string;
  port?: number;
  reportDir?: string;
  pairsPath?: string;
  discoveryReviewPath?: string;
  liveFeedPath?: string;
  defaultDbPath?: string;
  defaultAutoDiscover?: boolean;
  orderbookCache?: LiveOrderBookCache;
  orderbookCacheMaxAgeMs?: number;
  enablePolymarketWebSocket?: boolean;
  kalshiOrderbookIngestor?: KalshiOrderbookIngestor;
  polymarketOrderbookIngestor?: PolymarketOrderbookIngestor;
  fetchGammaEvents?: (limit: number) => Promise<GammaRawEvent[]>;
  fetchGammaSearchEvents?: (
    query: string,
    limit: number,
  ) => Promise<GammaRawEvent[]>;
  fetchKalshiMarkets?: (options?: {
    eventTickers?: string[];
    limit?: number;
    maxPages?: number;
    seriesTickers?: string[];
    status?: "open";
  }) => Promise<KalshiMarket[]>;
  previewPairScan?: (
    pairs: CrossVenuePair[],
    options?: ScanCrossVenuePairsOptions,
  ) => Promise<CrossVenueScanResult>;
  scan?: (options: CrossVenueScanCliOptions) => Promise<ScanResultPaths>;
  log?: (message: string) => void;
};

export type PolymarketOrderbookIngestor = Pick<
  PolymarketMarketWebSocketIngestor,
  "start" | "stop" | "subscribe" | "status"
>;

export type KalshiOrderbookIngestor = Pick<
  KalshiOrderbookWebSocketIngestor,
  "start" | "stop" | "subscribe" | "status"
>;

export type CrossVenueKalshiSearchItem = {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle: string;
  yesSubTitle: string;
  noSubTitle: string;
  rulesPrimary?: string;
  rulesSecondary?: string;
  expectedResolutionAt: number | null;
  yesAsk: number | null;
  noAsk: number | null;
  liquidityDollars: number | null;
  volume24h: number | null;
  matchScore: number;
  matchReason: string;
};

export type CrossVenuePolymarketSearchItem = {
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  category?: string;
  rulesText?: string;
  resolutionSource?: string;
  expectedResolutionAt: number | null;
  liquidityDollars?: number | null;
  volume24h?: number | null;
  matchScore: number;
  matchReason: string;
};

export type CrossVenueMarketSearchResult = {
  query: string;
  kalshi: CrossVenueKalshiSearchItem[];
  polymarket: CrossVenuePolymarketSearchItem[];
};

export type CrossVenuePairQuality = {
  status: "ok" | "warning";
  matchScore: number;
  sharedTokens: string[];
  resolutionDiffHours: number | null;
  warnings: Array<
    | "low_text_overlap"
    | "missing_resolution_time"
    | "resolution_time_mismatch"
    | "resolution_terms_mismatch"
    | "missing_kalshi_ticker"
    | "missing_polymarket_tokens"
  >;
};

export type CrossVenuePairPreviewResult = {
  pair: CrossVenuePair;
  result: CrossVenueScanResult;
};

export function startCrossVenueDashboardServer(
  options: CrossVenueDashboardServerOptions = {},
): ReturnType<typeof createServer> {
  const host = options.host ?? process.env.CROSS_VENUE_DASHBOARD_HOST ?? DEFAULT_HOST;
  const port =
    options.port ??
    parseOptionalInteger(process.env.CROSS_VENUE_DASHBOARD_PORT) ??
    DEFAULT_PORT;
  const orderbookCache =
    options.orderbookCache ??
    new LiveOrderBookCache({
      maxAgeMs:
        options.orderbookCacheMaxAgeMs ??
        parseOptionalInteger(process.env.CROSS_VENUE_ORDERBOOK_CACHE_MAX_AGE_MS) ??
        DEFAULT_ORDERBOOK_CACHE_MAX_AGE_MS,
    });
  const enablePolymarketWebSocket =
    options.enablePolymarketWebSocket ??
    parseOptionalBooleanValue(process.env.CROSS_VENUE_POLYMARKET_WS) ??
    false;
  const polymarketOrderbookIngestor =
    options.polymarketOrderbookIngestor ??
    (enablePolymarketWebSocket
      ? new PolymarketMarketWebSocketIngestor({
          assetIds: initialPolymarketTokenIds(options),
          cache: orderbookCache,
          warn: (message) => options.log?.(message),
        })
      : undefined);
  const kalshiOrderbookIngestor = options.kalshiOrderbookIngestor;
  const runtimeOptions: CrossVenueDashboardServerOptions = {
    ...options,
    enablePolymarketWebSocket,
    kalshiOrderbookIngestor,
    orderbookCache,
    orderbookCacheMaxAgeMs:
      options.orderbookCacheMaxAgeMs ??
      parseOptionalInteger(process.env.CROSS_VENUE_ORDERBOOK_CACHE_MAX_AGE_MS) ??
      DEFAULT_ORDERBOOK_CACHE_MAX_AGE_MS,
    polymarketOrderbookIngestor,
  };
  subscribeOrderbooks(runtimeOptions, initialCrossVenuePairs(runtimeOptions));
  kalshiOrderbookIngestor?.start();
  polymarketOrderbookIngestor?.start();
  const server = createServer((request, response) => {
    handleCrossVenueDashboardRequest(request, response, runtimeOptions).catch(
      (error: unknown) => {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
  });

  server.listen(port, host, () => {
    runtimeOptions.log?.(`cross-venue dashboard listening on http://${host}:${port}`);
  });
  server.on("close", () => {
    kalshiOrderbookIngestor?.stop();
    polymarketOrderbookIngestor?.stop();
  });

  return server;
}

function initialCrossVenuePairs(
  options: CrossVenueDashboardServerOptions,
): CrossVenuePair[] {
  try {
    return readCrossVenuePairsConfig(resolvePairsPath(options)).pairs;
  } catch {
    return [];
  }
}

function initialPolymarketTokenIds(
  options: CrossVenueDashboardServerOptions,
): string[] {
  try {
    return polymarketTokenIdsFromPairs(
      readCrossVenuePairsConfig(resolvePairsPath(options)).pairs,
    );
  } catch (error) {
    options.log?.(
      `Skipping initial Polymarket WebSocket subscriptions: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

function subscribePolymarketOrderbooks(
  options: CrossVenueDashboardServerOptions,
  pairs: CrossVenuePair[],
): void {
  const tokenIds = polymarketTokenIdsFromPairs(pairs);

  if (tokenIds.length > 0) {
    options.polymarketOrderbookIngestor?.subscribe(tokenIds);
  }
}

function subscribeKalshiOrderbooks(
  options: CrossVenueDashboardServerOptions,
  pairs: CrossVenuePair[],
): void {
  const tickers = kalshiTickersFromPairs(pairs);

  if (tickers.length > 0) {
    options.kalshiOrderbookIngestor?.subscribe(tickers);
  }
}

function subscribeOrderbooks(
  options: CrossVenueDashboardServerOptions,
  pairs: CrossVenuePair[],
): void {
  subscribeKalshiOrderbooks(options, pairs);
  subscribePolymarketOrderbooks(options, pairs);
}

function kalshiTickersFromPairs(pairs: CrossVenuePair[]): string[] {
  return [
    ...new Set(
      pairs
        .map((pair) => pair.kalshi.ticker.trim())
        .filter(Boolean),
    ),
  ];
}

function polymarketTokenIdsFromPairs(pairs: CrossVenuePair[]): string[] {
  return [
    ...new Set(
      pairs
        .flatMap((pair) => [
          pair.polymarket.yesTokenId,
          pair.polymarket.noTokenId,
        ])
        .map((tokenId) => tokenId.trim())
        .filter(Boolean),
    ),
  ];
}

function latestOrderbookReadMetrics(
  options: CrossVenueDashboardServerOptions,
): CrossVenueReportData["orderbookReads"] | null {
  try {
    const latest = readLatestCrossVenueReport(options.reportDir);

    return "status" in latest ? null : latest.orderbookReads ?? null;
  } catch {
    return null;
  }
}

export async function handleCrossVenueDashboardRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: CrossVenueDashboardServerOptions = {},
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/") {
    writeHtml(response, 200, renderCrossVenueServerDashboardShell());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/latest") {
    writeJson(response, 200, readLatestCrossVenueReport(options.reportDir));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/live-feed") {
    writeJson(response, 200, readCrossVenueLiveFeed(resolveLiveFeedPath(options)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/orderbook-cache") {
    writeJson(response, 200, {
      cache: options.orderbookCache?.stats() ?? {
        kalshiBooks: 0,
        kalshiLiveWatched: 0,
        polymarketBooks: 0,
        polymarketLiveWatched: 0,
      },
      kalshiWebSocket: options.kalshiOrderbookIngestor?.status() ?? null,
      latestScanOrderbookReads: latestOrderbookReadMetrics(options),
      polymarketWebSocket: options.polymarketOrderbookIngestor?.status() ?? null,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/pairs") {
    writeJson(response, 200, readCrossVenuePairsConfig(resolvePairsPath(options)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/discovery-review") {
    writeJson(
      response,
      200,
      readDiscoveryReviewQueue(resolveDiscoveryReviewPath(options)),
    );
    return;
  }

  if (
    (request.method === "GET" || request.method === "POST") &&
    url.pathname === "/api/discovery-review/discover"
  ) {
    writeJson(
      response,
      200,
      await discoverAndPersistReviewCandidates(url, options),
    );
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/discovery-review") {
    const id = requiredString(url.searchParams.get("id"), "id");
    const body = await readJsonBody(request);
    writeJson(
      response,
      200,
      updateDiscoveryReviewEntry(
        resolveDiscoveryReviewPath(options),
        id,
        parseDiscoveryReviewPatch(body),
      ),
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/discovery-review/save") {
    const id = requiredString(url.searchParams.get("id"), "id");
    const body = await readJsonBody(request);
    const result = saveDiscoveryReviewPair({
      discoveryReviewPath: resolveDiscoveryReviewPath(options),
      pairsPath: resolvePairsPath(options),
      id,
      priority: parseOptionalBooleanValue(isObject(body) ? body.priority : undefined),
      verified: parseOptionalBooleanValue(isObject(body) ? body.verified : undefined),
    });

    subscribeOrderbooks(options, result.pairs.pairs);
    writeJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/search") {
    writeJson(response, 200, await searchCrossVenueMarketsFromUrl(url, options));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/pairs") {
    const pair = parsePairFromRequest(await readJsonBody(request));
    const config = upsertCrossVenuePair(resolvePairsPath(options), pair);

    subscribeOrderbooks(options, [pair]);
    writeJson(response, 200, config);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/pairs") {
    const id = requiredString(url.searchParams.get("id"), "id");
    const body = await readJsonBody(request);
    const enabled = parseEnabledFromRequest(body);
    const config = setCrossVenuePairEnabled(resolvePairsPath(options), id, enabled);

    writeJson(response, 200, config);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/pairs/priority") {
    const id = requiredString(url.searchParams.get("id"), "id");
    const body = await readJsonBody(request);
    const priority = parsePriorityFromRequest(body);
    const config = setCrossVenuePairPriority(resolvePairsPath(options), id, priority);

    writeJson(response, 200, config);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/pairs/verified") {
    const id = requiredString(url.searchParams.get("id"), "id");
    const body = await readJsonBody(request);
    const verified = parseVerifiedFromRequest(body);
    const config = setCrossVenuePairVerified(resolvePairsPath(options), id, verified);

    writeJson(response, 200, config);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/pairs/note") {
    const id = requiredString(url.searchParams.get("id"), "id");
    const body = await readJsonBody(request);
    const note = parseNoteFromRequest(body);
    const config = setCrossVenuePairNote(resolvePairsPath(options), id, note);

    writeJson(response, 200, config);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/pairs/priority/bulk") {
    const body = parseBulkPriorityFromRequest(await readJsonBody(request));
    const config = setCrossVenuePairsPriority(
      resolvePairsPath(options),
      body.ids,
      body.priority,
    );

    writeJson(response, 200, config);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/pairs/verified/bulk") {
    const body = parseBulkVerifiedFromRequest(await readJsonBody(request));
    const config = setCrossVenuePairsVerified(
      resolvePairsPath(options),
      body.ids,
      body.verified,
    );

    writeJson(response, 200, config);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/pairs/bulk") {
    const body = parseBulkEnabledFromRequest(await readJsonBody(request));
    const config = setCrossVenuePairsEnabled(
      resolvePairsPath(options),
      body.ids,
      body.enabled,
    );

    writeJson(response, 200, config);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/preview-pair") {
    const pair = parsePairFromRequest(await readJsonBody(request));
    const previewPairScan = options.previewPairScan ?? scanCrossVenuePairs;
    subscribeOrderbooks(options, [pair]);
    const result = await previewPairScan(
      [pair],
      buildPreviewOptionsFromUrl(url, options),
    );

    writeJson(response, 200, { pair, result } satisfies CrossVenuePairPreviewResult);
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/pairs") {
    const id = requiredString(url.searchParams.get("id"), "id");
    const config = removeCrossVenuePair(resolvePairsPath(options), id);

    writeJson(response, 200, config);
    return;
  }

  if (
    (request.method === "GET" || request.method === "POST") &&
    url.pathname === "/api/scan"
  ) {
    const scan = options.scan ?? runCrossVenueArbScan;
    const result = await scan(buildScanOptionsFromUrl(url, options));
    const payload = readCrossVenueReportJson(result.jsonPath);

    subscribeOrderbooks(options, payload.pairs);
    writeJson(response, 200, payload);
    return;
  }

  if (
    (request.method === "GET" || request.method === "POST") &&
    url.pathname === "/api/scan-ready"
  ) {
    const scan = options.scan ?? runCrossVenueArbScan;
    const scanOptions = buildScanOptionsFromUrl(url, options);
    scanOptions.autoDiscover = false;
    scanOptions.pairs = getReadyCrossVenuePairs(resolvePairsPath(options));
    subscribeOrderbooks(options, scanOptions.pairs);
    const result = await scan(scanOptions);
    const payload = readCrossVenueReportJson(result.jsonPath);

    subscribeOrderbooks(options, payload.pairs);
    writeJson(response, 200, payload);
    return;
  }

  if (
    (request.method === "GET" || request.method === "POST") &&
    url.pathname === "/api/scan-selected"
  ) {
    const scan = options.scan ?? runCrossVenueArbScan;
    const scanOptions = buildScanOptionsFromUrl(url, options);
    scanOptions.autoDiscover = false;
    scanOptions.pairs = getSelectedCrossVenuePairs(
      resolvePairsPath(options),
      parseSelectedPairIdsFromUrl(url),
    );
    subscribeOrderbooks(options, scanOptions.pairs);
    const result = await scan(scanOptions);
    const payload = readCrossVenueReportJson(result.jsonPath);

    subscribeOrderbooks(options, payload.pairs);
    writeJson(response, 200, payload);
    return;
  }

  writeJson(response, 404, { error: "not_found" });
}

export function renderCrossVenueServerDashboardShell(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Cross-Venue Arb Dashboard</title>",
    "<style>",
    serverDashboardCss(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<section class="topbar">',
    "<div>",
    "<h1>Arbitrage Opportunities</h1>",
    "<p>Live paper spreads sorted by ROI. Updates every 30s.</p>",
    "</div>",
    '<div class="data-badge"><span class="status-dot"></span><span id="simpleDataStatus">Loading Data</span></div>',
    "</section>",
    '<section class="simple-controls" aria-label="Primary dashboard controls">',
    '<input id="simpleSearch" type="search" placeholder="Search event or outcome">',
    '<label>Route<select id="simpleVenueFilter"><option value="all">All routes</option><option value="kalshi_yes_polymarket_no">Kalshi YES / Poly NO</option><option value="polymarket_yes_kalshi_no">Poly YES / Kalshi NO</option></select></label>',
    '<label>Category<select id="simpleCategoryFilter"><option value="all">All categories</option><option value="finance">Finance</option><option value="politics">Politics</option><option value="sports">Sports</option><option value="crypto">Crypto</option><option value="culture">Culture</option><option value="other">Other</option></select></label>',
    '<label>Review<select id="simpleReviewFilter"><option value="all">All pairs</option><option value="verified">Verified only</option><option value="new">New only</option><option value="needs_review">Needs review</option></select></label>',
    '<div class="slider-filter"><label for="simpleMinNetCents">Min Net Profit</label><div class="slider-row"><input id="simpleMinNetCents" type="range" min="0" max="20" step="0.1" value="0"><output id="simpleMinNetCentsValue" for="simpleMinNetCents">0.0c</output></div></div>',
    '<div class="slider-filter"><label for="simpleMinVolume24h">Min 24h Volume</label><div class="slider-row"><input id="simpleMinVolume24h" type="range" min="0" max="1000000" step="1000" value="0"><output id="simpleMinVolume24hValue" for="simpleMinVolume24h">$0</output></div></div>',
    '<div class="slider-filter"><label for="simpleMinLiquidity">Min Liquidity</label><div class="slider-row"><input id="simpleMinLiquidity" type="range" min="0" max="1000000" step="1000" value="0"><output id="simpleMinLiquidityValue" for="simpleMinLiquidity">$0</output></div></div>',
    '<div class="resolve-filter" role="group" aria-label="Resolves within"><span>Resolves Within</span><button type="button" class="active" data-simple-resolve-filter="any">Any</button><button type="button" data-simple-resolve-filter="7d">7d</button><button type="button" data-simple-resolve-filter="30d">30d</button><button type="button" data-simple-resolve-filter="90d">90d</button><button type="button" data-simple-resolve-filter="1yr">1yr</button></div>',
    '<button id="simpleRefresh" class="primary-action" type="button">Refresh</button>',
    '<button id="simpleScanConfigured" class="secondary-action" type="button">Scan configured</button>',
    '<button id="simpleStartWatch" class="secondary-action" type="button">Start 30s watch</button>',
    '<button id="simpleStopWatch" class="secondary-action" type="button" disabled>Stop watch</button>',
    "</section>",
    '<section class="status" id="status">Loading latest report...</section>',
    '<section class="status compact" id="watchStatus">Watch stopped.</section>',
    '<section class="opportunity-panel" aria-label="Arbitrage opportunities table"><div id="simpleStats" class="simple-stats"></div><div id="simpleOpportunities"></div></section>',
    '<section class="review-panel" aria-label="Pair discovery review" hidden><div class="review-heading"><div><h2>Pair Discovery Review</h2><p>Candidate same-event matches between Kalshi and Polymarket. Save only after manual rules check.</p></div><div class="review-actions"><select id="simpleDiscoveryStatusFilter"><option value="open">Open candidates</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="saved">Saved</option><option value="ignored">Ignored</option><option value="all">All</option></select><button id="simpleRunDiscoveryReview" type="button">Discover candidates</button><button id="simpleRefreshDiscoveryReview" type="button">Refresh review</button></div></div><div id="simpleDiscoveryStats" class="simple-stats"></div><div id="simpleDiscoveryReview"></div><div id="simpleDiscoveryReviewPreview"></div></section>',
    '<details class="advanced-dashboard" hidden>',
    '<summary>Advanced tools</summary>',
    '<section class="advanced-controls">',
    '<div class="actions">',
    '<button id="refresh" type="button">Refresh scan</button>',
    '<button id="scanConfigured" type="button">Scan configured pairs</button>',
    '<button id="scanReady" type="button">Scan ready pairs</button>',
    '<button id="startWatch" type="button">Start watch</button>',
    '<button id="startReadyWatch" type="button">Start ready watch</button>',
    '<button id="stopWatch" type="button" disabled>Stop watch</button>',
    '<button id="exportScanJson" type="button">Export scan JSON</button>',
    '<button id="exportArbsCsv" type="button">Export arbs CSV</button>',
    '<button id="exportVisibleArbsCsv" type="button">Export visible arbs CSV</button>',
    '<button id="exportVisibleSpreadsCsv" type="button">Export visible spreads CSV</button>',
    '<button id="exportPairsJson" type="button">Export pairs JSON</button>',
    '<button id="exportPairReviewCsv" type="button">Export pair review CSV</button>',
    '<button id="importPairsJson" type="button">Import pairs JSON</button>',
    '<input id="importPairsFile" type="file" accept="application/json,.json" hidden>',
    '<label><input id="notifyOnArbs" type="checkbox"> Notify on arbs</label>',
    '<label><input id="notifyVerifiedOnly" type="checkbox"> Verified alerts only</label>',
    '<button id="enableNotifications" type="button">Enable notifications</button>',
    '<label><input id="autoDiscover" type="checkbox" checked> Auto-discover</label>',
    '<label><input id="verifiedResultsOnly" type="checkbox"> Verified results only</label>',
    '<label class="scan-setting">Min edge c<input id="minNetCents" type="number" min="0" step="0.1" value="0.5"></label>',
    '<label class="scan-setting">Kalshi fee c<input id="kalshiFeeCents" type="number" min="0" step="0.1" value="0"></label>',
    '<label class="scan-setting">Poly fee c<input id="polymarketFeeCents" type="number" min="0" step="0.1" value="0"></label>',
    '<label class="scan-setting">Watch s<input id="watchIntervalSeconds" type="number" min="5" step="5" value="30"></label>',
    '<label class="scan-setting">Min profit $<input id="minResultProfitDollars" type="number" min="0" step="1" placeholder="any"></label>',
    '<label class="scan-setting">Min spread c<input id="minResultSpreadCents" type="number" min="0" step="0.1" placeholder="any"></label>',
    '<label class="scan-setting">Top rows<input id="resultLimitRows" type="number" min="1" step="1" placeholder="all"></label>',
    '<label class="scan-setting">Arb sort<select id="arbResultSort"><option value="report">Report order</option><option value="profit_desc">Profit desc</option><option value="net_desc">Net edge desc</option><option value="roi_desc">ROI desc</option><option value="size_desc">Size desc</option><option value="pair_status">Pair status</option><option value="local_state">Local state</option><option value="review">Review</option><option value="title">Title</option></select></label>',
    '<label class="scan-setting">Spread sort<select id="spreadResultSort"><option value="report">Report order</option><option value="diff_desc">Diff desc</option><option value="side">Side</option><option value="pair_status">Pair status</option><option value="local_state">Local state</option><option value="review">Review</option><option value="title">Title</option></select></label>',
    '<button id="showReviewedResults" type="button">Reviewed view</button>',
    '<button id="showPriorityResults" type="button">Priority view</button>',
    '<button id="showNewResultCandidates" type="button">New candidates</button>',
    '<button id="showNeedsReviewResults" type="button">Needs-review view</button>',
    '<input id="search" type="search" placeholder="Filter markets">',
    '<button id="clearResultFilters" type="button">Clear result filters</button>',
    "</div>",
    "</section>",
    '<section class="cards" id="cards"></section>',
    '<section class="panel"><div class="section-heading"><h2>Scan History</h2><button id="clearScanHistory" type="button">Clear history</button></div><div id="scanHistory"></div></section>',
    '<section class="panel"><div class="section-heading"><h2>Arbitrage Opportunities</h2><div class="pair-filter-controls"><button id="addVisibleArbs" type="button">Add visible arbs</button><button id="addVerifiedVisibleArbs" type="button">Add verified visible arbs</button><button id="addVerifiedPriorityVisibleArbs" type="button">Add verified priority visible arbs</button><button id="starVisibleArbs" type="button">Star visible arbs</button><button id="unstarVisibleArbs" type="button">Unstar visible arbs</button><button id="selectVisibleArbs" type="button">Select visible arbs</button><button id="previewVisibleArbResults" type="button">Preview visible arbs</button><button id="scanVisibleArbResults" type="button">Scan visible arbs</button><button id="startVisibleArbResultsWatch" type="button">Start visible arbs watch</button><button id="pauseVisibleArbResults" type="button">Pause visible arbs</button><button id="resumeVisibleArbResults" type="button">Resume visible arbs</button><button id="verifyVisibleArbResults" type="button">Verify visible arbs</button><button id="unverifyVisibleArbResults" type="button">Unverify visible arbs</button><button id="exportVisibleArbPairsJson" type="button">Export visible arb pairs JSON</button><button id="exportVisibleArbReviewCsv" type="button">Export visible arb review CSV</button></div><div id="arbSummary" class="pair-summary"></div></div><div id="arbs"></div><div id="arbResultPreview"></div></section>',
    '<section class="panel"><div class="section-heading"><h2>Price Differences</h2><div class="pair-filter-controls"><button id="addVisibleSpreads" type="button">Add visible spreads</button><button id="addVerifiedVisibleSpreads" type="button">Add verified visible spreads</button><button id="addVerifiedPriorityVisibleSpreads" type="button">Add verified priority visible spreads</button><button id="starVisibleSpreads" type="button">Star visible spreads</button><button id="unstarVisibleSpreads" type="button">Unstar visible spreads</button><button id="selectVisibleSpreads" type="button">Select visible spreads</button><button id="previewVisibleSpreadResults" type="button">Preview visible spreads</button><button id="scanVisibleSpreadResults" type="button">Scan visible spreads</button><button id="startVisibleSpreadResultsWatch" type="button">Start visible spreads watch</button><button id="pauseVisibleSpreadResults" type="button">Pause visible spreads</button><button id="resumeVisibleSpreadResults" type="button">Resume visible spreads</button><button id="verifyVisibleSpreadResults" type="button">Verify visible spreads</button><button id="unverifyVisibleSpreadResults" type="button">Unverify visible spreads</button><button id="exportVisibleSpreadPairsJson" type="button">Export visible spread pairs JSON</button><button id="exportVisibleSpreadReviewCsv" type="button">Export visible spread review CSV</button></div><div id="spreadSummary" class="pair-summary"></div></div><div id="spreads"></div><div id="spreadResultPreview"></div></section>',
    '<section class="panel"><div class="section-heading"><h2>Rejected Pairs</h2><div class="pair-filter-controls"><button id="exportRejectedCsv" type="button">Export rejected CSV</button><button id="pauseVisibleRejectedPairs" type="button">Pause visible rejected</button></div></div><div id="rejectionSummary" class="pair-summary"></div><div id="rejected"></div></section>',
    '<section class="panel"><div class="section-heading"><h2>Configured Pairs</h2><div class="pair-filter-controls"><button type="button" data-pair-filter="all">All</button><button type="button" data-pair-filter="priority">Priority</button><button type="button" data-pair-filter="verified">Verified</button><button type="button" data-pair-filter="unverified">Unverified</button><button type="button" data-pair-filter="ready">Ready</button><button type="button" data-pair-filter="active">Active</button><button type="button" data-pair-filter="paused">Paused</button><button type="button" data-pair-filter="review">Needs review</button><button type="button" data-pair-filter="lastArb">Last arb</button><button type="button" data-pair-filter="lastSpread">Last spread</button><button type="button" data-pair-filter="lastRejected">Last rejected</button><button type="button" id="selectVisiblePairs">Select visible</button><button type="button" id="clearSelectedPairs">Clear selection</button><button type="button" id="scanVisiblePairs">Scan visible</button><button type="button" id="scanSelectedPairs">Scan selected</button><button type="button" id="scanPriorityPairs">Scan priority</button><button type="button" id="scanVerifiedPairs">Scan verified</button><button type="button" id="scanLastRejectedPairs">Scan last-rejected</button><button type="button" id="startVisibleWatch">Start visible watch</button><button type="button" id="startSelectedWatch">Start selected watch</button><button type="button" id="startPriorityWatch">Start priority watch</button><button type="button" id="startVerifiedWatch">Start verified watch</button><button type="button" id="startLastRejectedWatch">Start last-rejected watch</button><button type="button" id="exportVisibleReviewCsv">Export visible review CSV</button><button type="button" id="copyVisibleReviewCsv">Copy visible review CSV</button><button type="button" id="copyVisibleSummaries">Copy visible summaries</button><button type="button" id="exportSelectedReviewCsv">Export selected review CSV</button><button type="button" id="copySelectedReviewCsv">Copy selected review CSV</button><button type="button" id="copySelectedSummaries">Copy selected summaries</button><button type="button" id="exportVisiblePairsJson">Export visible JSON</button><button type="button" id="copyVisiblePairsJson">Copy visible JSON</button><button type="button" id="exportSelectedPairsJson">Export selected JSON</button><button type="button" id="copySelectedPairsJson">Copy selected JSON</button><button type="button" id="exportReadyPairsJson">Export ready JSON</button><button type="button" id="exportPriorityPairsJson">Export priority JSON</button><button type="button" id="exportVerifiedPairsJson">Export verified JSON</button><button type="button" id="exportLastRejectedPairsJson">Export last-rejected JSON</button><button type="button" id="pauseVisiblePairs">Pause visible</button><button type="button" id="resumeVisiblePairs">Resume visible</button><button type="button" id="starVisiblePairs">Star visible</button><button type="button" id="unstarVisiblePairs">Unstar visible</button><button type="button" id="verifyVisiblePairs">Verify visible</button><button type="button" id="unverifyVisiblePairs">Unverify visible</button><button type="button" id="pauseSelectedPairs">Pause selected</button><button type="button" id="resumeSelectedPairs">Resume selected</button><button type="button" id="starSelectedPairs">Star selected</button><button type="button" id="unstarSelectedPairs">Unstar selected</button><button type="button" id="verifySelectedPairs">Verify selected</button><button type="button" id="unverifySelectedPairs">Unverify selected</button><button type="button" id="noteSelectedPairs">Note selected</button><button type="button" id="clearSelectedPairNotes">Clear selected notes</button><button type="button" id="removeSelectedPairs">Remove selected</button><button type="button" id="pauseNeedsReviewPairs">Pause needs-review</button><button type="button" id="pauseLastRejectedPairs">Pause last-rejected</button></div></div><div id="configPairSummary" class="pair-summary"></div><div id="configPairs"></div><div id="configPairPreview"></div></section>',
    '<section class="panel"><div class="section-heading"><h2>Discovery Review</h2><button id="refreshDiscoveryReview" type="button">Refresh review</button></div><div class="builder-controls"><input id="discoveryKalshiEvents" type="text" placeholder="Kalshi events"><input id="discoveryKalshiSeries" type="text" placeholder="Kalshi series"><input id="discoveryGammaSearch" type="text" placeholder="Polymarket search"><label class="scan-setting">Gamma<input id="discoveryGammaLimit" type="number" min="1" step="1" value="20"></label><label class="scan-setting">Min score<input id="discoveryMinMatchScore" type="number" min="0" max="1" step="0.05" value="0.7"></label><button id="runDiscoveryReview" type="button">Discover candidates</button></div><div id="discoveryReviewSummary" class="pair-summary"></div><div id="discoveryReview"></div><div id="discoveryReviewPreview"></div></section>',
    '<section class="panel"><h2>Pair Builder</h2><div class="builder-controls"><input id="pairSearch" type="search" placeholder="Search Kalshi and Polymarket"><button id="pairSearchButton" type="button">Search markets</button><button id="previewManualPair" type="button" disabled>Preview selected pair</button><button id="saveManualPair" type="button" disabled>Save configured pair</button><button id="saveVerifiedManualPair" type="button" disabled>Save verified pair</button></div><div id="selectedPair" class="selected-pair"></div><div id="pairPreview"></div><div id="searchResults"></div></section>',
    '<section class="panel"><h2>Matched Pairs</h2><div id="pairs"></div></section>',
    '<section class="panel"><div class="section-heading"><h2>Discovery Near Matches</h2><button id="exportNearCsv" type="button">Export near CSV</button></div><div id="nearSummary" class="pair-summary"></div><div id="near"></div><div id="nearPairPreview"></div></section>',
    '<section class="notes"><h2>Safety</h2><p>No live trading, no orders, no CLOB client, no wallets, no private keys. Positive output is diagnostic only.</p></section>',
    "</details>",
    "</main>",
    "<script>",
    serverDashboardScript(),
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

function buildScanOptionsFromUrl(
  url: URL,
  options: CrossVenueDashboardServerOptions,
): CrossVenueScanCliOptions {
  const scanOptions: CrossVenueScanCliOptions = {
    autoDiscover: parseBooleanParam(
      url.searchParams.get("autoDiscover"),
      options.defaultAutoDiscover ?? true,
    ),
    dbPath:
      url.searchParams.get("db") ??
      options.defaultDbPath ??
      process.env.DATABASE_PATH,
    dryRun: true,
    orderbookCache: options.orderbookCache,
    orderbookCacheMaxAgeMs: options.orderbookCacheMaxAgeMs,
    gammaLimit: parseOptionalNumberParam(url.searchParams.get("gammaLimit")),
    gammaSearchLimit: parseOptionalNumberParam(
      url.searchParams.get("gammaSearchLimit"),
    ),
    gammaSearchQueries: parseOptionalListParam(
      url.searchParams.get("gammaSearch") ??
        url.searchParams.get("gammaSearchQueries"),
    ),
    kalshiEventTickers: parseOptionalListParam(
      url.searchParams.get("kalshiEvents") ??
        url.searchParams.get("kalshiEventTickers"),
    ),
    kalshiLimit: parseOptionalNumberParam(url.searchParams.get("kalshiLimit")),
    kalshiMaxPages: parseOptionalNumberParam(
      url.searchParams.get("kalshiMaxPages"),
    ),
    kalshiSeriesTickers: parseOptionalListParam(
      url.searchParams.get("kalshiSeries") ??
        url.searchParams.get("kalshiSeriesTickers"),
    ),
    maxPairs: parseOptionalNumberParam(url.searchParams.get("maxPairs")),
    minMatchScore: parseOptionalNumberParam(
      url.searchParams.get("minMatchScore"),
    ),
    minNetCents: parseOptionalNumberParam(url.searchParams.get("minNetCents")),
    liveFeedPath: resolveLiveFeedPath(options),
    pairsPath: resolvePairsPath(options),
    quiet: true,
    reportDate: new Date().toISOString().slice(0, 10),
  };
  const kalshiFeeCents = parseOptionalNumberParam(
    url.searchParams.get("kalshiFeeCents"),
  );
  const polymarketFeeCents = parseOptionalNumberParam(
    url.searchParams.get("polymarketFeeCents"),
  );

  if (kalshiFeeCents !== undefined || polymarketFeeCents !== undefined) {
    scanOptions.feesCents = {};
    if (kalshiFeeCents !== undefined) {
      scanOptions.feesCents.kalshi = kalshiFeeCents;
    }
    if (polymarketFeeCents !== undefined) {
      scanOptions.feesCents.polymarket = polymarketFeeCents;
    }
  }

  return scanOptions;
}

function buildPreviewOptionsFromUrl(
  url: URL,
  serverOptions: CrossVenueDashboardServerOptions,
): ScanCrossVenuePairsOptions {
  const options: ScanCrossVenuePairsOptions = {
    minNetCents: parseOptionalNumberParam(url.searchParams.get("minNetCents")),
    orderbookCache: serverOptions.orderbookCache,
    orderbookCacheMaxAgeMs: serverOptions.orderbookCacheMaxAgeMs,
    warn: () => undefined,
  };
  const kalshiFeeCents = parseOptionalNumberParam(
    url.searchParams.get("kalshiFeeCents"),
  );
  const polymarketFeeCents = parseOptionalNumberParam(
    url.searchParams.get("polymarketFeeCents"),
  );

  if (kalshiFeeCents !== undefined || polymarketFeeCents !== undefined) {
    options.feesCents = {};
    if (kalshiFeeCents !== undefined) {
      options.feesCents.kalshi = kalshiFeeCents;
    }
    if (polymarketFeeCents !== undefined) {
      options.feesCents.polymarket = polymarketFeeCents;
    }
  }

  return options;
}

async function searchCrossVenueMarketsFromUrl(
  url: URL,
  options: CrossVenueDashboardServerOptions,
): Promise<CrossVenueMarketSearchResult> {
  return searchCrossVenueMarkets(
    url.searchParams.get("q") ?? url.searchParams.get("query") ?? "",
    {
      fetchGammaEvents: options.fetchGammaEvents,
      fetchGammaSearchEvents: options.fetchGammaSearchEvents,
      fetchKalshiMarkets: options.fetchKalshiMarkets,
      gammaLimit: parseOptionalNumberParam(url.searchParams.get("gammaLimit")),
      gammaSearchLimit: parseOptionalNumberParam(
        url.searchParams.get("gammaSearchLimit"),
      ),
      kalshiEventTickers: parseOptionalListParam(
        url.searchParams.get("kalshiEvents") ??
          url.searchParams.get("kalshiEventTickers"),
      ),
      kalshiLimit: parseOptionalNumberParam(url.searchParams.get("kalshiLimit")),
      kalshiMaxPages: parseOptionalNumberParam(
        url.searchParams.get("kalshiMaxPages"),
      ),
      kalshiSeriesTickers: parseOptionalListParam(
        url.searchParams.get("kalshiSeries") ??
          url.searchParams.get("kalshiSeriesTickers"),
      ),
    },
  );
}

export async function searchCrossVenueMarkets(
  query: string,
  options: {
    fetchGammaEvents?: (limit: number) => Promise<GammaRawEvent[]>;
    fetchGammaSearchEvents?: (
      query: string,
      limit: number,
    ) => Promise<GammaRawEvent[]>;
    fetchKalshiMarkets?: (options?: {
      eventTickers?: string[];
      limit?: number;
      maxPages?: number;
      seriesTickers?: string[];
      status?: "open";
    }) => Promise<KalshiMarket[]>;
    gammaLimit?: number;
    gammaSearchLimit?: number;
    kalshiEventTickers?: string[];
    kalshiLimit?: number;
    kalshiMaxPages?: number;
    kalshiSeriesTickers?: string[];
  } = {},
): Promise<CrossVenueMarketSearchResult> {
  const cleanedQuery = query.trim();
  const queryTokens = normalizeTextTokens(cleanedQuery);

  if (queryTokens.length === 0) {
    return { query: cleanedQuery, kalshi: [], polymarket: [] };
  }

  const fetchGammaEvents = options.fetchGammaEvents ?? fetchActiveEvents;
  const fetchGammaSearchEvents =
    options.fetchGammaSearchEvents ?? fetchPublicSearchEvents;
  const fetchKalshiMarkets =
    options.fetchKalshiMarkets ?? fetchKalshiMarketsDefault;
  const [gammaEvents, kalshiMarkets] = await Promise.all([
    options.fetchGammaEvents
      ? fetchGammaEvents(options.gammaLimit ?? 200)
      : fetchGammaSearchEvents(
          cleanedQuery,
          options.gammaSearchLimit ?? options.gammaLimit ?? 20,
        ),
    fetchKalshiMarkets({
      eventTickers: options.kalshiEventTickers,
      limit: options.kalshiLimit ?? 200,
      maxPages: options.kalshiMaxPages ?? 5,
      seriesTickers: options.kalshiSeriesTickers,
      status: "open",
    }),
  ]);
  const polymarketMarkets = buildPolymarketBinaryMarkets(gammaEvents);

  return {
    query: cleanedQuery,
    kalshi: kalshiMarkets
      .map((market) => buildKalshiSearchItem(market, queryTokens))
      .filter((item): item is CrossVenueKalshiSearchItem => item !== null)
      .sort(compareSearchItems)
      .slice(0, 20),
    polymarket: polymarketMarkets
      .map((market) => buildPolymarketSearchItem(market, queryTokens))
      .filter((item): item is CrossVenuePolymarketSearchItem => item !== null)
      .sort(compareSearchItems)
      .slice(0, 20),
  };
}

export function evaluateCrossVenuePairQuality(
  kalshi: CrossVenueKalshiSearchItem,
  polymarket: CrossVenuePolymarketSearchItem,
): CrossVenuePairQuality {
  const kalshiTokens = normalizeTextTokens(
    [
      kalshi.ticker,
      kalshi.eventTicker,
      kalshi.title,
      kalshi.subtitle,
      kalshi.yesSubTitle,
      kalshi.noSubTitle,
    ].join(" "),
  );
  const polymarketTokens = normalizeTextTokens(
    [polymarket.slug, polymarket.question].join(" "),
  );
  const sharedTokens = kalshiTokens.filter((token) =>
    polymarketTokens.includes(token),
  );
  const matchScore = roundSearchScore(
    sharedTokens.length /
      Math.max(1, Math.min(kalshiTokens.length, polymarketTokens.length)),
  );
  const resolutionDiffHours =
    Number.isFinite(kalshi.expectedResolutionAt) &&
    Number.isFinite(polymarket.expectedResolutionAt)
      ? roundHours(
          Math.abs(
            Number(kalshi.expectedResolutionAt) -
              Number(polymarket.expectedResolutionAt),
          ) /
            3_600_000,
        )
      : null;
  const warnings: CrossVenuePairQuality["warnings"] = [];

  if (!kalshi.ticker.trim()) {
    warnings.push("missing_kalshi_ticker");
  }

  if (!polymarket.yesTokenId.trim() || !polymarket.noTokenId.trim()) {
    warnings.push("missing_polymarket_tokens");
  }

  if (matchScore < 0.25) {
    warnings.push("low_text_overlap");
  }

  if (resolutionDiffHours === null) {
    warnings.push("missing_resolution_time");
  } else if (resolutionDiffHours > 14 * 24) {
    warnings.push("resolution_time_mismatch");
  }

  if (
    !classifyCrossVenueResolutionCompatibility(kalshi, polymarket).compatible
  ) {
    warnings.push("resolution_terms_mismatch");
  }

  return {
    status: warnings.length === 0 ? "ok" : "warning",
    matchScore,
    sharedTokens,
    resolutionDiffHours,
    warnings,
  };
}

function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildKalshiSearchItem(
  market: KalshiMarket,
  queryTokens: string[],
): CrossVenueKalshiSearchItem | null {
  const scored = scoreSearchText(
    [
      market.ticker,
      market.eventTicker,
      market.title,
      market.subtitle,
      market.yesSubTitle,
      market.noSubTitle,
    ].join(" "),
    queryTokens,
  );

  if (!scored) {
    return null;
  }

  return {
    ticker: market.ticker,
    eventTicker: market.eventTicker,
    title: market.title,
    subtitle: market.subtitle,
    yesSubTitle: market.yesSubTitle,
    noSubTitle: market.noSubTitle,
    ...(market.rulesPrimary ? { rulesPrimary: market.rulesPrimary } : {}),
    ...(market.rulesSecondary ? { rulesSecondary: market.rulesSecondary } : {}),
    expectedResolutionAt: latestKnownResolutionAt([
      market.closeTime,
      market.expectedExpirationTime,
    ]),
    yesAsk: market.yesAsk,
    noAsk: market.noAsk,
    liquidityDollars: market.liquidityDollars,
    volume24h: market.volume24h,
    matchScore: scored.matchScore,
    matchReason: scored.matchReason,
  };
}

function buildPolymarketSearchItem(
  market: PolymarketBinaryMarket,
  queryTokens: string[],
): CrossVenuePolymarketSearchItem | null {
  const scored = scoreSearchText(
    [market.slug, market.question].join(" "),
    queryTokens,
  );

  if (!scored) {
    return null;
  }

  return {
    slug: market.slug,
    question: market.question,
    yesTokenId: market.yesTokenId,
    noTokenId: market.noTokenId,
    category: market.category,
    ...(market.rulesText ? { rulesText: market.rulesText } : {}),
    ...(market.resolutionSource
      ? { resolutionSource: market.resolutionSource }
      : {}),
    expectedResolutionAt: market.expectedResolutionAt ?? null,
    liquidityDollars: market.liquidityDollars ?? null,
    volume24h: market.volume24h ?? null,
    matchScore: scored.matchScore,
    matchReason: scored.matchReason,
  };
}

function scoreSearchText(
  text: string,
  queryTokens: string[],
): { matchScore: number; matchReason: string } | null {
  const tokens = normalizeTextTokens(text);
  const sharedTokens = queryTokens.filter((token) => tokens.includes(token));

  if (sharedTokens.length === 0) {
    return null;
  }

  const matchScore =
    roundSearchScore(sharedTokens.length / queryTokens.length);

  return {
    matchScore,
    matchReason: `shared=${sharedTokens.slice(0, 8).join(",")}`,
  };
}

function roundSearchScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

function compareSearchItems(
  left: { matchScore: number; liquidityDollars?: number | null },
  right: { matchScore: number; liquidityDollars?: number | null },
): number {
  return (
    right.matchScore - left.matchScore ||
    (right.liquidityDollars ?? 0) - (left.liquidityDollars ?? 0)
  );
}

type CrossVenuePairsConfig = {
  feesCents?: CrossVenueFeeConfig;
  minNetCents?: number;
  pairs: CrossVenuePair[];
};

type DiscoveryReviewStatus = "new" | "reviewed" | "ignored" | "saved";

type DiscoveryReviewEntry = {
  id: string;
  status: DiscoveryReviewStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  candidate: CrossVenueMatchCandidatePreview;
  note?: string;
  savedPairId?: string;
};

type DiscoveryReviewQueue = {
  version: 1;
  generatedAt: string;
  updatedAt: string;
  summary: {
    total: number;
    new: number;
    reviewed: number;
    ignored: number;
    saved: number;
  };
  entries: DiscoveryReviewEntry[];
};

type ConfiguredPairReview = {
  status: "ok" | "review";
  label: string;
  warnings: string[];
};

type ConfiguredPairReviewContext = {
  kalshiTickerCounts: Map<string, number>;
  polymarketSlugCounts: Map<string, number>;
  tokenPairCounts: Map<string, number>;
};

function resolvePairsPath(options: CrossVenueDashboardServerOptions): string {
  return resolve(
    options.pairsPath ??
      process.env.CROSS_VENUE_PAIRS_PATH ??
      DEFAULT_PAIRS_PATH,
  );
}

function resolveDiscoveryReviewPath(
  options: CrossVenueDashboardServerOptions,
): string {
  return resolve(
    options.discoveryReviewPath ??
      process.env.CROSS_VENUE_DISCOVERY_REVIEW_PATH ??
      DEFAULT_DISCOVERY_REVIEW_PATH,
  );
}

function resolveLiveFeedPath(options: CrossVenueDashboardServerOptions): string {
  return resolve(
    options.liveFeedPath ??
      process.env.CROSS_VENUE_LIVE_FEED_PATH ??
      (options.reportDir
        ? join(options.reportDir, "cross-venue-live-feed.json")
        : DEFAULT_LIVE_FEED_PATH),
  );
}

function readCrossVenuePairsConfig(path: string): CrossVenuePairsConfig {
  if (!existsSync(path)) {
    return { pairs: [] };
  }

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (!isObject(parsed)) {
    throw new Error(`Invalid cross-venue pairs config at ${path}.`);
  }

  return {
    feesCents: isObject(parsed.feesCents)
      ? {
          kalshi: parseOptionalNumberValue(parsed.feesCents.kalshi),
          polymarket: parseOptionalNumberValue(parsed.feesCents.polymarket),
        }
      : undefined,
    minNetCents: parseOptionalNumberValue(parsed.minNetCents),
    pairs: Array.isArray(parsed.pairs)
      ? parsed.pairs.map(parseCrossVenuePair)
      : [],
  };
}

function readDiscoveryReviewQueue(path: string): DiscoveryReviewQueue {
  if (!existsSync(path)) {
    return buildDiscoveryReviewQueue([]);
  }

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (!isObject(parsed) || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid cross-venue discovery review queue at ${path}.`);
  }

  return buildDiscoveryReviewQueue(
    parsed.entries
      .map(parseDiscoveryReviewEntry)
      .filter((entry): entry is DiscoveryReviewEntry => entry !== null),
    optionalString(parsed.generatedAt) || undefined,
  );
}

function writeDiscoveryReviewQueue(
  path: string,
  queue: DiscoveryReviewQueue,
): DiscoveryReviewQueue {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(queue, null, 2)}\n`, "utf8");

  return queue;
}

function buildDiscoveryReviewQueue(
  entries: DiscoveryReviewEntry[],
  generatedAt = new Date().toISOString(),
): DiscoveryReviewQueue {
  const sortedEntries = [...entries].sort(compareDiscoveryReviewEntries);

  return {
    version: 1,
    generatedAt,
    updatedAt: new Date().toISOString(),
    summary: {
      total: sortedEntries.length,
      new: sortedEntries.filter((entry) => entry.status === "new").length,
      reviewed: sortedEntries.filter((entry) => entry.status === "reviewed").length,
      ignored: sortedEntries.filter((entry) => entry.status === "ignored").length,
      saved: sortedEntries.filter((entry) => entry.status === "saved").length,
    },
    entries: sortedEntries,
  };
}

function mergeDiscoveryReviewCandidates(
  queue: DiscoveryReviewQueue,
  candidates: CrossVenueMatchCandidatePreview[],
): DiscoveryReviewQueue {
  const now = new Date().toISOString();
  const byId = new Map(queue.entries.map((entry) => [entry.id, entry]));

  for (const candidate of candidates.filter(isReviewableDiscoveryCandidate)) {
    const id = discoveryReviewCandidateId(candidate);
    const previous = byId.get(id);

    byId.set(id, {
      id,
      status: previous?.status ?? "new",
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      seenCount: (previous?.seenCount ?? 0) + 1,
      candidate,
      ...(previous?.note ? { note: previous.note } : {}),
      ...(previous?.savedPairId ? { savedPairId: previous.savedPairId } : {}),
    });
  }

  return buildDiscoveryReviewQueue([...byId.values()], queue.generatedAt);
}

function isReviewableDiscoveryCandidate(
  candidate: CrossVenueMatchCandidatePreview,
): boolean {
  return (
    candidate.kalshiTicker.trim().length > 0 &&
    candidate.polymarketSlug.trim().length > 0 &&
    candidate.yesTokenId.trim().length > 0 &&
    candidate.noTokenId.trim().length > 0 &&
    !["compound_kalshi_market", "missing_kalshi_title"].includes(candidate.status)
  );
}

function parseDiscoveryReviewEntry(value: unknown): DiscoveryReviewEntry | null {
  if (!isObject(value) || !isObject(value.candidate)) {
    return null;
  }
  const candidate = parseDiscoveryCandidate(value.candidate);
  const id = optionalString(value.id) || discoveryReviewCandidateId(candidate);

  return {
    id,
    status: parseDiscoveryReviewStatus(value.status),
    firstSeenAt: optionalString(value.firstSeenAt) || new Date().toISOString(),
    lastSeenAt: optionalString(value.lastSeenAt) || new Date().toISOString(),
    seenCount: Math.max(1, Math.floor(parseOptionalNumberValue(value.seenCount) ?? 1)),
    candidate,
    ...(optionalString(value.note) ? { note: optionalString(value.note) } : {}),
    ...(optionalString(value.savedPairId)
      ? { savedPairId: optionalString(value.savedPairId) }
      : {}),
  };
}

function parseDiscoveryCandidate(
  value: Record<string, unknown>,
): CrossVenueMatchCandidatePreview {
  return {
    kalshiTicker: optionalString(value.kalshiTicker),
    kalshiTitle: optionalString(value.kalshiTitle),
    kalshiSubtitle: optionalString(value.kalshiSubtitle),
    polymarketSlug: optionalString(value.polymarketSlug),
    polymarketQuestion: optionalString(value.polymarketQuestion),
    yesTokenId: optionalString(value.yesTokenId),
    noTokenId: optionalString(value.noTokenId),
    outcomeLabel: optionalString(value.outcomeLabel) || "YES",
    ...(optionalString(value.category)
      ? { category: optionalString(value.category) }
      : {}),
    expectedResolutionAt: parseOptionalNumberValue(value.expectedResolutionAt) ?? null,
    ...(value.kalshiLiquidityDollars !== undefined
      ? {
          kalshiLiquidityDollars: parseNullableNumberValue(
            value.kalshiLiquidityDollars,
          ),
        }
      : {}),
    ...(value.kalshiVolume24h !== undefined
      ? { kalshiVolume24h: parseNullableNumberValue(value.kalshiVolume24h) }
      : {}),
    ...(value.polymarketLiquidityDollars !== undefined
      ? {
          polymarketLiquidityDollars: parseNullableNumberValue(
            value.polymarketLiquidityDollars,
          ),
        }
      : {}),
    ...(value.polymarketVolume24h !== undefined
      ? {
          polymarketVolume24h: parseNullableNumberValue(
            value.polymarketVolume24h,
          ),
        }
      : {}),
    ...(value.liquidityDollars !== undefined
      ? { liquidityDollars: parseNullableNumberValue(value.liquidityDollars) }
      : {}),
    ...(value.volume24h !== undefined
      ? { volume24h: parseNullableNumberValue(value.volume24h) }
      : {}),
    ...(optionalString(value.canonicalEventId)
      ? { canonicalEventId: optionalString(value.canonicalEventId) }
      : {}),
    ...(optionalString(value.canonicalOutcomeId)
      ? { canonicalOutcomeId: optionalString(value.canonicalOutcomeId) }
      : {}),
    ...(optionalString(value.canonicalOutcomeKey)
      ? { canonicalOutcomeKey: optionalString(value.canonicalOutcomeKey) }
      : {}),
    matchScore: parseOptionalNumberValue(value.matchScore) ?? 0,
    matchReason: optionalString(value.matchReason),
    status: parseDiscoveryCandidateStatus(value.status),
  };
}

function parseDiscoveryCandidateStatus(
  value: unknown,
): CrossVenueMatchCandidatePreview["status"] {
  const status = optionalString(value);
  if (
    [
      "candidate",
      "below_match_threshold",
      "ambiguous_match",
      "resolution_time_mismatch",
      "resolution_terms_mismatch",
      "compound_kalshi_market",
      "missing_kalshi_title",
    ].includes(status)
  ) {
    return status as CrossVenueMatchCandidatePreview["status"];
  }

  return "below_match_threshold";
}

function parseDiscoveryReviewStatus(value: unknown): DiscoveryReviewStatus {
  const status = optionalString(value);

  return ["new", "reviewed", "ignored", "saved"].includes(status)
    ? (status as DiscoveryReviewStatus)
    : "new";
}

function compareDiscoveryReviewEntries(
  left: DiscoveryReviewEntry,
  right: DiscoveryReviewEntry,
): number {
  return (
    discoveryReviewStatusRank(left.status) -
      discoveryReviewStatusRank(right.status) ||
    right.candidate.matchScore - left.candidate.matchScore ||
    Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt) ||
    left.id.localeCompare(right.id)
  );
}

function discoveryReviewStatusRank(status: DiscoveryReviewStatus): number {
  switch (status) {
    case "new":
      return 0;
    case "reviewed":
      return 1;
    case "saved":
      return 2;
    case "ignored":
      return 3;
  }
}

function discoveryReviewCandidateId(
  candidate: CrossVenueMatchCandidatePreview,
): string {
  return [
    candidate.kalshiTicker,
    candidate.polymarketSlug,
    candidate.yesTokenId,
    candidate.noTokenId,
  ].join("|");
}

function upsertCrossVenuePair(
  path: string,
  pair: CrossVenuePair,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  const remaining = config.pairs.filter((existing) => existing.id !== pair.id);
  const nextConfig = {
    ...config,
    pairs: [...remaining, pair].sort((left, right) => left.id.localeCompare(right.id)),
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

async function discoverAndPersistReviewCandidates(
  url: URL,
  options: CrossVenueDashboardServerOptions,
): Promise<{
  discoveryResult: CrossVenueDiscoveryResult;
  review: DiscoveryReviewQueue;
}> {
  const discoveryResult = await discoverCrossVenuePairsWithDiagnostics({
    fetchGammaEvents: options.fetchGammaEvents,
    fetchGammaSearchEvents: options.fetchGammaSearchEvents,
    fetchKalshiMarkets: options.fetchKalshiMarkets,
    gammaLimit: parseOptionalNumberParam(url.searchParams.get("gammaLimit")) ?? 3000,
    gammaSearchLimit: parseOptionalNumberParam(
      url.searchParams.get("gammaSearchLimit"),
    ),
    gammaSearchQueries: parseOptionalListParam(
      url.searchParams.get("gammaSearch") ??
        url.searchParams.get("gammaSearchQueries"),
    ),
    kalshiEventTickers: parseOptionalListParam(
      url.searchParams.get("kalshiEvents") ??
        url.searchParams.get("kalshiEventTickers"),
    ),
    kalshiLimit: parseOptionalNumberParam(url.searchParams.get("kalshiLimit")),
    kalshiMaxPages: parseOptionalNumberParam(
      url.searchParams.get("kalshiMaxPages"),
    ),
    kalshiSeriesTickers: parseOptionalListParam(
      url.searchParams.get("kalshiSeries") ??
        url.searchParams.get("kalshiSeriesTickers"),
    ),
    maxPairs: parseOptionalNumberParam(url.searchParams.get("maxPairs")) ?? 25,
    minMatchScore:
      parseOptionalNumberParam(url.searchParams.get("minMatchScore")) ?? 0.7,
  });
  const path = resolveDiscoveryReviewPath(options);
  const review = writeDiscoveryReviewQueue(
    path,
    mergeDiscoveryReviewCandidates(
      readDiscoveryReviewQueue(path),
      discoveryResult.candidatePreview,
    ),
  );

  return { discoveryResult, review };
}

function updateDiscoveryReviewEntry(
  path: string,
  id: string,
  patch: { note?: string; status?: DiscoveryReviewStatus },
): DiscoveryReviewQueue {
  const queue = readDiscoveryReviewQueue(path);
  let found = false;
  const entries = queue.entries.map((entry) => {
    if (entry.id !== id) {
      return entry;
    }
    found = true;

    const updated: DiscoveryReviewEntry = {
      ...entry,
      ...(patch.status ? { status: patch.status } : {}),
    };

    if (patch.note !== undefined) {
      const note = patch.note.trim();
      if (note) {
        updated.note = note;
      } else {
        delete updated.note;
      }
    }

    return updated;
  });

  if (!found) {
    throw new Error(`Discovery review candidate not found: ${id}`);
  }

  return writeDiscoveryReviewQueue(path, buildDiscoveryReviewQueue(entries, queue.generatedAt));
}

function saveDiscoveryReviewPair(input: {
  discoveryReviewPath: string;
  pairsPath: string;
  id: string;
  priority?: boolean;
  verified?: boolean;
}): { pairs: CrossVenuePairsConfig; review: DiscoveryReviewQueue } {
  const queue = readDiscoveryReviewQueue(input.discoveryReviewPath);
  const entry = queue.entries.find((item) => item.id === input.id);

  if (!entry) {
    throw new Error(`Discovery review candidate not found: ${input.id}`);
  }

  const pair = {
    ...buildPairFromDiscoveryCandidate(entry.candidate),
    enabled: true,
    priority: input.priority ?? false,
    verified: input.verified ?? true,
    note: entry.note
      ? entry.note
      : `Discovery-reviewed candidate: ${entry.candidate.matchReason}`,
  };
  const pairs = upsertCrossVenuePair(input.pairsPath, pair);
  const entries = queue.entries.map((item) =>
    item.id === input.id
      ? { ...item, status: "saved" as const, savedPairId: pair.id }
      : item,
  );
  const review = writeDiscoveryReviewQueue(
    input.discoveryReviewPath,
    buildDiscoveryReviewQueue(entries, queue.generatedAt),
  );

  return { pairs, review };
}

function buildPairFromDiscoveryCandidate(
  candidate: CrossVenueMatchCandidatePreview,
): CrossVenuePair {
  const title = candidate.kalshiTitle || candidate.polymarketQuestion;
  const outcomeLabel = candidate.outcomeLabel || "YES";
  const canonical = buildCrossVenueCanonicalEvent({
    title,
    outcomeLabel,
    category: candidate.category,
    expectedResolutionAt: candidate.expectedResolutionAt ?? null,
    kalshi: {
      ticker: candidate.kalshiTicker,
      title: candidate.kalshiTitle,
      subtitle: candidate.kalshiSubtitle,
      yesSubTitle: outcomeLabel,
      closeTime: candidate.expectedResolutionAt ?? null,
      liquidityDollars: candidate.kalshiLiquidityDollars ?? null,
      volume24h: candidate.kalshiVolume24h ?? null,
    },
    polymarket: {
      slug: candidate.polymarketSlug,
      question: candidate.polymarketQuestion,
      yesTokenId: candidate.yesTokenId,
      noTokenId: candidate.noTokenId,
      category: candidate.category,
      expectedResolutionAt: candidate.expectedResolutionAt ?? null,
      liquidityDollars: candidate.polymarketLiquidityDollars ?? null,
      volume24h: candidate.polymarketVolume24h ?? null,
    },
  });

  return {
    id: `${candidate.kalshiTicker}|${candidate.polymarketSlug}`,
    title,
    outcomeLabel,
    category: candidate.category,
    expectedResolutionAt: candidate.expectedResolutionAt ?? null,
    liquidityDollars: candidate.liquidityDollars ?? null,
    volume24h: candidate.volume24h ?? null,
    canonicalEvent: canonical.event,
    canonicalOutcome: canonical.outcome,
    kalshi: {
      ticker: candidate.kalshiTicker,
      liquidityDollars: candidate.kalshiLiquidityDollars ?? null,
      volume24h: candidate.kalshiVolume24h ?? null,
    },
    polymarket: {
      slug: candidate.polymarketSlug,
      yesTokenId: candidate.yesTokenId,
      noTokenId: candidate.noTokenId,
      liquidityDollars: candidate.polymarketLiquidityDollars ?? null,
      volume24h: candidate.polymarketVolume24h ?? null,
    },
  };
}

function parseDiscoveryReviewPatch(input: unknown): {
  note?: string;
  status?: DiscoveryReviewStatus;
} {
  if (!isObject(input)) {
    return {};
  }

  return {
    ...(typeof input.note === "string" ? { note: input.note } : {}),
    ...(input.status === undefined
      ? {}
      : { status: parseDiscoveryReviewStatus(input.status) }),
  };
}

function setCrossVenuePairEnabled(
  path: string,
  id: string,
  enabled: boolean,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  let found = false;
  const nextConfig = {
    ...config,
    pairs: config.pairs.map((pair) => {
      if (pair.id !== id) {
        return pair;
      }
      found = true;
      return { ...pair, enabled };
    }),
  };

  if (!found) {
    throw new Error(`Pair not found: ${id}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function setCrossVenuePairPriority(
  path: string,
  id: string,
  priority: boolean,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  let found = false;
  const nextConfig = {
    ...config,
    pairs: config.pairs.map((pair) => {
      if (pair.id !== id) {
        return pair;
      }
      found = true;
      return { ...pair, priority };
    }),
  };

  if (!found) {
    throw new Error(`Pair not found: ${id}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function setCrossVenuePairVerified(
  path: string,
  id: string,
  verified: boolean,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  let found = false;
  const nextConfig = {
    ...config,
    pairs: config.pairs.map((pair) => {
      if (pair.id !== id) {
        return pair;
      }
      found = true;
      return { ...pair, verified };
    }),
  };

  if (!found) {
    throw new Error(`Pair not found: ${id}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function setCrossVenuePairNote(
  path: string,
  id: string,
  note: string,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  let found = false;
  const normalizedNote = note.trim();
  const nextConfig = {
    ...config,
    pairs: config.pairs.map((pair) => {
      if (pair.id !== id) {
        return pair;
      }
      found = true;
      return normalizedNote
        ? { ...pair, note: normalizedNote }
        : { ...pair, note: undefined };
    }),
  };

  if (!found) {
    throw new Error(`Pair not found: ${id}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function setCrossVenuePairsPriority(
  path: string,
  ids: string[],
  priority: boolean,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  const uniqueIds = new Set(ids);
  const foundIds = new Set<string>();
  const nextConfig = {
    ...config,
    pairs: config.pairs.map((pair) => {
      if (!uniqueIds.has(pair.id)) {
        return pair;
      }
      foundIds.add(pair.id);
      return { ...pair, priority };
    }),
  };
  const missingIds = [...uniqueIds].filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Pair not found: ${missingIds.join(", ")}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function setCrossVenuePairsVerified(
  path: string,
  ids: string[],
  verified: boolean,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  const uniqueIds = new Set(ids);
  const foundIds = new Set<string>();
  const nextConfig = {
    ...config,
    pairs: config.pairs.map((pair) => {
      if (!uniqueIds.has(pair.id)) {
        return pair;
      }
      foundIds.add(pair.id);
      return { ...pair, verified };
    }),
  };
  const missingIds = [...uniqueIds].filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Pair not found: ${missingIds.join(", ")}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function setCrossVenuePairsEnabled(
  path: string,
  ids: string[],
  enabled: boolean,
): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  const uniqueIds = new Set(ids);
  const foundIds = new Set<string>();
  const nextConfig = {
    ...config,
    pairs: config.pairs.map((pair) => {
      if (!uniqueIds.has(pair.id)) {
        return pair;
      }
      foundIds.add(pair.id);
      return { ...pair, enabled };
    }),
  };
  const missingIds = [...uniqueIds].filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Pair not found: ${missingIds.join(", ")}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function removeCrossVenuePair(path: string, id: string): CrossVenuePairsConfig {
  const config = readCrossVenuePairsConfig(path);
  const nextConfig = {
    ...config,
    pairs: config.pairs.filter((pair) => pair.id !== id),
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return nextConfig;
}

function getReadyCrossVenuePairs(path: string): CrossVenuePair[] {
  const pairs = readCrossVenuePairsConfig(path).pairs;
  const reviewContext = buildConfiguredPairReviewContext(pairs);

  return pairs.filter(
    (pair) =>
      pair.enabled !== false &&
      reviewConfiguredPair(pair, reviewContext).status === "ok",
  );
}

function getSelectedCrossVenuePairs(path: string, ids: string[]): CrossVenuePair[] {
  const selectedIds = new Set(ids);

  return readCrossVenuePairsConfig(path).pairs.filter((pair) =>
    selectedIds.has(pair.id),
  );
}

function parseSelectedPairIdsFromUrl(url: URL): string[] {
  return [
    ...url.searchParams.getAll("id"),
    ...url.searchParams
      .getAll("ids")
      .flatMap((value) => value.split(","))
  ]
    .map((value) => value.trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function buildConfiguredPairReviewContext(
  pairs: CrossVenuePair[],
): ConfiguredPairReviewContext {
  const context: ConfiguredPairReviewContext = {
    kalshiTickerCounts: new Map(),
    polymarketSlugCounts: new Map(),
    tokenPairCounts: new Map(),
  };

  for (const pair of pairs) {
    incrementCount(context.kalshiTickerCounts, normalizedReviewKey(pair.kalshi.ticker));
    incrementCount(
      context.polymarketSlugCounts,
      normalizedReviewKey(pair.polymarket.slug),
    );
    incrementCount(context.tokenPairCounts, normalizedTokenPairKey(pair));
  }

  return context;
}

function incrementCount(counts: Map<string, number>, key: string): void {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function normalizedReviewKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizedTokenPairKey(pair: CrossVenuePair): string {
  return [
    pair.polymarket.yesTokenId.trim(),
    pair.polymarket.noTokenId.trim(),
  ]
    .filter(Boolean)
    .sort()
    .join("|");
}

function reviewConfiguredPair(
  pair: CrossVenuePair,
  context?: ConfiguredPairReviewContext,
): ConfiguredPairReview {
  const warnings: string[] = [];
  const kalshiTicker = pair.kalshi.ticker.trim();
  const polymarketSlug = pair.polymarket.slug.trim();
  const yesTokenId = pair.polymarket.yesTokenId.trim();
  const noTokenId = pair.polymarket.noTokenId.trim();
  const title = pair.title.trim();

  if (!kalshiTicker) warnings.push("missing_kalshi_ticker");
  if (!polymarketSlug) warnings.push("missing_polymarket_slug");
  if (!yesTokenId) warnings.push("missing_yes_token");
  if (!noTokenId) warnings.push("missing_no_token");
  if (!Number.isFinite(pair.expectedResolutionAt)) warnings.push("missing_resolution_time");
  if (
    context?.kalshiTickerCounts.get(normalizedReviewKey(kalshiTicker)) !==
    undefined &&
    (context.kalshiTickerCounts.get(normalizedReviewKey(kalshiTicker)) ?? 0) > 1
  ) {
    warnings.push("duplicate_kalshi_ticker");
  }
  if (
    context?.polymarketSlugCounts.get(normalizedReviewKey(polymarketSlug)) !==
    undefined &&
    (context.polymarketSlugCounts.get(normalizedReviewKey(polymarketSlug)) ?? 0) > 1
  ) {
    warnings.push("duplicate_polymarket_slug");
  }
  if (
    context?.tokenPairCounts.get(normalizedTokenPairKey(pair)) !== undefined &&
    (context.tokenPairCounts.get(normalizedTokenPairKey(pair)) ?? 0) > 1
  ) {
    warnings.push("duplicate_token_pair");
  }

  const leftTokens = normalizeTextTokens([title, pair.outcomeLabel, kalshiTicker].join(" "));
  const rightTokens = normalizeTextTokens(polymarketSlug);
  const sharedTokens = leftTokens.filter((token) => rightTokens.includes(token));
  if (title && polymarketSlug && sharedTokens.length === 0) {
    warnings.push("low_text_overlap");
  }

  return warnings.length === 0
    ? { status: "ok", label: "ok", warnings: [] }
    : { status: "review", label: `review: ${warnings.join(", ")}`, warnings };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    totalBytes += buffer.length;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      throw new Error("request_body_too_large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new Error("missing_json_body");
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parsePairFromRequest(value: unknown): CrossVenuePair {
  if (!isObject(value)) {
    throw new Error("Expected pair object.");
  }

  return parseCrossVenuePair(value.pair ?? value);
}

function parseEnabledFromRequest(value: unknown): boolean {
  if (!isObject(value) || typeof value.enabled !== "boolean") {
    throw new Error("Expected enabled boolean.");
  }

  return value.enabled;
}

function parsePriorityFromRequest(value: unknown): boolean {
  if (!isObject(value) || typeof value.priority !== "boolean") {
    throw new Error("Expected priority boolean.");
  }

  return value.priority;
}

function parseVerifiedFromRequest(value: unknown): boolean {
  if (!isObject(value) || typeof value.verified !== "boolean") {
    throw new Error("Expected verified boolean.");
  }

  return value.verified;
}

function parseNoteFromRequest(value: unknown): string {
  if (!isObject(value) || typeof value.note !== "string") {
    throw new Error("Expected note string.");
  }

  if (value.note.length > 1000) {
    throw new Error("note_too_long");
  }

  return value.note.trim();
}

function parseBulkEnabledFromRequest(value: unknown): {
  ids: string[];
  enabled: boolean;
} {
  if (
    !isObject(value) ||
    typeof value.enabled !== "boolean" ||
    !Array.isArray(value.ids)
  ) {
    throw new Error("Expected ids array and enabled boolean.");
  }

  const ids = value.ids.map((id, index) => requiredString(id, `ids[${index}]`));

  if (ids.length === 0) {
    throw new Error("Expected at least one pair id.");
  }

  return {
    ids,
    enabled: value.enabled,
  };
}

function parseBulkPriorityFromRequest(value: unknown): {
  ids: string[];
  priority: boolean;
} {
  if (
    !isObject(value) ||
    typeof value.priority !== "boolean" ||
    !Array.isArray(value.ids)
  ) {
    throw new Error("Expected ids array and priority boolean.");
  }

  const ids = value.ids.map((id, index) => requiredString(id, `ids[${index}]`));

  if (ids.length === 0) {
    throw new Error("Expected at least one pair id.");
  }

  return {
    ids,
    priority: value.priority,
  };
}

function parseBulkVerifiedFromRequest(value: unknown): {
  ids: string[];
  verified: boolean;
} {
  if (
    !isObject(value) ||
    typeof value.verified !== "boolean" ||
    !Array.isArray(value.ids)
  ) {
    throw new Error("Expected ids array and verified boolean.");
  }

  const ids = value.ids.map((id, index) => requiredString(id, `ids[${index}]`));

  if (ids.length === 0) {
    throw new Error("Expected at least one pair id.");
  }

  return {
    ids,
    verified: value.verified,
  };
}

function parseCrossVenuePair(value: unknown): CrossVenuePair {
  if (!isObject(value) || !isObject(value.kalshi) || !isObject(value.polymarket)) {
    throw new Error("Invalid cross-venue pair.");
  }

  const kalshiTicker = requiredString(value.kalshi.ticker, "kalshi.ticker");
  const polymarketSlug = requiredString(value.polymarket.slug, "polymarket.slug");
  const id = optionalString(value.id) || `${kalshiTicker}|${polymarketSlug}`;
  const canonicalEvent = parseCanonicalEventValue(value.canonicalEvent);
  const canonicalOutcome = parseCanonicalOutcomeValue(value.canonicalOutcome);

  return {
    id,
    title: optionalString(value.title) || polymarketSlug,
    outcomeLabel: optionalString(value.outcomeLabel) || "YES",
    category: optionalString(value.category) || undefined,
    enabled: value.enabled === false ? false : true,
    priority: value.priority === true,
    verified: value.verified === true,
    note: optionalString(value.note) || undefined,
    expectedResolutionAt: parseOptionalNumberValue(value.expectedResolutionAt),
    liquidityDollars: parseNullableNumberValue(value.liquidityDollars),
    volume24h: parseNullableNumberValue(value.volume24h),
    ...(canonicalEvent ? { canonicalEvent } : {}),
    ...(canonicalOutcome ? { canonicalOutcome } : {}),
    kalshi: {
      ticker: kalshiTicker,
      liquidityDollars: parseNullableNumberValue(value.kalshi.liquidityDollars),
      volume24h: parseNullableNumberValue(value.kalshi.volume24h),
    },
    polymarket: {
      slug: polymarketSlug,
      yesTokenId: requiredString(
        value.polymarket.yesTokenId,
        "polymarket.yesTokenId",
      ),
      noTokenId: requiredString(
        value.polymarket.noTokenId,
        "polymarket.noTokenId",
      ),
      liquidityDollars: parseNullableNumberValue(value.polymarket.liquidityDollars),
      volume24h: parseNullableNumberValue(value.polymarket.volume24h),
    },
  };
}

function parseCanonicalEventValue(
  value: unknown,
): CrossVenuePair["canonicalEvent"] {
  return isObject(value) && Array.isArray(value.outcomes)
    ? (value as CrossVenuePair["canonicalEvent"])
    : undefined;
}

function parseCanonicalOutcomeValue(
  value: unknown,
): CrossVenuePair["canonicalOutcome"] {
  return isObject(value) && Array.isArray(value.venueRefs)
    ? (value as CrossVenuePair["canonicalOutcome"])
    : undefined;
}

function readLatestCrossVenueReport(reportDir = DEFAULT_REPORT_DIR): CrossVenueReportData | {
  status: "missing";
} {
  if (!existsSync(reportDir)) {
    return { status: "missing" };
  }

  const latest = readdirSync(reportDir)
    .filter((name) => /^cross-venue-arb-\d{4}-\d{2}-\d{2}\.json$/u.test(name))
    .sort()
    .at(-1);

  if (!latest) {
    return { status: "missing" };
  }

  return readCrossVenueReportJson(join(reportDir, latest));
}

function readCrossVenueReportJson(path: string): CrossVenueReportData {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (!isObject(parsed) || !isObject(parsed.summary)) {
    throw new Error(`Invalid cross-venue report JSON at ${path}.`);
  }

  return parsed as CrossVenueReportData;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeHtml(
  response: ServerResponse,
  statusCode: number,
  html: string,
): void {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function serverDashboardCss(): string {
  return `
:root {
  color-scheme: light;
  --bg: #f8fafc;
  --panel: #ffffff;
  --ink: #06152d;
  --muted: #596985;
  --line: #dfe7f1;
  --soft-line: #edf1f6;
  --accent: #0f766e;
  --profit: #009f73;
  --profit-bg: #e4fff3;
  --warn: #92400e;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.shell { width: min(1104px, calc(100vw - 32px)); margin: 0 auto; padding: 26px 0 42px; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
h1, h2, p { margin: 0; }
h1 { font-size: 30px; line-height: 1.1; letter-spacing: 0; }
h2 { font-size: 16px; margin-bottom: 10px; }
p, .status, small { color: var(--muted); }
.data-badge { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; color: #475a78; font-size: 13px; white-space: nowrap; }
.status-dot { width: 8px; height: 8px; border-radius: 999px; background: #10b981; display: inline-block; }
.simple-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; margin: 30px 0 10px; }
.simple-controls label {
  display: grid;
  gap: 3px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.simple-controls input[type="search"] { width: min(300px, 100%); flex: 1 1 240px; }
.simple-controls input[type="number"] { width: 92px; min-height: 36px; }
.simple-controls select { min-width: 128px; max-width: 170px; }
.simple-controls .primary-action { background: #07162d; border-color: #07162d; }
.simple-controls .secondary-action { background: #fff; color: var(--ink); border-color: var(--line); }
.slider-filter {
  display: grid;
  gap: 6px;
  min-width: 170px;
  color: var(--muted);
  font-size: 12px;
}
.slider-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(54px, max-content);
  align-items: center;
  gap: 8px;
}
.slider-row input[type="range"] {
  width: 100%;
  accent-color: #07162d;
}
.slider-row output {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-width: 54px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: #07162d;
  font-weight: 700;
  font-size: 12px;
}
.resolve-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 5px;
  color: var(--muted);
  font-size: 12px;
}
.resolve-filter span {
  flex-basis: 100%;
}
.resolve-filter button {
  min-height: 30px;
  padding: 0 10px;
  background: #fff;
  color: var(--ink);
  border-color: var(--line);
}
.resolve-filter button.active {
  background: #07162d;
  color: #fff;
  border-color: #07162d;
}
.actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
button, input[type="search"], select {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
}
button { padding: 0 13px; cursor: pointer; background: var(--accent); color: #fff; border-color: var(--accent); }
button[disabled] { cursor: wait; opacity: 0.7; }
input[type="search"] { width: min(320px, 100%); padding: 0 11px; }
select { padding: 0 8px; max-width: 150px; }
.opportunity-panel {
  margin-top: 28px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.review-panel {
  margin-top: 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.review-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--soft-line);
}
.review-heading h2 { margin-bottom: 4px; }
.review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.review-actions button, .review-actions select {
  background: #fff;
  color: var(--ink);
  border-color: var(--line);
}
.simple-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: center;
  padding: 14px 24px;
  border-bottom: 1px solid var(--soft-line);
  color: var(--muted);
  font-size: 13px;
}
.simple-stats strong { color: var(--ink); }
.simple-note { color: var(--warn); }
.opportunity-table-wrap { overflow: auto; }
.opportunity-table {
  width: 100%;
  min-width: 780px;
  border-collapse: collapse;
}
.opportunity-table th,
.opportunity-table td {
  padding: 20px 24px;
  border-bottom: 1px solid var(--soft-line);
  text-align: left;
  vertical-align: middle;
}
.opportunity-table th {
  background: #f8fafc;
  color: #52617d;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}
.opportunity-table tr:last-child td { border-bottom: 0; }
.opportunity-table td:nth-child(4),
.opportunity-table td:nth-child(5),
.opportunity-table td:nth-child(6),
.opportunity-table th:nth-child(4),
.opportunity-table th:nth-child(5),
.opportunity-table th:nth-child(6) { text-align: right; }
.review-table { min-width: 900px; }
.review-table .action-cell { min-width: 210px; white-space: normal; }
.review-table button { margin: 0 4px 4px 0; background: #fff; color: var(--ink); border-color: var(--line); }
.review-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  min-width: 320px;
}
.review-reason {
  display: inline-block;
  max-width: 260px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-title { font-weight: 500; color: #06152d; }
.outcome-pill {
  display: inline-flex;
  align-items: center;
  max-width: 230px;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #f6f8fb;
  color: #173052;
  font-size: 12px;
}
.venue-stack { display: grid; gap: 2px; }
.venue-name { color: #8190aa; font-size: 12px; }
.venue-price { color: #06152d; font-weight: 600; }
.profit-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  padding: 4px 9px;
  border-radius: 6px;
  background: var(--profit-bg);
  color: var(--profit);
  font-weight: 700;
}
.roi-cell { font-weight: 700; color: #06152d; }
.advanced-dashboard { margin-top: 18px; }
.advanced-dashboard > summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 13px;
  padding: 10px 2px;
}
.advanced-controls { margin-top: 10px; }
.pair-filter-controls { display: flex; flex-wrap: wrap; gap: 6px; }
.pair-filter-controls button, .pair-summary button { background: #fff; color: var(--ink); border-color: var(--line); }
.pair-filter-controls button.active, .pair-summary button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.pair-summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 10px; color: var(--muted); font-size: 13px; }
.market-links { display: inline-flex; flex-wrap: wrap; gap: 8px; }
.market-links a { color: var(--accent); text-decoration: none; font-weight: 700; }
.market-links a:hover { text-decoration: underline; }
input[type="number"] {
  width: 72px;
  min-height: 30px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 8px;
}
.scan-setting {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  color: var(--muted);
  white-space: nowrap;
}
.builder-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.selected-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
.selected-box { border: 1px dashed var(--line); border-radius: 8px; padding: 10px; color: var(--muted); min-height: 58px; }
.selected-box strong { display: block; color: var(--ink); }
.quality-box { margin-bottom: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
.quality-box strong { display: block; }
.quality-ok { color: var(--accent); }
.quality-warning { color: var(--warn); }
.preview-box { margin-bottom: 10px; }
.preview-box h3 { margin: 12px 0 8px; font-size: 14px; }
.status { margin: 8px 0; padding: 9px 0; background: transparent; border: 0; border-radius: 0; font-size: 13px; }
.status.compact { margin-top: -8px; }
.cards { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.card, .panel, .notes { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.card { padding: 12px; display: grid; gap: 4px; }
.card strong { font-size: 21px; }
.panel, .notes { margin-top: 12px; padding: 14px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.section-heading h2 { margin-bottom: 0; }
.table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
table { width: 100%; min-width: 840px; border-collapse: collapse; }
th, td { padding: 9px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { background: #eef2f6; color: #414a58; font-size: 12px; text-transform: uppercase; }
th[data-sort-column] { cursor: pointer; user-select: none; }
th[data-sort-dir="asc"]::after { content: " asc"; color: var(--accent); }
th[data-sort-dir="desc"]::after { content: " desc"; color: var(--accent); }
tr:last-child td { border-bottom: 0; }
.empty { padding: 16px; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); }
.warn { color: var(--warn); }
[hidden] { display: none !important; }
@media (max-width: 980px) {
  .topbar { display: block; }
  .actions { justify-content: flex-start; margin-top: 12px; }
  .simple-controls { align-items: stretch; }
  .simple-controls input[type="search"] { flex-basis: 100%; }
  .slider-filter { flex: 1 1 220px; }
  .resolve-filter { flex: 1 1 260px; }
  .review-heading { display: block; }
  .review-actions { justify-content: flex-start; margin-top: 12px; }
  .opportunity-table th,
  .opportunity-table td { padding: 14px 16px; }
  .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .selected-pair { grid-template-columns: 1fr; }
}
`;
}

function serverDashboardScript(): string {
  return `
const SCAN_HISTORY_STORAGE_KEY = "crossVenueScanHistory:v1";
const NOTIFY_ON_ARBS_STORAGE_KEY = "crossVenueNotifyOnArbs:v1";
const NOTIFY_VERIFIED_ONLY_STORAGE_KEY = "crossVenueNotifyVerifiedOnly:v1";
const DASHBOARD_SETTINGS_STORAGE_KEY = "crossVenueDashboardSettings:v1";
const MAX_VISIBLE_RESULT_PREVIEWS = 25;
const SIMPLE_AUTO_REFRESH_MS = 30_000;
const ARB_RESULT_SORT_VALUES = new Set(["report", "profit_desc", "net_desc", "roi_desc", "size_desc", "pair_status", "local_state", "review", "title"]);
const SPREAD_RESULT_SORT_VALUES = new Set(["report", "diff_desc", "side", "pair_status", "local_state", "review", "title"]);
const PREVIEW_RESULT_SORT_VALUES = new Set(["preview_order", "edge_desc", "profit_desc", "diff_desc", "status", "pair_status", "local_state", "review", "title"]);
const state = {
  data: null,
  liveFeed: null,
  discoveryReview: null,
  query: "",
  marketSearch: { kalshi: [], polymarket: [] },
  resultPreviews: { arbs: [], spreads: [] },
  resultPreviewGeneratedAt: { arbs: 0, spreads: 0 },
  resultPreviewStatusFilter: { arbs: "", spreads: "" },
  resultPreviewPairStatusFilter: { arbs: "", spreads: "" },
  resultPreviewLocalStateFilter: { arbs: "", spreads: "" },
  resultPreviewReviewFilter: { arbs: "", spreads: "" },
  resultPreviewProblemOnly: { arbs: false, spreads: false },
  resultPreviewProblemReasonFilter: { arbs: "", spreads: "" },
  resultPreviewSearch: { arbs: "", spreads: "" },
  previewResultSort: { arbs: "preview_order", spreads: "preview_order" },
  configPairs: [],
  selectedConfigPairIds: [],
  selectedKalshi: null,
  selectedPolymarket: null,
  selectedPairPreviewId: "",
  configPairFilter: "all",
  reviewWarningFilter: "",
  scanInFlight: false,
  watchTimer: null,
  watchButtonId: "startWatch",
  watchEndpoint: "/api/scan",
  watchLabel: "Configured-pair watch",
  watchMode: "watch",
  watchParams: null,
  scanHistory: [],
  notifyOnArbs: false,
  notifyVerifiedOnly: false,
  verifiedResultsOnly: false,
  lastNotificationSignature: "",
  arbVenueFilter: "",
  spreadSideFilter: "",
  resultPairStatusFilter: "",
  resultLocalStateFilter: "",
  resultReviewFilter: "",
  arbResultSort: "report",
  spreadResultSort: "report",
  rejectionReasonFilter: "",
  nearStatusFilter: "",
  simpleVenueFilter: "all",
  simpleCategoryFilter: "all",
  simpleReviewFilter: "all",
  simpleResolveWithinFilter: "any",
  simpleDiscoveryStatusFilter: "open"
};
const $ = (id) => document.getElementById(id);

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function price(value) {
  return Number.isFinite(value) ? Number(value).toFixed(4) : "n/a";
}

function money(value) {
  return Number.isFinite(value) ? "$" + Number(value).toFixed(2) : "n/a";
}

function centsFromPrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  const cents = parsed * 100;
  return (Math.abs(cents - Math.round(cents)) < 0.05 ? String(Math.round(cents)) : cents.toFixed(1)) + "c";
}

function signedCents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return (parsed >= 0 ? "+" : "") + parsed.toFixed(1) + "c";
}

function centsFromCents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return parsed.toFixed(1) + "c";
}

function roiPercentFromBps(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  const percent = parsed / 100;
  return percent.toFixed(Math.abs(percent) >= 1 ? 1 : 2) + "%";
}

function simpleDateTime(value) {
  if (!value) return "not loaded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function matches(text) {
  return !state.query || String(text).toLowerCase().includes(state.query);
}

function renderSimpleDashboard(data) {
  const sourceResult = getSimpleSourceRows(data);
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const filteredRealRows = sourceResult.rows
    .filter((item) => matchesSimpleArbRow(item, reviewContext))
    .sort((left, right) => compareNumberDesc(left.roiBps, right.roiBps) || compareNumberDesc(left.netCents, right.netCents) || compareResultTitle(left, right))
    .slice(0, 50);
  const rows = filteredRealRows.map((item) => ({
      title: item.title,
      outcomeLabel: item.outcomeLabel,
      pair: simplePairText(item),
      trade: simpleTradeText(item),
      grossSpread: signedCents(item.grossCents),
      fees: centsFromCents(displayFeeCents(item)),
      netProfitPerShare: signedCents(displayNetCents(item))
    }));

  $("simpleDataStatus").textContent =
    sourceResult.source === "feed" ? "Live Feed" : sourceResult.source === "report" ? "Paper Data" : "No Live Data";
  $("simpleStats").innerHTML = renderSimpleStats(data, sourceResult.source, filteredRealRows.length, sourceResult.rows.length);
  $("simpleOpportunities").innerHTML = renderSimpleOpportunityTable(rows);
}

function getSimpleSourceRows(data) {
  const activeFeedRows = getActiveFeedOpportunities();
  const reportRows = data?.status === "missing" ? [] : (data?.opportunities || []);
  return {
    rows: activeFeedRows.length > 0 ? activeFeedRows : reportRows,
    source: activeFeedRows.length > 0 ? "feed" : reportRows.length > 0 ? "report" : "empty"
  };
}

function matchesSimpleArbRow(item, reviewContext) {
  return matches([item.title, item.outcomeLabel, item.slug, item.buyYesVenue, item.buyNoVenue].join(" "))
    && matchesSimpleVenueRoute(item)
    && matchesSimpleCategory(item)
    && matchesSimpleReviewState(item, reviewContext)
    && matchesSimpleResolutionWindow(item)
    && matchesSimpleMinimum("simpleMinNetCents", item?.netCents)
    && matchesSimpleMinimum("simpleMinVolume24h", simpleRowVolume24h(item))
    && matchesSimpleMinimum("simpleMinLiquidity", simpleRowLiquidity(item));
}

function matchesSimpleVenueRoute(item) {
  const filter = state.simpleVenueFilter || "all";
  if (filter === "all") return true;
  return simpleVenueRoute(item) === filter;
}

function simpleVenueRoute(item) {
  return [item?.buyYesVenue || "unknown", "yes", item?.buyNoVenue || "unknown", "no"].join("_");
}

function matchesSimpleCategory(item) {
  const filter = state.simpleCategoryFilter || "all";
  if (filter === "all") return true;
  return simpleCategory(item) === filter;
}

function simpleCategory(item) {
  const explicitCategory = normalizeSimpleCategory(item?.category || pairById(item?.pairId)?.category);
  if (explicitCategory !== "other") {
    return explicitCategory;
  }

  const text = [item?.title, item?.outcomeLabel, item?.slug].join(" ").toLowerCase();
  return normalizeSimpleCategory(text);
}

function normalizeSimpleCategory(textValue) {
  const text = String(textValue || "").toLowerCase();
  if (/bitcoin|btc|ethereum|eth|crypto|solana|token|coin/.test(text)) return "crypto";
  if (/fed|rate|inflation|cpi|gdp|recession|bank|oil|gold|stock|ipo|treasury|finance/.test(text)) return "finance";
  if (/election|president|senate|governor|mayor|trump|biden|democrat|republican|congress|parliament/.test(text)) return "politics";
  if (/nba|nfl|nhl|mlb|fifa|world cup|super bowl|champion|championship|league|open winner|sports/.test(text)) return "sports";
  if (/oscar|grammy|movie|film|emmy|album|song|box office|eurovision/.test(text)) return "culture";
  return "other";
}

function matchesSimpleReviewState(item, reviewContext) {
  const filter = state.simpleReviewFilter || "all";
  if (filter === "all") return true;
  const pair = pairById(item?.pairId);
  const pairStatus = resultPairStatus(item?.pairId);
  const reviewLabel = resultPairReviewLabel(item?.pairId, reviewContext);
  if (filter === "verified") return pair?.verified === true;
  if (filter === "new") return pairStatus === "new";
  if (filter === "needs_review") return reviewLabel !== "ok";
  return true;
}

function matchesSimpleResolutionWindow(item) {
  const filter = state.simpleResolveWithinFilter || "any";
  if (filter === "any") return true;
  const days = simpleResolveWithinDays(filter);
  if (!Number.isFinite(days)) return true;
  const resolutionAt = simpleRowResolutionAt(item);
  if (!Number.isFinite(resolutionAt)) return false;
  const now = Date.now();
  return resolutionAt >= now - 86_400_000 && resolutionAt <= now + days * 86_400_000;
}

function simpleResolveWithinDays(filter) {
  if (filter === "7d") return 7;
  if (filter === "30d") return 30;
  if (filter === "90d") return 90;
  if (filter === "1yr") return 365;
  return Number.NaN;
}

function matchesSimpleMinimum(inputId, value) {
  const minimum = readOptionalNumberInput(inputId);
  return minimum === null || Number(value || 0) >= minimum;
}

function simpleRowVolume24h(item) {
  const pair = pairById(item?.pairId);
  return firstFiniteNumber([
    item?.volume24h,
    pair?.volume24h,
    pair?.kalshi?.volume24h,
    pair?.polymarket?.volume24h,
  ]);
}

function simpleRowLiquidity(item) {
  const pair = pairById(item?.pairId);
  return firstFiniteNumber([
    item?.liquidityDollars,
    pair?.liquidityDollars,
    pair?.kalshi?.liquidityDollars,
    pair?.polymarket?.liquidityDollars,
  ]);
}

function simpleRowResolutionAt(item) {
  const pair = pairById(item?.pairId);
  return normalizeTimestampMs(firstFiniteNumber([
    item?.expectedResolutionAt,
    pair?.expectedResolutionAt,
    pair?.canonicalEvent?.expectedResolutionAt,
    pair?.canonicalOutcome?.expectedResolutionAt,
  ]));
}

function normalizeTimestampMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 0 && parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function firstFiniteNumber(values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function simpleFilterSummary() {
  const labels = [];
  if (state.query) labels.push("Search active");
  if (state.simpleVenueFilter !== "all") labels.push("Route: " + state.simpleVenueFilter.replaceAll("_", " "));
  if (state.simpleCategoryFilter !== "all") labels.push("Category: " + state.simpleCategoryFilter);
  if (state.simpleReviewFilter !== "all") labels.push("Review: " + state.simpleReviewFilter.replaceAll("_", " "));
  if (state.simpleResolveWithinFilter !== "any") labels.push("Resolves within " + state.simpleResolveWithinFilter);
  const minNet = readOptionalNumberInput("simpleMinNetCents");
  const minVolume = readOptionalNumberInput("simpleMinVolume24h");
  const minLiquidity = readOptionalNumberInput("simpleMinLiquidity");
  if (minNet !== null && minNet > 0) labels.push("Min net " + minNet + "c");
  if (minVolume !== null && minVolume > 0) labels.push("Min 24h volume $" + minVolume);
  if (minLiquidity !== null && minLiquidity > 0) labels.push("Min liquidity $" + minLiquidity);
  return labels;
}

function getActiveFeedOpportunities() {
  return (state.liveFeed?.entries || [])
    .filter((entry) => entry.active === true && entry.kind === "opportunity" && entry.lastOpportunity)
    .map((entry) => entry.lastOpportunity);
}

function renderSimpleStats(data, source, visibleCount, totalCount) {
  const feed = state.liveFeed;
  if (!data || data.status === "missing") {
    return [
      "<strong>No paper scan loaded</strong>",
      "<span>Persistent feed entries: " + html(feed?.summary?.totalEntries || 0) + "</span>",
      "<span>Paper-only</span>"
    ].join("");
  }

  return [
    "<strong>" + html(totalCount) + " arbitrage row(s)</strong>",
    "<span>" + html(feed?.summary?.activePriceSpreads ?? Number(data.summary?.priceSpreads || 0)) + " active price spread(s)</span>",
    "<span>Feed updated " + html(simpleDateTime(feed?.updatedAt || data.generatedAt)) + "</span>",
    "<span>Paper-only</span>",
    ...simpleFilterSummary().map((label) => "<span>" + html(label) + "</span>"),
    visibleCount !== totalCount ? "<span>" + html(visibleCount) + " visible after filter</span>" : ""
  ].filter(Boolean).join("");
}

function renderSimpleOpportunityTable(rows) {
  if (rows.length === 0) {
    return '<div class="empty-state">No active YES+NO arbitrage right now.</div>';
  }

  return '<div class="opportunity-table-wrap"><table class="opportunity-table"><thead><tr>' +
    ["Event", "Pair", "Trade", "Gross Spread", "Fees", "Net Profit / Share"].map((header) => "<th>" + html(header) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows.map((item) => '<tr>' +
      '<td><span class="event-title">' + html(item.title) + '</span><br><span class="outcome-pill">' + html(item.outcomeLabel) + '</span></td>' +
      '<td><span class="venue-stack">' + html(item.pair).replaceAll("\\n", "<br>") + '</span></td>' +
      '<td><span class="venue-stack">' + html(item.trade).replaceAll("\\n", "<br>") + '</span></td>' +
      '<td><span class="profit-pill">' + html(item.grossSpread) + '</span></td>' +
      '<td><span class="venue-price">' + html(item.fees) + '</span></td>' +
      '<td><span class="profit-pill">' + html(item.netProfitPerShare) + '</span></td>' +
    '</tr>').join("") +
    "</tbody></table></div>";
}

function simplePairText(item) {
  return [
    venueLabel(item?.buyYesVenue) + " YES " + centsFromPrice(item?.yesLeg?.bestAsk),
    venueLabel(item?.buyNoVenue) + " NO " + centsFromPrice(item?.noLeg?.bestAsk)
  ].join("\\n");
}

function simpleTradeText(item) {
  return [
    "Buy YES on " + venueLabel(item?.buyYesVenue) + " @ " + centsFromPrice(item?.yesLeg?.bestAsk),
    "Buy NO on " + venueLabel(item?.buyNoVenue) + " @ " + centsFromPrice(item?.noLeg?.bestAsk)
  ].join("\\n");
}

function venueLabel(value) {
  const venue = String(value || "").toLowerCase();
  if (venue === "polymarket") return "Polymarket";
  if (venue === "kalshi") return "Kalshi";
  return value || "Unknown";
}

function displayFeeCents(item) {
  const fee = Number(item?.feeCents);
  if (Number.isFinite(fee)) return fee;

  const gross = Number(item?.grossCents);
  const net = Number(item?.netCents);
  if (Number.isFinite(gross) && Number.isFinite(net)) {
    return gross - net;
  }

  return 0;
}

function displayNetCents(item) {
  const gross = Number(item?.grossCents);
  if (!Number.isFinite(gross)) return Number.NaN;
  return gross - displayFeeCents(item);
}

function renderCards(data) {
  const discovery = data.discoveryResult;
  const bestArb = bestOpportunity(data.opportunities || []);
  const bestSpread = bestPriceSpread(data.priceSpreads || []);
  $("cards").innerHTML = [
    card("Arbs", data.summary?.opportunities ?? 0, "YES+NO cross-venue"),
    card("Spreads", data.summary?.priceSpreads ?? 0, "same-side differences"),
    card("Best Arb", bestArb ? Number(bestArb.netCents).toFixed(2) + "c" : "n/a", bestArb ? bestArb.title + " | " + money(bestArb.maxProfitDollars) : "no candidate"),
    card("Best Spread", bestSpread ? Number(bestSpread.diffCents).toFixed(2) + "c" : "n/a", bestSpread ? bestSpread.title + " | " + bestSpread.side : "no spread"),
    card("Matched", data.summary?.pairsScanned ?? 0, "pairs scanned"),
    card("Discovery", discovery ? discovery.kalshiMarketCount + " / " + discovery.polymarketMarketCount : "manual", "Kalshi / Polymarket"),
    card("Mode", data.dryRun ? "dry-run" : "journal", "paper-only")
  ].join("");
}

function card(label, value, help) {
  return '<article class="card"><small>' + html(label) + '</small><strong>' + html(value) + '</strong><small>' + html(help) + '</small></article>';
}

function bestOpportunity(opportunities) {
  return [...opportunities].sort((left, right) =>
    Number(right.netCents || 0) - Number(left.netCents || 0) ||
    Number(right.maxProfitDollars || 0) - Number(left.maxProfitDollars || 0)
  )[0] || null;
}

function bestPriceSpread(spreads) {
  return [...spreads].sort((left, right) =>
    Number(right.diffCents || 0) - Number(left.diffCents || 0)
  )[0] || null;
}

function table(headers, rows) {
  if (rows.length === 0) return '<p class="empty">No rows.</p>';
  return '<div class="table-wrap"><table><thead><tr>' +
    headers.map((header, index) => '<th data-sort-column="' + index + '" title="Sort column">' + html(header) + '</th>').join("") +
    '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';
}

function row(cells) {
  return '<tr>' + cells.map((cell) => '<td>' + html(cell) + '</td>').join("") + '</tr>';
}

function rowWithAction(cells, actionHtml) {
  return '<tr>' + cells.map((cell) => '<td>' + html(cell) + '</td>').join("") + '<td>' + actionHtml + '</td></tr>';
}

function rowRaw(cells) {
  return '<tr>' + cells.map((cell) => '<td>' + cell + '</td>').join("") + '</tr>';
}

function externalLink(label, url) {
  return url
    ? '<a href="' + html(url) + '" target="_blank" rel="noreferrer">' + html(label) + '</a>'
    : html(label);
}

function kalshiMarketUrl(ticker) {
  const value = String(ticker || "").trim();
  return value ? "https://kalshi.com/markets?search=" + encodeURIComponent(value) : "";
}

function polymarketMarketUrl(slug) {
  const value = String(slug || "").trim();
  return value ? "https://polymarket.com/search?query=" + encodeURIComponent(value) : "";
}

function kalshiMarketLink(ticker) {
  const value = String(ticker || "").trim();
  return value ? externalLink(value, kalshiMarketUrl(value)) : "";
}

function polymarketMarketLink(slug) {
  const value = String(slug || "").trim();
  return value ? externalLink(value, polymarketMarketUrl(value)) : "";
}

function pairMarketLinks(pair) {
  const links = [
    pair?.kalshi?.ticker ? externalLink("Kalshi", kalshiMarketUrl(pair.kalshi.ticker)) : "",
    pair?.polymarket?.slug ? externalLink("Polymarket", polymarketMarketUrl(pair.polymarket.slug)) : ""
  ].filter(Boolean);
  return links.length > 0 ? '<span class="market-links">' + links.join("") + '</span>' : "";
}

function pairById(pairId) {
  return state.configPairs.find((item) => item.id === pairId)
    || (state.data?.pairs || []).find((item) => item.id === pairId)
    || null;
}

function previewPairButton(pairId) {
  return pairId
    ? '<button type="button" data-preview-config-pair="' + html(pairId) + '">Preview</button>'
    : '<span class="warn">No pair id</span>';
}

function addReportPairButton(pairId) {
  if (isConfiguredPairId(pairId)) {
    return '<span>Saved</span>';
  }
  return pairId
    ? '<button type="button" data-add-report-pair="' + html(pairId) + '">Add pair</button>'
    : "";
}

function addReportVerifiedPairButton(pairId) {
  const configuredPair = configuredPairById(pairId);
  if (configuredPair) {
    return "";
  }
  return pairId
    ? '<button type="button" data-add-verified-report-pair="' + html(pairId) + '">Add verified</button>'
    : "";
}

function addReportPriorityPairButton(pairId) {
  const configuredPair = configuredPairById(pairId);
  if (configuredPair) {
    return "";
  }
  return pairId
    ? '<button type="button" data-add-priority-report-pair="' + html(pairId) + '">Add priority</button>'
    : "";
}

function addReportVerifiedPriorityPairButton(pairId) {
  const configuredPair = configuredPairById(pairId);
  if (configuredPair) {
    return "";
  }
  return pairId
    ? '<button type="button" data-add-verified-priority-report-pair="' + html(pairId) + '">Add verified priority</button>'
    : "";
}

function resultPairLocalToggleActions(pairId) {
  const configuredPair = configuredPairById(pairId);
  if (!configuredPair) {
    return "";
  }

  return [
    '<button type="button" data-edit-note-pair="' + html(pairId) + '">Note</button>',
    '<button type="button" data-clear-note-pair="' + html(pairId) + '">Clear note</button>',
    '<button type="button" data-toggle-priority-pair="' + html(pairId) + '" data-toggle-priority="' + html(configuredPair.priority === true ? "false" : "true") + '">' + html(configuredPair.priority === true ? "Unstar" : "Star") + '</button>',
    '<button type="button" data-toggle-verified-pair="' + html(pairId) + '" data-toggle-verified="' + html(configuredPair.verified === true ? "false" : "true") + '">' + html(configuredPair.verified === true ? "Unverify" : "Verify") + '</button>',
    '<button type="button" data-toggle-pair="' + html(pairId) + '" data-toggle-enabled="' + html(configuredPair.enabled === false ? "true" : "false") + '">' + html(configuredPair.enabled === false ? "Resume" : "Pause") + '</button>'
  ].join(" ");
}

function scanConfiguredPairButton(pairId) {
  return isConfiguredPairId(pairId)
    ? '<button type="button" data-scan-config-pair="' + html(pairId) + '">Scan</button>'
    : "";
}

function isConfiguredPairId(pairId) {
  return Boolean(pairId) && state.configPairs.some((item) => item.id === pairId);
}

function configuredPairById(pairId) {
  return pairId ? state.configPairs.find((item) => item.id === pairId) || null : null;
}

function resultPairStatus(pairId) {
  if (!pairId) {
    return "missing_pair_id";
  }
  const configuredPair = configuredPairById(pairId);
  if (configuredPair?.verified === true) {
    return "verified";
  }
  if (configuredPair) {
    return "saved";
  }
  return pairById(pairId) ? "new" : "unknown";
}

function resultPairLocalState(pairId) {
  if (!pairId) {
    return "missing_pair_id";
  }

  const configuredPair = configuredPairById(pairId);
  if (!configuredPair) {
    return pairById(pairId) ? "not saved" : "unknown";
  }

  return [
    configuredPair.enabled === false ? "paused" : "active",
    configuredPair.priority === true ? "priority" : "normal",
    configuredPair.verified === true ? "verified" : "unverified",
    configuredPair.note ? "noted" : ""
  ].filter(Boolean).join(", ");
}

function resultPairReviewLabel(pairId, reviewContext) {
  if (!pairId) {
    return "missing_pair_id";
  }

  const configuredPair = configuredPairById(pairId);
  if (!configuredPair) {
    return pairById(pairId) ? "not saved" : "unknown";
  }

  return getConfiguredPairReview(configuredPair, reviewContext).label;
}

function resultPairNote(pairId) {
  return configuredPairById(pairId)?.note || "";
}

function copyPairJsonButton(pairId) {
  return pairId && pairById(pairId)
    ? '<button type="button" data-copy-pair-json="' + html(pairId) + '">Copy pair JSON</button>'
    : "";
}

function copyPairSummaryButton(pairId) {
  return pairId && pairById(pairId)
    ? '<button type="button" data-copy-pair-summary="' + html(pairId) + '">Copy summary</button>'
    : "";
}

function resultPairActions(pairId) {
  return [previewPairButton(pairId), scanConfiguredPairButton(pairId), addReportPairButton(pairId), addReportVerifiedPairButton(pairId), addReportPriorityPairButton(pairId), addReportVerifiedPriorityPairButton(pairId), copyPairJsonButton(pairId), copyPairSummaryButton(pairId), resultPairLocalToggleActions(pairId), pairMarketLinks(pairById(pairId))].filter(Boolean).join(" ");
}

function removePreviewResultRowAction(kind, index) {
  return Number.isInteger(index) && index >= 0
    ? '<button type="button" data-remove-preview-result-row-kind="' + html(kind) + '" data-remove-preview-result-row-index="' + html(index) + '">Remove preview row</button>'
    : "";
}

function downloadText(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

async function copyPairJson(pairId) {
  const pair = configuredPairById(pairId) || pairById(pairId);
  if (!pair) {
    $("status").textContent = "No pair mapping available to copy.";
    return;
  }

  await copyTextToClipboard(JSON.stringify({ pairs: [pair] }, null, 2));
  $("status").textContent = "Pair JSON copied to clipboard.";
}

function pairSummaryLine(label, value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(" / ") : value;
  const clean = String(text ?? "").trim();
  return clean ? label + ": " + clean : "";
}

function buildPairSummaryText(pairId) {
  const pair = configuredPairById(pairId) || pairById(pairId);
  if (!pair) return "";
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const review = configuredPairById(pairId)
    ? getConfiguredPairReview(pair, reviewContext).label
    : resultPairReviewLabel(pairId, reviewContext);
  const expectedResolutionAt = Number.isFinite(pair.expectedResolutionAt)
    ? new Date(Number(pair.expectedResolutionAt)).toISOString()
    : "";
  return [
    pairSummaryLine("Pair", [pair.title, pair.outcomeLabel]),
    pairSummaryLine("Pair ID", pair.id || pairId),
    pairSummaryLine("Pair status", resultPairStatus(pairId)),
    pairSummaryLine("Local state", resultPairLocalState(pairId)),
    pairSummaryLine("Review", review),
    pairSummaryLine("Last scan", getPairLastScanStatus(pair)),
    pairSummaryLine("Note", resultPairNote(pairId)),
    pairSummaryLine("Kalshi", [pair.kalshi?.ticker, kalshiMarketUrl(pair.kalshi?.ticker)]),
    pairSummaryLine("Polymarket", [pair.polymarket?.slug, polymarketMarketUrl(pair.polymarket?.slug)]),
    pairSummaryLine("Tokens", [pair.polymarket?.yesTokenId, pair.polymarket?.noTokenId]),
    pairSummaryLine("Expected resolution", expectedResolutionAt)
  ].filter(Boolean).join("\\n");
}

async function copyPairSummary(pairId) {
  const summary = buildPairSummaryText(pairId);
  if (!summary) {
    $("status").textContent = "No pair summary available to copy.";
    return;
  }

  await copyTextToClipboard(summary);
  $("status").textContent = "Pair summary copied to clipboard.";
}

async function copyVisiblePairSummaries() {
  const ids = getVisibleConfigPairIds();
  if (ids.length === 0) {
    $("status").textContent = "No visible configured pairs to copy.";
    return;
  }

  const summaries = ids
    .map((id) => buildPairSummaryText(id))
    .filter((summary) => summary);
  if (summaries.length === 0) {
    $("status").textContent = "No visible pair summaries available to copy.";
    return;
  }

  await copyTextToClipboard(summaries.join("\\n\\n---\\n\\n"));
  $("status").textContent = "Visible pair summaries copied to clipboard.";
}

async function copySelectedPairSummaries() {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  const summaries = ids
    .map((id) => buildPairSummaryText(id))
    .filter((summary) => summary);
  if (summaries.length === 0) {
    $("status").textContent = "No selected pair summaries available to copy.";
    return;
  }

  await copyTextToClipboard(summaries.join("\\n\\n---\\n\\n"));
  $("status").textContent = "Selected pair summaries copied to clipboard.";
}

function exportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function exportScanJson() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded to export.";
    return;
  }
  downloadText(
    "cross-venue-scan-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify(state.data, null, 2)
  );
  $("status").textContent = "Scan JSON exported locally.";
}

function exportArbsCsv() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded to export.";
    return;
  }
  downloadText(
    "cross-venue-arbs-" + exportTimestamp() + ".csv",
    "text/csv",
    buildArbsCsv(state.data)
  );
  $("status").textContent = "Arb CSV exported locally.";
}

function exportVisibleArbsCsv() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded to export.";
    return;
  }
  const arbs = getVisibleArbs(state.data);
  if (arbs.length === 0) {
    $("status").textContent = "No visible arbs to export.";
    return;
  }
  downloadText(
    "cross-venue-visible-arbs-" + exportTimestamp() + ".csv",
    "text/csv",
    buildArbRowsCsv(arbs)
  );
  $("status").textContent = "Visible arbs CSV exported locally.";
}

function exportVisibleSpreadsCsv() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded to export.";
    return;
  }
  const spreads = getVisiblePriceSpreads(state.data);
  if (spreads.length === 0) {
    $("status").textContent = "No visible price spreads to export.";
    return;
  }
  downloadText(
    "cross-venue-visible-spreads-" + exportTimestamp() + ".csv",
    "text/csv",
    buildPriceSpreadRowsCsv(spreads)
  );
  $("status").textContent = "Visible price spreads CSV exported locally.";
}

function exportRejectedCsv() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded to export.";
    return;
  }
  const rejected = getVisibleRejectedPairs(state.data);
  if (rejected.length === 0) {
    $("status").textContent = "No rejected pairs visible to export.";
    return;
  }
  downloadText(
    "cross-venue-rejected-" + exportTimestamp() + ".csv",
    "text/csv",
    buildRejectedPairsCsv(rejected)
  );
  $("status").textContent = "Rejected pairs CSV exported locally.";
}

function exportNearCsv() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded to export.";
    return;
  }
  const candidates = getVisibleNearCandidates(state.data);
  if (candidates.length === 0) {
    $("status").textContent = "No near matches visible to export.";
    return;
  }
  downloadText(
    "cross-venue-near-matches-" + exportTimestamp() + ".csv",
    "text/csv",
    buildNearMatchesCsv(candidates)
  );
  $("status").textContent = "Near matches CSV exported locally.";
}

async function exportPairsJson() {
  const response = await fetch("/api/pairs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  downloadText(
    "cross-venue-pairs-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify(await response.json(), null, 2)
  );
  $("status").textContent = "Configured pairs JSON exported locally.";
}

async function exportPairReviewCsv() {
  const response = await fetch("/api/pairs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const config = await response.json();
  downloadText(
    "cross-venue-pair-review-" + exportTimestamp() + ".csv",
    "text/csv",
    buildPairReviewCsv(config.pairs || [])
  );
  $("status").textContent = "Pair review CSV exported locally.";
}

function exportSelectedPairsJson() {
  const selectedIds = new Set(state.selectedConfigPairIds);
  const pairs = state.configPairs.filter((pair) => selectedIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  downloadText(
    "cross-venue-selected-pairs-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = "Selected pairs JSON exported locally.";
}

async function copySelectedPairsJson() {
  const selectedIds = new Set(state.selectedConfigPairIds);
  const pairs = state.configPairs.filter((pair) => selectedIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  await copyTextToClipboard(JSON.stringify({ pairs }, null, 2));
  $("status").textContent = "Selected pairs JSON copied to clipboard.";
}

function exportSelectedPairReviewCsv() {
  const selectedIds = new Set(state.selectedConfigPairIds);
  const pairs = state.configPairs.filter((pair) => selectedIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  downloadText(
    "cross-venue-selected-pair-review-" + exportTimestamp() + ".csv",
    "text/csv",
    buildPairReviewCsv(pairs)
  );
  $("status").textContent = "Selected pair review CSV exported locally.";
}

async function copySelectedPairReviewCsv() {
  const selectedIds = new Set(state.selectedConfigPairIds);
  const pairs = state.configPairs.filter((pair) => selectedIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  await copyTextToClipboard(buildPairReviewCsv(pairs));
  $("status").textContent = "Selected pair review CSV copied to clipboard.";
}

function exportVisiblePairsJson() {
  const visibleIds = new Set(getVisibleConfigPairIds());
  const pairs = state.configPairs.filter((pair) => visibleIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No visible configured pairs to export.";
    return;
  }

  downloadText(
    "cross-venue-visible-pairs-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = "Visible pairs JSON exported locally.";
}

async function copyVisiblePairsJson() {
  const visibleIds = new Set(getVisibleConfigPairIds());
  const pairs = state.configPairs.filter((pair) => visibleIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No visible configured pairs to copy.";
    return;
  }

  await copyTextToClipboard(JSON.stringify({ pairs }, null, 2));
  $("status").textContent = "Visible pairs JSON copied to clipboard.";
}

function exportVisibleResultPairsJson(kind) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const pairs = getExportableVisibleResultPairs(kind);
  if (pairs.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No visible arb result pairs to export."
      : "No visible spread result pairs to export.";
    return;
  }

  downloadText(
    (kind === "arbs" ? "cross-venue-visible-arb-pairs-" : "cross-venue-visible-spread-pairs-") + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = kind === "arbs"
    ? "Visible arb result pairs JSON exported locally."
    : "Visible spread result pairs JSON exported locally.";
}

function exportVisibleResultReviewCsv(kind) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const rows = kind === "arbs"
    ? getVisibleArbs(state.data)
    : getVisiblePriceSpreads(state.data);
  if (rows.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No visible arb result rows to export for review."
      : "No visible spread result rows to export for review.";
    return;
  }

  downloadText(
    (kind === "arbs" ? "cross-venue-visible-arb-review-" : "cross-venue-visible-spread-review-") + exportTimestamp() + ".csv",
    "text/csv",
    buildVisibleResultReviewCsv(kind, rows)
  );
  $("status").textContent = kind === "arbs"
    ? "Visible arb review CSV exported locally."
    : "Visible spread review CSV exported locally.";
}

function exportPreviewResultPairsJson(kind, signalOnly = false) {
  const pairs = (signalOnly ? getSignalPreviewResultPairs(kind) : getPreviewResultPairs(kind)).map((pair) =>
    state.configPairs.find((item) => item.id === pair.id) || pair
  );
  const label = kind === "arbs" ? "arb" : "spread";
  if (pairs.length === 0) {
    $("status").textContent = signalOnly
      ? "No current-signal preview " + label + " pair(s) to export."
      : "No successful preview " + label + " pair(s) to export.";
    return;
  }

  downloadText(
    (signalOnly
      ? kind === "arbs" ? "cross-venue-signal-preview-arb-pairs-" : "cross-venue-signal-preview-spread-pairs-"
      : kind === "arbs" ? "cross-venue-preview-arb-pairs-" : "cross-venue-preview-spread-pairs-") + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = signalOnly
    ? kind === "arbs"
      ? "Signal preview arb pairs JSON exported locally."
      : "Signal preview spread pairs JSON exported locally."
    : kind === "arbs"
      ? "Preview arb pairs JSON exported locally."
      : "Preview spread pairs JSON exported locally.";
}

function exportSavedPreviewResultPairsJson(kind, signalOnly = false, filteredOnly = false) {
  const ids = new Set(filteredOnly
    ? getSavedFilteredPreviewResultPairIds(kind)
    : signalOnly ? getSavedSignalPreviewResultPairIds(kind) : getSavedPreviewResultPairIds(kind));
  const pairs = state.configPairs.filter((pair) => ids.has(pair.id));
  const label = kind === "arbs" ? "arb" : "spread";
  if (pairs.length === 0) {
    $("status").textContent = filteredOnly
      ? "No saved filtered preview " + label + " pair(s) to export. Add filtered preview pairs first."
      : signalOnly
        ? "No saved signal preview " + label + " pair(s) to export. Add signal preview pairs first."
        : "No saved preview " + label + " pair(s) to export. Add preview pairs first.";
    return;
  }

  downloadText(
    (filteredOnly
      ? kind === "arbs" ? "cross-venue-saved-filtered-preview-arb-pairs-" : "cross-venue-saved-filtered-preview-spread-pairs-"
      : signalOnly
        ? kind === "arbs" ? "cross-venue-saved-signal-preview-arb-pairs-" : "cross-venue-saved-signal-preview-spread-pairs-"
        : kind === "arbs" ? "cross-venue-saved-preview-arb-pairs-" : "cross-venue-saved-preview-spread-pairs-") + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = filteredOnly
    ? kind === "arbs"
      ? "Saved filtered preview arb pairs JSON exported locally."
      : "Saved filtered preview spread pairs JSON exported locally."
    : signalOnly
      ? kind === "arbs"
        ? "Saved signal preview arb pairs JSON exported locally."
        : "Saved signal preview spread pairs JSON exported locally."
      : kind === "arbs"
        ? "Saved preview arb pairs JSON exported locally."
        : "Saved preview spread pairs JSON exported locally.";
}

function getFilteredPreviewResultRows(kind) {
  return getFilteredPreviewResultEntries(kind).map((entry) => entry.item);
}

function getFilteredPreviewResultEntries(kind) {
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  return (state.resultPreviews[kind] || [])
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item?.pair && matchesPreviewResultFilters(kind, entry.item, reviewContext));
}

function getFilteredPreviewResultPairs(kind) {
  return getFilteredPreviewResultRows(kind)
    .filter((item) => !item.error)
    .map((item) => item.pair);
}

function exportFilteredPreviewResultPairsJson(kind) {
  const pairs = getFilteredPreviewResultRows(kind)
    .map((item) => state.configPairs.find((pair) => pair.id === item.pair.id) || item.pair)
    .filter((pair) => pair);
  const label = kind === "arbs" ? "arb" : "spread";
  if (pairs.length === 0) {
    $("status").textContent = "No filtered preview " + label + " pair(s) to export.";
    return;
  }

  downloadText(
    (kind === "arbs" ? "cross-venue-filtered-preview-arb-pairs-" : "cross-venue-filtered-preview-spread-pairs-") + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = kind === "arbs"
    ? "Filtered preview arb pairs JSON exported locally."
    : "Filtered preview spread pairs JSON exported locally.";
}

function exportFilteredPreviewResultReviewCsv(kind) {
  const previews = getFilteredPreviewResultRows(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  if (previews.length === 0) {
    $("status").textContent = "No filtered preview " + label + " result rows to export for review.";
    return;
  }

  downloadText(
    (kind === "arbs" ? "cross-venue-filtered-preview-arb-review-" : "cross-venue-filtered-preview-spread-review-") + exportTimestamp() + ".csv",
    "text/csv",
    buildPreviewResultReviewCsv(kind, previews)
  );
  $("status").textContent = kind === "arbs"
    ? "Filtered preview arb review CSV exported locally."
    : "Filtered preview spread review CSV exported locally.";
}

function exportPreviewResultReviewCsv(kind, signalOnly = false) {
  const previews = signalOnly
    ? (state.resultPreviews[kind] || []).filter((item) => item?.pair && !item.error && ["arb", "spread"].includes(previewResultStatus(item)))
    : state.resultPreviews[kind] || [];
  const label = kind === "arbs" ? "arb" : "spread";
  if (previews.length === 0) {
    $("status").textContent = signalOnly
      ? "No current-signal preview " + label + " result rows to export for review."
      : "No preview " + label + " result rows to export for review.";
    return;
  }

  downloadText(
    (signalOnly
      ? kind === "arbs" ? "cross-venue-signal-preview-arb-review-" : "cross-venue-signal-preview-spread-review-"
      : kind === "arbs" ? "cross-venue-preview-arb-review-" : "cross-venue-preview-spread-review-") + exportTimestamp() + ".csv",
    "text/csv",
    buildPreviewResultReviewCsv(kind, previews)
  );
  $("status").textContent = signalOnly
    ? kind === "arbs"
      ? "Signal preview arb review CSV exported locally."
      : "Signal preview spread review CSV exported locally."
    : kind === "arbs"
      ? "Preview arb review CSV exported locally."
      : "Preview spread review CSV exported locally.";
}

function exportVisiblePairReviewCsv() {
  const visibleIds = new Set(getVisibleConfigPairIds());
  const pairs = state.configPairs.filter((pair) => visibleIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No visible configured pairs to export.";
    return;
  }

  downloadText(
    "cross-venue-visible-pair-review-" + exportTimestamp() + ".csv",
    "text/csv",
    buildPairReviewCsv(pairs)
  );
  $("status").textContent = "Visible pair review CSV exported locally.";
}

async function copyVisiblePairReviewCsv() {
  const visibleIds = new Set(getVisibleConfigPairIds());
  const pairs = state.configPairs.filter((pair) => visibleIds.has(pair.id));
  if (pairs.length === 0) {
    $("status").textContent = "No visible configured pairs to copy.";
    return;
  }

  await copyTextToClipboard(buildPairReviewCsv(pairs));
  $("status").textContent = "Visible pair review CSV copied to clipboard.";
}

function exportReadyPairsJson() {
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const pairs = state.configPairs.filter((pair) =>
    isConfiguredPairReady({
      ...pair,
      review: getConfiguredPairReview(pair, reviewContext)
    })
  );

  if (pairs.length === 0) {
    $("status").textContent = "No ready configured pairs to export.";
    return;
  }

  downloadText(
    "cross-venue-ready-pairs-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = "Ready pairs JSON exported locally.";
}

function exportPriorityPairsJson() {
  const pairs = state.configPairs.filter((pair) => pair.priority === true);
  if (pairs.length === 0) {
    $("status").textContent = "No priority configured pairs to export.";
    return;
  }

  downloadText(
    "cross-venue-priority-pairs-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = "Priority pairs JSON exported locally.";
}

function exportVerifiedPairsJson() {
  const pairs = state.configPairs.filter((pair) => pair.verified === true);
  if (pairs.length === 0) {
    $("status").textContent = "No verified configured pairs to export.";
    return;
  }

  downloadText(
    "cross-venue-verified-pairs-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = "Verified pairs JSON exported locally.";
}

function exportLastRejectedPairsJson() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const pairs = getLastRejectedConfigPairs();
  if (pairs.length === 0) {
    $("status").textContent = "No last-rejected configured pairs to export.";
    return;
  }

  downloadText(
    "cross-venue-last-rejected-pairs-" + exportTimestamp() + ".json",
    "application/json",
    JSON.stringify({ pairs }, null, 2)
  );
  $("status").textContent = "Last-rejected pairs JSON exported locally.";
}

function openImportPairsFile() {
  $("importPairsFile").value = "";
  $("importPairsFile").click();
}

async function importPairsJsonFromFile(file) {
  if (!file) return;

  $("status").textContent = "Importing local pairs JSON...";
  const parsed = JSON.parse(await file.text());
  const pairs = Array.isArray(parsed) ? parsed : parsed?.pairs;
  if (!Array.isArray(pairs)) {
    throw new Error("Expected JSON object with pairs array or a pairs array.");
  }

  let latestConfig = null;
  for (const pair of pairs) {
    const response = await fetch("/api/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ pair })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    latestConfig = await response.json();
  }

  if (latestConfig) {
    renderConfiguredPairs(latestConfig);
  } else {
    await loadPairs();
  }
  $("status").textContent = "Imported " + pairs.length + " configured pair(s) locally.";
}

function buildArbsCsv(data) {
  return buildArbRowsCsv(data.opportunities || []);
}

function buildArbRowsCsv(opportunities) {
  const headers = [
    "pairId",
    "title",
    "outcomeLabel",
    "slug",
    "buyYesVenue",
    "yesAsk",
    "buyNoVenue",
    "noAsk",
    "grossCents",
    "feeCents",
    "netCents",
    "roiBps",
    "executableSize",
    "maxProfitDollars"
  ];
  const rows = (opportunities || []).map((item) => [
    item.pairId,
    item.title,
    item.outcomeLabel,
    item.slug,
    item.buyYesVenue,
    item.yesLeg?.bestAsk,
    item.buyNoVenue,
    item.noLeg?.bestAsk,
    item.grossCents,
    item.feeCents,
    item.netCents,
    item.roiBps,
    item.executableSize,
    item.maxProfitDollars
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\\n") + "\\n";
}

function buildPriceSpreadRowsCsv(spreads) {
  const headers = [
    "pairId",
    "title",
    "outcomeLabel",
    "side",
    "cheapVenue",
    "cheapPrice",
    "richVenue",
    "richPrice",
    "diffCents"
  ];
  const rows = (spreads || []).map((item) => [
    item.pairId,
    item.title,
    item.outcomeLabel,
    item.side,
    item.cheapVenue,
    item.cheapPrice,
    item.richVenue,
    item.richPrice,
    item.diffCents
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\\n") + "\\n";
}

function buildRejectedPairsCsv(rejectedPairs) {
  const headers = [
    "pairId",
    "reason",
    "meaning"
  ];
  const rows = (rejectedPairs || []).map((item) => [
    item.pairId,
    item.reason,
    explainRejectionReason(item.reason)
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\\n") + "\\n";
}

function buildNearMatchesCsv(candidates) {
  const headers = [
    "kalshiTicker",
    "kalshiTitle",
    "polymarketSlug",
    "polymarketQuestion",
    "matchScore",
    "status",
    "matchReason",
    "outcomeLabel",
    "yesTokenId",
    "noTokenId",
    "expectedResolutionAt"
  ];
  const rows = (candidates || []).map((item) => [
    item.kalshiTicker,
    item.kalshiTitle,
    item.polymarketSlug,
    item.polymarketQuestion,
    item.matchScore,
    item.status,
    item.matchReason,
    item.outcomeLabel,
    item.yesTokenId,
    item.noTokenId,
    Number.isFinite(item.expectedResolutionAt) ? new Date(Number(item.expectedResolutionAt)).toISOString() : ""
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\\n") + "\\n";
}

function buildPairReviewCsv(pairs) {
  const reviewContext = buildConfiguredPairReviewContext(pairs || []);
  const headers = [
    "id",
    "status",
    "verified",
    "review",
    "reviewWarnings",
    "note",
    "title",
    "outcomeLabel",
    "kalshiTicker",
    "polymarketSlug",
    "yesTokenId",
    "noTokenId",
    "expectedResolutionAt",
    "lastScanStatus"
  ];
  const rows = (pairs || []).map((pair) => {
    const review = getConfiguredPairReview(pair, reviewContext);
    const status = pair.enabled === false
      ? "paused"
      : review.status === "ok"
        ? "ready"
        : "needs_review";
    const expectedResolutionAt = Number.isFinite(pair.expectedResolutionAt)
      ? new Date(Number(pair.expectedResolutionAt)).toISOString()
      : "";
    return [
      pair.id,
      status,
      pair.verified === true ? "yes" : "no",
      review.label,
      review.warnings.join("|"),
      pair.note,
      pair.title,
      pair.outcomeLabel,
      pair.kalshi?.ticker,
      pair.polymarket?.slug,
      pair.polymarket?.yesTokenId,
      pair.polymarket?.noTokenId,
      expectedResolutionAt,
      getPairLastScanStatus(pair)
    ];
  });
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\\n") + "\\n";
}

function buildVisibleResultReviewCsv(kind, results) {
  const pairs = getExportableVisibleResultPairs(kind);
  const reviewContext = buildConfiguredPairReviewContext(pairs);
  const headers = [
    "resultKind",
    "pairId",
    "pairStatus",
    "title",
    "outcomeLabel",
    "signalSide",
    "yesVenue",
    "noVenue",
    "cheapVenue",
    "richVenue",
    "netCents",
    "roiBps",
    "diffCents",
    "executableSize",
    "maxProfitDollars",
    "localStatus",
    "verified",
    "priority",
    "review",
    "reviewWarnings",
    "note",
    "kalshiTicker",
    "kalshiUrl",
    "polymarketSlug",
    "polymarketUrl",
    "yesTokenId",
    "noTokenId",
    "expectedResolutionAt",
    "lastScanStatus"
  ];
  const rows = (results || []).map((item) => {
    const pair = pairById(item.pairId) || {};
    const review = pair.id
      ? getConfiguredPairReview(pair, reviewContext)
      : { label: "missing_pair", warnings: ["missing_pair"] };
    const localStatus = !pair.id
      ? "missing_pair"
      : pair.enabled === false
        ? "paused"
        : review.status === "ok"
          ? "ready"
          : "needs_review";
    const expectedResolutionAt = Number.isFinite(pair.expectedResolutionAt)
      ? new Date(Number(pair.expectedResolutionAt)).toISOString()
      : "";
    return [
      kind === "arbs" ? "arb" : "spread",
      item.pairId,
      resultPairStatus(item.pairId),
      item.title,
      item.outcomeLabel,
      item.side || "",
      item.buyYesVenue || "",
      item.buyNoVenue || "",
      item.cheapVenue || "",
      item.richVenue || "",
      item.netCents ?? "",
      item.roiBps ?? "",
      item.diffCents ?? "",
      item.executableSize ?? "",
      item.maxProfitDollars ?? "",
      localStatus,
      pair.verified === true ? "yes" : "no",
      pair.priority === true ? "yes" : "no",
      review.label,
      (review.warnings || []).join("|"),
      pair.note,
      pair.kalshi?.ticker,
      kalshiMarketUrl(pair.kalshi?.ticker),
      pair.polymarket?.slug,
      polymarketMarketUrl(pair.polymarket?.slug),
      pair.polymarket?.yesTokenId,
      pair.polymarket?.noTokenId,
      expectedResolutionAt,
      pair.id ? getPairLastScanStatus(pair) : "missing_pair"
    ];
  });
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\\n") + "\\n";
}

function previewResultStatus(item) {
  if (item?.error) return "preview_failed";
  const result = item?.payload?.result || {};
  const bestArb = bestOpportunity(result.opportunities || []);
  const bestSpread = bestPriceSpread(result.priceSpreads || []);
  const rejected = result.rejected || result.rejectedPairs || [];
  return bestArb
    ? "arb"
    : bestSpread
      ? "spread"
      : rejected.length > 0
        ? "rejected"
        : "no_signal";
}

function matchesPreviewResultStatusFilter(kind, item) {
  const active = state.resultPreviewStatusFilter[kind] || "";
  return !active || previewResultStatus(item) === active;
}

function matchesPreviewProblemFilter(kind, item) {
  if (!state.resultPreviewProblemOnly[kind]) return true;
  const status = previewResultStatus(item);
  return status === "preview_failed" || status === "rejected";
}

function previewProblemReasons(item) {
  const result = item?.payload?.result || {};
  const rejected = result.rejected || result.rejectedPairs || [];
  const reasons = [
    item?.error ? "preview_failed" : "",
    ...rejected.map((entry) => entry?.reason || "rejected")
  ].filter(Boolean);
  return Array.from(new Set(reasons));
}

function matchesPreviewProblemReasonFilter(kind, item) {
  const active = state.resultPreviewProblemReasonFilter[kind] || "";
  return !active || previewProblemReasons(item).includes(active);
}

function matchesPreviewPairStatusFilter(kind, item) {
  const active = state.resultPreviewPairStatusFilter[kind] || "";
  return !active || resultPairStatus(item?.pair?.id) === active;
}

function matchesPreviewLocalStateFilter(kind, item) {
  const active = state.resultPreviewLocalStateFilter[kind] || "";
  return !active || resultPairLocalStateFilterValues(item?.pair?.id).includes(active);
}

function matchesPreviewReviewFilter(kind, item, reviewContext) {
  const active = state.resultPreviewReviewFilter[kind] || "";
  return !active || resultPairReviewLabel(item?.pair?.id, reviewContext) === active;
}

function matchesPreviewSearchFilter(kind, item, reviewContext) {
  const query = String(state.resultPreviewSearch[kind] || "").trim().toLowerCase();
  if (!query) return true;
  return previewSearchText(item, reviewContext).toLowerCase().includes(query);
}

function previewSearchText(item, reviewContext) {
  const pairId = item?.pair?.id;
  const result = item?.payload?.result || {};
  const rejected = result.rejected || result.rejectedPairs || [];
  return [
    resultPreviewPairLabel(item?.pair),
    item?.pair?.id,
    item?.pair?.title,
    item?.pair?.outcomeLabel,
    item?.pair?.kalshi?.ticker,
    item?.pair?.polymarket?.slug,
    previewResultStatus(item),
    resultPairStatus(pairId),
    resultPairLocalState(pairId),
    resultPairReviewLabel(pairId, reviewContext),
    resultPairNote(pairId),
    previewProblemReasons(item).join(" "),
    item?.error,
    rejected.map((entry) => entry.reason || "rejected").join(" ")
  ].filter(Boolean).join(" ");
}

function matchesPreviewResultFilters(kind, item, reviewContext = buildConfiguredPairReviewContext(state.configPairs)) {
  return matchesPreviewResultStatusFilter(kind, item)
    && matchesPreviewProblemFilter(kind, item)
    && matchesPreviewProblemReasonFilter(kind, item)
    && matchesPreviewPairStatusFilter(kind, item)
    && matchesPreviewLocalStateFilter(kind, item)
    && matchesPreviewReviewFilter(kind, item, reviewContext)
    && matchesPreviewSearchFilter(kind, item, reviewContext);
}

function hasActivePreviewResultFilter(kind) {
  return Boolean(
    state.resultPreviewStatusFilter[kind]
    || state.resultPreviewPairStatusFilter[kind]
    || state.resultPreviewLocalStateFilter[kind]
    || state.resultPreviewReviewFilter[kind]
    || state.resultPreviewProblemOnly[kind]
    || state.resultPreviewProblemReasonFilter[kind]
    || state.resultPreviewSearch[kind]
  );
}

function resetPreviewResultFilters(kind) {
  state.resultPreviewStatusFilter[kind] = "";
  state.resultPreviewPairStatusFilter[kind] = "";
  state.resultPreviewLocalStateFilter[kind] = "";
  state.resultPreviewReviewFilter[kind] = "";
  state.resultPreviewProblemOnly[kind] = false;
  state.resultPreviewProblemReasonFilter[kind] = "";
  state.resultPreviewSearch[kind] = "";
}

function clearPreviewResultFilters(kind) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const label = kind === "arbs" ? "arb" : "spread";
  if (!hasActivePreviewResultFilter(kind)) {
    $("status").textContent = "No preview " + label + " filters to clear.";
    return;
  }

  resetPreviewResultFilters(kind);
  refreshPreviewResultPanel(kind);
  $("status").textContent = "Preview " + label + " filters cleared.";
}

function setPreviewResultStatusFilter(kind, status) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const next = String(status || "");
  state.resultPreviewStatusFilter[kind] = next;
  refreshPreviewResultPanel(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = next
    ? "Preview " + label + " rows filtered to status " + next + "."
    : "Preview " + label + " status filter cleared.";
}

function setPreviewPairStatusFilter(kind, status) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const next = String(status || "");
  state.resultPreviewPairStatusFilter[kind] = next;
  refreshPreviewResultPanel(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = next
    ? "Preview " + label + " rows filtered to pair status " + next + "."
    : "Preview " + label + " pair-status filter cleared.";
}

function setPreviewLocalStateFilter(kind, stateName) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const next = String(stateName || "");
  state.resultPreviewLocalStateFilter[kind] = next;
  refreshPreviewResultPanel(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = next
    ? "Preview " + label + " rows filtered to local state " + next + "."
    : "Preview " + label + " local-state filter cleared.";
}

function setPreviewReviewFilter(kind, reviewName) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const next = String(reviewName || "");
  state.resultPreviewReviewFilter[kind] = next;
  refreshPreviewResultPanel(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = next
    ? "Preview " + label + " rows filtered to review " + next + "."
    : "Preview " + label + " review filter cleared.";
}

function setPreviewProblemReasonFilter(kind, reason) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const next = String(reason || "");
  state.resultPreviewProblemReasonFilter[kind] = next;
  refreshPreviewResultPanel(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = next
    ? "Preview " + label + " rows filtered to problem reason " + next + "."
    : "Preview " + label + " problem-reason filter cleared.";
}

function setPreviewResultSort(kind, value) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const next = PREVIEW_RESULT_SORT_VALUES.has(String(value || ""))
    ? String(value)
    : "preview_order";
  state.previewResultSort[kind] = next;
  saveDashboardSettings();
  refreshPreviewResultPanel(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = next === "preview_order"
    ? "Preview " + label + " sort reset to preview order."
    : "Preview " + label + " rows sorted by " + previewSortLabel(kind) + ".";
}

function setPreviewResultSearch(kind, value) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const next = String(value || "").trim();
  state.resultPreviewSearch[kind] = next;
  refreshPreviewResultPanel(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = next
    ? "Preview " + label + " rows searched for " + next + "."
    : "Preview " + label + " search cleared.";
}

function applyPreviewQuickView(kind, viewName) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const nextView = String(viewName || "");
  resetPreviewResultFilters(kind);
  state.previewResultSort[kind] = kind === "arbs" ? "edge_desc" : "diff_desc";

  if (nextView === "signal") {
    state.resultPreviewStatusFilter[kind] = kind === "arbs" ? "arb" : "spread";
  } else if (nextView === "saved_active") {
    state.resultPreviewLocalStateFilter[kind] = "active";
  } else if (nextView === "priority") {
    state.resultPreviewLocalStateFilter[kind] = "priority";
  } else if (nextView === "needs_review") {
    state.resultPreviewReviewFilter[kind] = "needs_review";
    state.previewResultSort[kind] = "review";
  } else if (nextView === "problems") {
    state.resultPreviewProblemOnly[kind] = true;
    state.previewResultSort[kind] = "status";
  } else {
    state.previewResultSort[kind] = "preview_order";
  }

  saveDashboardSettings();
  refreshPreviewResultPanel(kind);
  $("status").textContent = previewQuickViewStatus(kind, nextView);
}

function previewQuickViewStatus(kind, viewName) {
  const label = kind === "arbs" ? "arb" : "spread";
  if (viewName === "signal") {
    return "Preview " + label + " signal view applied.";
  }
  if (viewName === "saved_active") {
    return "Preview " + label + " saved-active view applied.";
  }
  if (viewName === "priority") {
    return "Preview " + label + " priority view applied.";
  }
  if (viewName === "needs_review") {
    return "Preview " + label + " needs-review view applied.";
  }
  if (viewName === "problems") {
    return "Preview " + label + " problem view applied.";
  }
  return "Preview " + label + " view reset.";
}

function currentPreviewQuickView(kind) {
  const defaultSort = kind === "arbs" ? "edge_desc" : "diff_desc";
  const signalStatus = kind === "arbs" ? "arb" : "spread";
  const sort = state.previewResultSort[kind] || "preview_order";
  const status = state.resultPreviewStatusFilter[kind] || "";
  const pairStatus = state.resultPreviewPairStatusFilter[kind] || "";
  const localState = state.resultPreviewLocalStateFilter[kind] || "";
  const review = state.resultPreviewReviewFilter[kind] || "";
  const problemOnly = Boolean(state.resultPreviewProblemOnly[kind]);
  const problemReason = state.resultPreviewProblemReasonFilter[kind] || "";
  const search = state.resultPreviewSearch[kind] || "";

  if (!problemOnly && !problemReason && !pairStatus && !localState && !review && !search && status === signalStatus && sort === defaultSort) {
    return "signal";
  }
  if (!problemOnly && !problemReason && !status && !pairStatus && !review && !search && localState === "active" && sort === defaultSort) {
    return "saved_active";
  }
  if (!problemOnly && !problemReason && !status && !pairStatus && !review && !search && localState === "priority" && sort === defaultSort) {
    return "priority";
  }
  if (!problemOnly && !problemReason && !status && !pairStatus && !localState && !search && review === "needs_review" && sort === "review") {
    return "needs_review";
  }
  if (problemOnly && !problemReason && !status && !pairStatus && !localState && !review && !search && sort === "status") {
    return "problems";
  }
  return "";
}

function previewQuickViewLabel(viewName) {
  if (viewName === "signal") return "Signal view";
  if (viewName === "saved_active") return "Saved active";
  if (viewName === "priority") return "Priority view";
  if (viewName === "needs_review") return "Needs-review view";
  if (viewName === "problems") return "Problem view";
  return "Custom";
}

function matchesPreviewQuickView(kind, item, viewName, reviewContext) {
  const pairId = item?.pair?.id;
  if (viewName === "signal") {
    return previewResultStatus(item) === (kind === "arbs" ? "arb" : "spread");
  }
  if (viewName === "saved_active") {
    return resultPairLocalStateFilterValues(pairId).includes("active");
  }
  if (viewName === "priority") {
    return resultPairLocalStateFilterValues(pairId).includes("priority");
  }
  if (viewName === "needs_review") {
    return resultPairReviewLabel(pairId, reviewContext) === "needs_review";
  }
  if (viewName === "problems") {
    const status = previewResultStatus(item);
    return status === "preview_failed" || status === "rejected";
  }
  return false;
}

function previewQuickViewCounts(kind, previews, reviewContext) {
  const rows = previews || [];
  return {
    signal: rows.filter((item) => matchesPreviewQuickView(kind, item, "signal", reviewContext)).length,
    saved_active: rows.filter((item) => matchesPreviewQuickView(kind, item, "saved_active", reviewContext)).length,
    priority: rows.filter((item) => matchesPreviewQuickView(kind, item, "priority", reviewContext)).length,
    needs_review: rows.filter((item) => matchesPreviewQuickView(kind, item, "needs_review", reviewContext)).length,
    problems: rows.filter((item) => matchesPreviewQuickView(kind, item, "problems", reviewContext)).length
  };
}

function buildPreviewResultReviewCsv(kind, previews) {
  const pairs = (previews || [])
    .map((item) => {
      const pairId = item?.pair?.id || "";
      return state.configPairs.find((configuredPair) => configuredPair.id === pairId) || item?.pair;
    })
    .filter((pair) => pair);
  const reviewContext = buildConfiguredPairReviewContext(pairs);
  const headers = [
    "previewKind",
    "pairId",
    "previewStatus",
    "pairStatus",
    "localState",
    "review",
    "reviewWarnings",
    "note",
    "title",
    "outcomeLabel",
    "bestNetCents",
    "bestRoiBps",
    "bestExecutableSize",
    "bestMaxProfitDollars",
    "bestSpreadSide",
    "bestDiffCents",
    "problemReasons",
    "rejectedReasons",
    "error",
    "kalshiTicker",
    "kalshiUrl",
    "polymarketSlug",
    "polymarketUrl",
    "yesTokenId",
    "noTokenId",
    "expectedResolutionAt",
    "lastScanStatus"
  ];
  const rows = (previews || []).map((item) => {
    const pairId = item?.pair?.id || "";
    const pair = state.configPairs.find((configuredPair) => configuredPair.id === pairId) || item?.pair || {};
    const result = item?.payload?.result || {};
    const bestArb = bestOpportunity(result.opportunities || []);
    const bestSpread = bestPriceSpread(result.priceSpreads || []);
    const rejected = result.rejected || result.rejectedPairs || [];
    const review = pair.id
      ? getConfiguredPairReview(pair, reviewContext)
      : { label: "missing_pair", warnings: ["missing_pair"] };
    const expectedResolutionAt = Number.isFinite(pair.expectedResolutionAt)
      ? new Date(Number(pair.expectedResolutionAt)).toISOString()
      : "";
    return [
      kind === "arbs" ? "arb" : "spread",
      pairId,
      previewResultStatus(item),
      resultPairStatus(pairId),
      resultPairLocalState(pairId),
      review.label,
      (review.warnings || []).join("|"),
      resultPairNote(pairId),
      pair.title,
      pair.outcomeLabel,
      bestArb?.netCents ?? "",
      bestArb?.roiBps ?? "",
      bestArb?.executableSize ?? "",
      bestArb?.maxProfitDollars ?? "",
      bestSpread?.side ?? "",
      bestSpread?.diffCents ?? "",
      previewProblemReasons(item).join("|"),
      rejected.map((entry) => entry.reason || "rejected").join("|"),
      item?.error || "",
      pair.kalshi?.ticker,
      kalshiMarketUrl(pair.kalshi?.ticker),
      pair.polymarket?.slug,
      polymarketMarketUrl(pair.polymarket?.slug),
      pair.polymarket?.yesTokenId,
      pair.polymarket?.noTokenId,
      expectedResolutionAt,
      pair.id ? getPairLastScanStatus(pair) : "missing_pair"
    ];
  });
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\\n") + "\\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\\n\\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function sortTableByHeader(header) {
  const tableElement = header.closest("table");
  const body = tableElement?.tBodies?.[0];
  const columnIndex = Number(header.getAttribute("data-sort-column"));
  if (!body || !Number.isInteger(columnIndex)) return;
  const direction = header.getAttribute("data-sort-dir") === "asc" ? "desc" : "asc";
  tableElement.querySelectorAll("th[data-sort-dir]").forEach((item) => item.removeAttribute("data-sort-dir"));
  header.setAttribute("data-sort-dir", direction);
  const multiplier = direction === "asc" ? 1 : -1;
  Array.from(body.rows)
    .sort((left, right) => multiplier * compareTableCellText(
      left.cells[columnIndex]?.textContent || "",
      right.cells[columnIndex]?.textContent || ""
    ))
    .forEach((row) => body.appendChild(row));
}

function compareTableCellText(left, right) {
  const leftNumber = parseSortableNumber(left);
  const rightNumber = parseSortableNumber(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function parseSortableNumber(value) {
  const normalized = String(value)
    .trim()
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replace(/\\s*(c|bps)$/i, "");
  return /^-?\\d+(\\.\\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

function render(data) {
  state.data = data;
  $("status").textContent = data.status === "missing"
    ? "No report yet. Click Refresh scan."
    : "Loaded " + data.generatedAt + " | " + (data.autoDiscover ? "auto-discovery" : "manual") + " | dry-run=" + data.dryRun;
  renderSimpleDashboard(data);

  if (data.status === "missing") {
    $("cards").innerHTML = "";
    renderScanHistory();
    $("arbSummary").innerHTML = "";
    $("arbs").innerHTML = '<p class="empty">No data yet.</p>';
    $("arbResultPreview").innerHTML = "";
    $("spreadSummary").innerHTML = "";
    $("spreads").innerHTML = '<p class="empty">No data yet.</p>';
    $("spreadResultPreview").innerHTML = "";
    $("rejectionSummary").innerHTML = "";
    $("rejected").innerHTML = '<p class="empty">No data yet.</p>';
    $("configPairSummary").innerHTML = "";
    $("configPairs").innerHTML = '<p class="empty">No data yet.</p>';
    $("configPairPreview").innerHTML = "";
    $("pairs").innerHTML = '<p class="empty">No data yet.</p>';
    $("nearSummary").innerHTML = "";
    $("near").innerHTML = '<p class="empty">No data yet.</p>';
    $("nearPairPreview").innerHTML = "";
    return;
  }

  renderCards(data);
  renderScanHistory();
  const resultReviewContext = buildConfiguredPairReviewContext(state.configPairs);

  const arbs = getVisibleArbs(data);
  $("arbSummary").innerHTML = renderArbSummary(data.opportunities || [], arbs);
  $("arbs").innerHTML = table(["Pair", "YES", "NO", "Net", "ROI", "Size", "Profit", "Pair Status", "Local State", "Review", "Note", "Action"], arbs.map((item) => rowWithAction([
    item.title + " / " + item.outcomeLabel,
    item.buyYesVenue + " @ " + price(item.yesLeg?.bestAsk),
    item.buyNoVenue + " @ " + price(item.noLeg?.bestAsk),
    Number(item.netCents).toFixed(2) + "c",
    Number(item.roiBps).toFixed(2) + " bps",
    Number(item.executableSize).toFixed(2),
    money(item.maxProfitDollars),
    resultPairStatus(item.pairId),
    resultPairLocalState(item.pairId),
    resultPairReviewLabel(item.pairId, resultReviewContext),
    resultPairNote(item.pairId)
  ], resultPairActions(item.pairId))));

  const spreads = getVisiblePriceSpreads(data);
  $("spreadSummary").innerHTML = renderSpreadSummary(data.priceSpreads || [], spreads);
  $("spreads").innerHTML = table(["Pair", "Side", "Cheap", "Rich", "Diff", "Pair Status", "Local State", "Review", "Note", "Action"], spreads.map((item) => rowWithAction([
    item.title + " / " + item.outcomeLabel,
    item.side,
    item.cheapVenue + " " + price(item.cheapPrice),
    item.richVenue + " " + price(item.richPrice),
    Number(item.diffCents).toFixed(2) + "c",
    resultPairStatus(item.pairId),
    resultPairLocalState(item.pairId),
    resultPairReviewLabel(item.pairId, resultReviewContext),
    resultPairNote(item.pairId)
  ], resultPairActions(item.pairId))));

  const allRejected = data.rejectedPairs || [];
  const rejected = getVisibleRejectedPairs(data);
  $("rejectionSummary").innerHTML = renderRejectionSummary(allRejected, rejected.length);
  $("rejected").innerHTML = table(["Pair", "Reason", "Meaning"], rejected.map((item) => row([
    item.pairId,
    item.reason,
    explainRejectionReason(item.reason)
  ])));

  const pairs = (data.pairs || []).filter((item) => matches([item.title, item.kalshi?.ticker, item.polymarket?.slug, item.matchReason].join(" ")));
  $("pairs").innerHTML = table(["Pair", "Kalshi", "Polymarket", "Match", "Reason"], pairs.map((item) => rowRaw([
    html(item.title),
    kalshiMarketLink(item.kalshi?.ticker),
    polymarketMarketLink(item.polymarket?.slug),
    html(Number.isFinite(item.matchScore) ? Number(item.matchScore).toFixed(3) : "manual"),
    html(item.matchReason || "config")
  ])));

  const allNear = data.discoveryResult?.candidatePreview || [];
  const nearCandidates = getVisibleNearCandidates(data);
  $("nearSummary").innerHTML = renderNearSummary(allNear, nearCandidates.length);
  $("near").innerHTML = renderNearCandidates(nearCandidates);
}

function getVisibleArbs(data) {
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const rows = (data.opportunities || [])
    .filter((item) => matches([item.title, item.slug, item.buyYesVenue, item.buyNoVenue].join(" ")))
    .filter((item) => matchesArbVenue(item))
    .filter((item) => matchesMinResultProfit(item))
    .filter((item) => matchesResultPairStatus(item.pairId))
    .filter((item) => matchesResultLocalState(item.pairId))
    .filter((item) => matchesResultReview(item.pairId, reviewContext))
    .filter((item) => matchesVerifiedResultPair(item.pairId));
  return limitVisibleResults(sortVisibleArbs(rows, reviewContext));
}

function getVisiblePriceSpreads(data) {
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const rows = (data.priceSpreads || [])
    .filter((item) => matches([item.title, item.side, item.cheapVenue, item.richVenue].join(" ")))
    .filter((item) => matchesSpreadSide(item))
    .filter((item) => matchesMinResultSpread(item))
    .filter((item) => matchesResultPairStatus(item.pairId))
    .filter((item) => matchesResultLocalState(item.pairId))
    .filter((item) => matchesResultReview(item.pairId, reviewContext))
    .filter((item) => matchesVerifiedResultPair(item.pairId));
  return limitVisibleResults(sortVisiblePriceSpreads(rows, reviewContext));
}

function limitVisibleResults(rows) {
  const limit = readOptionalPositiveIntegerInput("resultLimitRows");
  return limit === null ? rows : rows.slice(0, limit);
}

function sortVisibleArbs(rows, reviewContext) {
  switch (state.arbResultSort) {
    case "profit_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(left.maxProfitDollars, right.maxProfitDollars) || compareResultTitle(left, right));
    case "net_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(left.netCents, right.netCents) || compareResultTitle(left, right));
    case "roi_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(left.roiBps, right.roiBps) || compareResultTitle(left, right));
    case "size_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(left.executableSize, right.executableSize) || compareResultTitle(left, right));
    case "pair_status":
      return sortRows(rows, (left, right) => compareText(resultPairStatus(left.pairId), resultPairStatus(right.pairId)) || compareResultTitle(left, right));
    case "local_state":
      return sortRows(rows, (left, right) => compareText(resultPairLocalState(left.pairId), resultPairLocalState(right.pairId)) || compareResultTitle(left, right));
    case "review":
      return sortRows(rows, (left, right) => compareText(resultPairReviewLabel(left.pairId, reviewContext), resultPairReviewLabel(right.pairId, reviewContext)) || compareResultTitle(left, right));
    case "title":
      return sortRows(rows, compareResultTitle);
    default:
      return rows;
  }
}

function sortVisiblePriceSpreads(rows, reviewContext) {
  switch (state.spreadResultSort) {
    case "diff_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(left.diffCents, right.diffCents) || compareResultTitle(left, right));
    case "side":
      return sortRows(rows, (left, right) => compareText(left.side, right.side) || compareResultTitle(left, right));
    case "pair_status":
      return sortRows(rows, (left, right) => compareText(resultPairStatus(left.pairId), resultPairStatus(right.pairId)) || compareResultTitle(left, right));
    case "local_state":
      return sortRows(rows, (left, right) => compareText(resultPairLocalState(left.pairId), resultPairLocalState(right.pairId)) || compareResultTitle(left, right));
    case "review":
      return sortRows(rows, (left, right) => compareText(resultPairReviewLabel(left.pairId, reviewContext), resultPairReviewLabel(right.pairId, reviewContext)) || compareResultTitle(left, right));
    case "title":
      return sortRows(rows, compareResultTitle);
    default:
      return rows;
  }
}

function sortRows(rows, compare) {
  return rows
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compare(left.item, right.item) || left.index - right.index)
    .map((entry) => entry.item);
}

function sortPreviewResultRows(kind, rows, reviewContext) {
  switch (state.previewResultSort[kind] || "preview_order") {
    case "edge_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(previewBestEdgeCents(left), previewBestEdgeCents(right)) || comparePreviewTitle(left, right));
    case "profit_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(previewBestProfitDollars(left), previewBestProfitDollars(right)) || comparePreviewTitle(left, right));
    case "diff_desc":
      return sortRows(rows, (left, right) => compareNumberDesc(previewBestDiffCents(left), previewBestDiffCents(right)) || comparePreviewTitle(left, right));
    case "status":
      return sortRows(rows, (left, right) => compareText(previewResultStatus(left), previewResultStatus(right)) || comparePreviewTitle(left, right));
    case "pair_status":
      return sortRows(rows, (left, right) => compareText(resultPairStatus(left.pair?.id), resultPairStatus(right.pair?.id)) || comparePreviewTitle(left, right));
    case "local_state":
      return sortRows(rows, (left, right) => compareText(resultPairLocalState(left.pair?.id), resultPairLocalState(right.pair?.id)) || comparePreviewTitle(left, right));
    case "review":
      return sortRows(rows, (left, right) => compareText(resultPairReviewLabel(left.pair?.id, reviewContext), resultPairReviewLabel(right.pair?.id, reviewContext)) || comparePreviewTitle(left, right));
    case "title":
      return sortRows(rows, comparePreviewTitle);
    default:
      return rows;
  }
}

function previewBestEdgeCents(item) {
  if (item?.error) return null;
  const bestArb = bestOpportunity(item.payload?.result?.opportunities || []);
  return bestArb ? Number(bestArb.netCents) : null;
}

function previewBestProfitDollars(item) {
  if (item?.error) return null;
  const bestArb = bestOpportunity(item.payload?.result?.opportunities || []);
  return bestArb ? Number(bestArb.maxProfitDollars) : null;
}

function previewBestDiffCents(item) {
  if (item?.error) return null;
  const bestSpread = bestPriceSpread(item.payload?.result?.priceSpreads || []);
  return bestSpread ? Number(bestSpread.diffCents) : null;
}

function summarizeVisiblePreviewMetrics(rows) {
  const visibleRows = rows || [];
  const edgeValues = visibleRows
    .map((item) => previewBestEdgeCents(item))
    .filter((value) => Number.isFinite(value));
  const profitValues = visibleRows
    .map((item) => previewBestProfitDollars(item))
    .filter((value) => Number.isFinite(value));
  const diffValues = visibleRows
    .map((item) => previewBestDiffCents(item))
    .filter((value) => Number.isFinite(value));
  return {
    bestEdgeCents: edgeValues.length > 0 ? Math.max(...edgeValues) : null,
    bestProfitDollars: profitValues.length > 0 ? Math.max(...profitValues) : null,
    bestDiffCents: diffValues.length > 0 ? Math.max(...diffValues) : null
  };
}

function comparePreviewTitle(left, right) {
  return compareText(resultPreviewPairLabel(left?.pair), resultPreviewPairLabel(right?.pair));
}

function compareNumberDesc(left, right) {
  const leftValue = sortableNumber(left);
  const rightValue = sortableNumber(right);
  if (leftValue === rightValue) return 0;
  return rightValue > leftValue ? 1 : -1;
}

function sortableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareResultTitle(left, right) {
  return compareText([left?.title, left?.outcomeLabel, left?.pairId].join(" "), [right?.title, right?.outcomeLabel, right?.pairId].join(" "));
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function resultSortLabel(kind) {
  const value = kind === "arbs" ? state.arbResultSort : state.spreadResultSort;
  const labels = kind === "arbs"
    ? {
        report: "Report order",
        profit_desc: "Profit desc",
        net_desc: "Net edge desc",
        roi_desc: "ROI desc",
        size_desc: "Size desc",
        pair_status: "Pair status",
        local_state: "Local state",
        review: "Review",
        title: "Title"
      }
    : {
        report: "Report order",
        diff_desc: "Diff desc",
        side: "Side",
        pair_status: "Pair status",
        local_state: "Local state",
        review: "Review",
        title: "Title"
      };
  return labels[value] || labels.report;
}

function renderArbSummary(opportunities, visibleRows) {
  if (!opportunities || opportunities.length === 0) {
    return '<span>Arbs: 0</span>';
  }

  const active = state.arbVenueFilter;
  const rows = summarizeArbVenues(opportunities);
  const visibleMetrics = summarizeVisibleArbMetrics(visibleRows);
  const verifiedCount = opportunities.filter((item) => pairById(item.pairId)?.verified === true).length;
  const minProfit = readOptionalNumberInput("minResultProfitDollars");
  const resultLimit = readOptionalPositiveIntegerInput("resultLimitRows");

  return [
    '<span>Arbs: ' + html(opportunities.length) + '</span>',
    '<span>Visible arbs: ' + html(visibleMetrics.count) + '</span>',
    '<span>Verified arbs: ' + html(verifiedCount) + '</span>',
    visibleMetrics.bestNetCents !== null ? '<span>Visible best edge: ' + html(Number(visibleMetrics.bestNetCents).toFixed(2)) + 'c</span>' : "",
    visibleMetrics.bestProfitDollars !== null ? '<span>Visible best profit: ' + html(money(visibleMetrics.bestProfitDollars)) + '</span>' : "",
    minProfit !== null ? '<span>Min profit: $' + html(minProfit) + '</span>' : "",
    resultLimit !== null ? '<span>Top rows: ' + html(resultLimit) + '</span>' : "",
    state.arbResultSort !== "report" ? '<span>Sort: ' + html(resultSortLabel("arbs")) + '</span>' : "",
    state.verifiedResultsOnly ? '<span>Showing verified only</span>' : "",
    active ? '<button type="button" data-clear-arb-venue-filter="true">All arbs</button>' : "",
    renderResultPairStatusFilterButtons(opportunities),
    renderResultLocalStateFilterButtons(opportunities),
    renderResultReviewFilterButtons(opportunities),
    ...rows.slice(0, 5).map((item) =>
      '<button type="button" data-arb-venue-filter="' + html(item.venuePair) + '"' + (item.venuePair === active ? " disabled" : "") + '>' + html(item.venuePair) + ': ' + html(item.count) + '</button>'
    )
  ].filter(Boolean).join("");
}

function summarizeVisibleArbMetrics(rows) {
  const visibleRows = rows || [];
  const netValues = visibleRows
    .map((item) => Number(item?.netCents))
    .filter((value) => Number.isFinite(value));
  const profitValues = visibleRows
    .map((item) => Number(item?.maxProfitDollars))
    .filter((value) => Number.isFinite(value));
  return {
    count: visibleRows.length,
    bestNetCents: netValues.length > 0 ? Math.max(...netValues) : null,
    bestProfitDollars: profitValues.length > 0 ? Math.max(...profitValues) : null
  };
}

function summarizeArbVenues(opportunities) {
  const counts = new Map();
  for (const item of opportunities || []) {
    const key = arbVenueKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([venuePair, count]) => ({ venuePair, count }))
    .sort((left, right) => right.count - left.count || left.venuePair.localeCompare(right.venuePair));
}

function renderSpreadSummary(spreads, visibleRows) {
  if (!spreads || spreads.length === 0) {
    return '<span>Spreads: 0</span>';
  }

  const active = state.spreadSideFilter;
  const rows = summarizeSpreadSides(spreads);
  const visibleMetrics = summarizeVisibleSpreadMetrics(visibleRows);
  const verifiedCount = spreads.filter((item) => pairById(item.pairId)?.verified === true).length;
  const minSpread = readOptionalNumberInput("minResultSpreadCents");
  const resultLimit = readOptionalPositiveIntegerInput("resultLimitRows");

  return [
    '<span>Spreads: ' + html(spreads.length) + '</span>',
    '<span>Visible spreads: ' + html(visibleMetrics.count) + '</span>',
    '<span>Verified spreads: ' + html(verifiedCount) + '</span>',
    visibleMetrics.bestDiffCents !== null ? '<span>Visible best diff: ' + html(Number(visibleMetrics.bestDiffCents).toFixed(2)) + 'c</span>' : "",
    minSpread !== null ? '<span>Min spread: ' + html(minSpread) + 'c</span>' : "",
    resultLimit !== null ? '<span>Top rows: ' + html(resultLimit) + '</span>' : "",
    state.spreadResultSort !== "report" ? '<span>Sort: ' + html(resultSortLabel("spreads")) + '</span>' : "",
    state.verifiedResultsOnly ? '<span>Showing verified only</span>' : "",
    active ? '<button type="button" data-clear-spread-side-filter="true">All spreads</button>' : "",
    renderResultPairStatusFilterButtons(spreads),
    renderResultLocalStateFilterButtons(spreads),
    renderResultReviewFilterButtons(spreads),
    ...rows.slice(0, 5).map((item) =>
      '<button type="button" data-spread-side-filter="' + html(item.side) + '"' + (item.side === active ? " disabled" : "") + '>' + html(item.side) + ': ' + html(item.count) + '</button>'
    )
  ].filter(Boolean).join("");
}

function summarizeVisibleSpreadMetrics(rows) {
  const visibleRows = rows || [];
  const diffValues = visibleRows
    .map((item) => Number(item?.diffCents))
    .filter((value) => Number.isFinite(value));
  return {
    count: visibleRows.length,
    bestDiffCents: diffValues.length > 0 ? Math.max(...diffValues) : null
  };
}

function summarizeSpreadSides(spreads) {
  const counts = new Map();
  for (const item of spreads || []) {
    const side = String(item?.side || "unknown");
    counts.set(side, (counts.get(side) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([side, count]) => ({ side, count }))
    .sort((left, right) => right.count - left.count || left.side.localeCompare(right.side));
}

function arbVenueKey(item) {
  return [item?.buyYesVenue || "unknown_yes", item?.buyNoVenue || "unknown_no"].join(" + ");
}

function matchesArbVenue(item) {
  return !state.arbVenueFilter || arbVenueKey(item) === state.arbVenueFilter;
}

function matchesSpreadSide(item) {
  return !state.spreadSideFilter || String(item?.side || "unknown") === state.spreadSideFilter;
}

function matchesMinResultProfit(item) {
  const minimum = readOptionalNumberInput("minResultProfitDollars");
  return minimum === null || Number(item?.maxProfitDollars || 0) >= minimum;
}

function matchesMinResultSpread(item) {
  const minimum = readOptionalNumberInput("minResultSpreadCents");
  return minimum === null || Number(item?.diffCents || 0) >= minimum;
}

function summarizeResultPairStatuses(items) {
  const counts = new Map();
  for (const item of items || []) {
    const status = resultPairStatus(item?.pairId);
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
}

function renderResultPairStatusFilterButtons(items) {
  const rows = summarizeResultPairStatuses(items);
  if (rows.length === 0 && !state.resultPairStatusFilter) return "";
  const active = state.resultPairStatusFilter;
  const clearButton = active
    ? '<button type="button" data-clear-result-pair-status-filter="true">All pair statuses</button>'
    : "";
  const statusButtons = rows.slice(0, 6).map((item) =>
    '<button type="button" data-result-pair-status-filter="' + html(item.status) + '"' + (item.status === active ? " disabled" : "") + '>' + html(item.status) + ': ' + html(item.count) + '</button>'
  );
  return clearButton + statusButtons.join("");
}

function summarizeResultLocalStates(items) {
  const counts = new Map();
  for (const item of items || []) {
    for (const stateName of resultPairLocalStateFilterValues(item?.pairId)) {
      counts.set(stateName, (counts.get(stateName) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([stateName, count]) => ({ stateName, count }))
    .sort((left, right) => right.count - left.count || left.stateName.localeCompare(right.stateName));
}

function renderResultLocalStateFilterButtons(items) {
  const rows = summarizeResultLocalStates(items);
  if (rows.length === 0 && !state.resultLocalStateFilter) return "";
  const active = state.resultLocalStateFilter;
  const clearButton = active
    ? '<button type="button" data-clear-result-local-state-filter="true">All local states</button>'
    : "";
  const stateButtons = rows.slice(0, 8).map((item) =>
    '<button type="button" data-result-local-state-filter="' + html(item.stateName) + '"' + (item.stateName === active ? " disabled" : "") + '>' + html(item.stateName) + ': ' + html(item.count) + '</button>'
  );
  return clearButton + stateButtons.join("");
}

function summarizeResultReviewFilters(items) {
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const counts = new Map();
  for (const item of items || []) {
    for (const reviewName of resultReviewFilterValues(item?.pairId, reviewContext)) {
      counts.set(reviewName, (counts.get(reviewName) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([reviewName, count]) => ({ reviewName, count }))
    .sort((left, right) => right.count - left.count || left.reviewName.localeCompare(right.reviewName));
}

function renderResultReviewFilterButtons(items) {
  const rows = summarizeResultReviewFilters(items);
  if (rows.length === 0 && !state.resultReviewFilter) return "";
  const active = state.resultReviewFilter;
  const clearButton = active
    ? '<button type="button" data-clear-result-review-filter="true">All result reviews</button>'
    : "";
  const reviewButtons = rows.slice(0, 8).map((item) =>
    '<button type="button" data-result-review-filter="' + html(item.reviewName) + '"' + (item.reviewName === active ? " disabled" : "") + '>' + html(item.reviewName) + ': ' + html(item.count) + '</button>'
  );
  return clearButton + reviewButtons.join("");
}

function matchesResultPairStatus(pairId) {
  return !state.resultPairStatusFilter || resultPairStatus(pairId) === state.resultPairStatusFilter;
}

function resultPairLocalStateFilterValues(pairId) {
  if (!pairId) {
    return ["missing_pair_id"];
  }

  const configuredPair = configuredPairById(pairId);
  if (!configuredPair) {
    return [pairById(pairId) ? "not saved" : "unknown"];
  }

  return [
    configuredPair.enabled === false ? "paused" : "active",
    configuredPair.priority === true ? "priority" : "normal",
    configuredPair.verified === true ? "verified" : "unverified",
    configuredPair.note ? "noted" : ""
  ].filter(Boolean);
}

function matchesResultLocalState(pairId) {
  return !state.resultLocalStateFilter || resultPairLocalStateFilterValues(pairId).includes(state.resultLocalStateFilter);
}

function resultReviewFilterValues(pairId, reviewContext) {
  if (!pairId) {
    return ["missing_pair_id"];
  }

  const configuredPair = configuredPairById(pairId);
  if (!configuredPair) {
    return [pairById(pairId) ? "not saved" : "unknown"];
  }

  const review = getConfiguredPairReview(configuredPair, reviewContext);
  return review.warnings.length === 0 ? ["ok"] : ["needs_review", ...review.warnings];
}

function matchesResultReview(pairId, reviewContext) {
  return !state.resultReviewFilter || resultReviewFilterValues(pairId, reviewContext).includes(state.resultReviewFilter);
}

function matchesVerifiedResultPair(pairId) {
  return !state.verifiedResultsOnly || pairById(pairId)?.verified === true;
}

function setArbVenueFilter(venuePair) {
  state.arbVenueFilter = String(venuePair || "");
  if (state.data) {
    render(state.data);
  }
}

function setSpreadSideFilter(side) {
  state.spreadSideFilter = String(side || "");
  if (state.data) {
    render(state.data);
  }
}

function setResultPairStatusFilter(status) {
  state.resultPairStatusFilter = String(status || "");
  saveDashboardSettings();
  if (state.data) {
    render(state.data);
  }
}

function setResultLocalStateFilter(stateName) {
  state.resultLocalStateFilter = String(stateName || "");
  saveDashboardSettings();
  if (state.data) {
    render(state.data);
  }
}

function setResultReviewFilter(reviewName) {
  state.resultReviewFilter = String(reviewName || "");
  saveDashboardSettings();
  if (state.data) {
    render(state.data);
  }
}

function explainRejectionReason(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("kalshi ticker")) {
    return "Local pair config is missing the Kalshi ticker.";
  }
  if (text.includes("polymarket slug") || text.includes("tokenid")) {
    return "Local pair config is missing Polymarket slug or token ids.";
  }
  if (text.includes("pair id") || text.includes("outcomelabel")) {
    return "Local pair config is incomplete.";
  }
  if (text.includes("not_found") || text.includes("404")) {
    return "One venue did not return the configured market or token.";
  }
  if (text.includes("timeout") || text.includes("network") || text.includes("fetch")) {
    return "Read-only market data request failed; retry or check connectivity.";
  }
  return "Pair was scanned but not usable as a clean cross-venue arb candidate.";
}

function renderRejectionSummary(rejectedPairs, visibleCount) {
  const rows = summarizeRejectionReasons(rejectedPairs);

  if (rows.length === 0) {
    return '<span>Rejected: 0</span>';
  }

  const active = state.rejectionReasonFilter;

  return [
    '<span>Rejected: ' + html(rejectedPairs.length) + '</span>',
    '<span>Visible rejected: ' + html(visibleCount) + '</span>',
    active ? '<button type="button" data-clear-rejection-filter="true">All rejected</button>' : "",
    ...rows.slice(0, 5).map((item) =>
      '<button type="button" data-rejection-filter="' + html(item.reason) + '"' + (item.reason === active ? " disabled" : "") + '>' + html(item.reason) + ': ' + html(item.count) + '</button>'
    )
  ].filter(Boolean).join("");
}

function summarizeRejectionReasons(rejectedPairs) {
  const counts = new Map();

  for (const item of rejectedPairs || []) {
    const reason = String(item?.reason || "unknown");
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function matchesRejectionReason(reason) {
  return !state.rejectionReasonFilter || String(reason || "unknown") === state.rejectionReasonFilter;
}

function getVisibleRejectedPairs(data) {
  return (data.rejectedPairs || [])
    .filter((item) => matches([item.pairId, item.reason].join(" ")))
    .filter((item) => matchesRejectionReason(item.reason));
}

function getVisibleNearCandidates(data) {
  return (data.discoveryResult?.candidatePreview || [])
    .filter((item) => matches([item.kalshiTicker, item.kalshiTitle, item.polymarketSlug, item.polymarketQuestion, item.status].join(" ")))
    .filter((item) => matchesNearStatus(item));
}

function matchesNearStatus(candidate) {
  if (!state.nearStatusFilter) {
    return true;
  }
  if (state.nearStatusFilter === "__addable") {
    return isAddableNearCandidate(candidate);
  }
  return String(candidate?.status || "unknown") === state.nearStatusFilter;
}

function isAddableNearCandidate(candidate) {
  return String(candidate?.status || "") === "candidate";
}

function candidateKey(candidate) {
  return [
    candidate?.kalshiTicker || "",
    candidate?.polymarketSlug || "",
    candidate?.yesTokenId || "",
    candidate?.noTokenId || ""
  ].join("|");
}

function setRejectionReasonFilter(reason) {
  state.rejectionReasonFilter = String(reason || "");
  if (state.data) {
    render(state.data);
  }
}

function setNearStatusFilter(status) {
  state.nearStatusFilter = String(status || "");
  if (state.data) {
    render(state.data);
  }
}

function clearResultFilters() {
  state.query = "";
  state.arbVenueFilter = "";
  state.spreadSideFilter = "";
  state.resultPairStatusFilter = "";
  state.resultLocalStateFilter = "";
  state.resultReviewFilter = "";
  state.arbResultSort = "report";
  state.spreadResultSort = "report";
  state.rejectionReasonFilter = "";
  state.nearStatusFilter = "";
  state.verifiedResultsOnly = false;
  $("search").value = "";
  $("minResultProfitDollars").value = "";
  $("minResultSpreadCents").value = "";
  $("resultLimitRows").value = "";
  $("arbResultSort").value = "report";
  $("spreadResultSort").value = "report";
  $("verifiedResultsOnly").checked = false;
  saveDashboardSettings();
  if (state.data) {
    render(state.data);
  }
  loadPairs().catch(() => {});
  $("status").textContent = "Result filters cleared.";
}

function applyResultQuickView(viewName) {
  state.query = "";
  state.arbVenueFilter = "";
  state.spreadSideFilter = "";
  state.resultPairStatusFilter = "";
  state.resultLocalStateFilter = "";
  state.resultReviewFilter = "";
  state.rejectionReasonFilter = "";
  state.nearStatusFilter = "";
  state.verifiedResultsOnly = false;
  state.arbResultSort = "profit_desc";
  state.spreadResultSort = "diff_desc";
  $("search").value = "";
  $("minResultProfitDollars").value = "";
  $("minResultSpreadCents").value = "";

  if (viewName === "reviewed") {
    state.verifiedResultsOnly = true;
    state.resultReviewFilter = "ok";
  } else if (viewName === "priority") {
    state.verifiedResultsOnly = true;
    state.resultLocalStateFilter = "priority";
    state.resultReviewFilter = "ok";
  } else if (viewName === "new") {
    state.resultPairStatusFilter = "new";
  } else if (viewName === "needs_review") {
    state.resultReviewFilter = "needs_review";
    state.arbResultSort = "review";
    state.spreadResultSort = "review";
  }

  $("verifiedResultsOnly").checked = state.verifiedResultsOnly;
  $("arbResultSort").value = state.arbResultSort;
  $("spreadResultSort").value = state.spreadResultSort;
  saveDashboardSettings();
  if (state.data) {
    render(state.data);
  }
  loadPairs().catch(() => {});
  $("status").textContent = resultQuickViewStatus(viewName);
}

function resultQuickViewStatus(viewName) {
  if (viewName === "reviewed") {
    return "Reviewed result view applied.";
  }
  if (viewName === "priority") {
    return "Priority result view applied.";
  }
  if (viewName === "new") {
    return "New candidate result view applied.";
  }
  if (viewName === "needs_review") {
    return "Needs-review result view applied.";
  }
  return "Result view applied.";
}

function recordScanHistory(data, mode) {
  if (!data || data.status === "missing") return;
  state.scanHistory.unshift({
    at: new Date().toLocaleTimeString(),
    mode,
    arbs: Number(data.summary?.opportunities || 0),
    spreads: Number(data.summary?.priceSpreads || 0),
    pairs: Number(data.summary?.pairsScanned || 0),
    rejected: Number(data.summary?.rejectedPairs || 0)
  });
  state.scanHistory = state.scanHistory.slice(0, 20);
  saveScanHistory();
  renderScanHistory();
}

function renderScanHistory() {
  const rows = state.scanHistory.map((item) => row([
    item.at,
    item.mode,
    item.arbs,
    item.spreads,
    item.pairs,
    item.rejected
  ]));
  $("scanHistory").innerHTML = table(["Time", "Mode", "Arbs", "Spreads", "Pairs", "Rejected"], rows);
}

function loadScanHistory() {
  try {
    const raw = localStorage.getItem(SCAN_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.scanHistory = Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    state.scanHistory = [];
  }
}

function saveScanHistory() {
  try {
    localStorage.setItem(SCAN_HISTORY_STORAGE_KEY, JSON.stringify(state.scanHistory.slice(0, 20)));
  } catch {
    // Browser storage can be unavailable in strict modes; history is best-effort.
  }
}

function clearScanHistory() {
  state.scanHistory = [];
  try {
    localStorage.removeItem(SCAN_HISTORY_STORAGE_KEY);
  } catch {
    // Best-effort clear.
  }
  renderScanHistory();
}

function loadDashboardSettings() {
  try {
    const raw = localStorage.getItem(DASHBOARD_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed.autoDiscover === "boolean") {
      $("autoDiscover").checked = parsed.autoDiscover;
    }
    if (typeof parsed.verifiedResultsOnly === "boolean") {
      state.verifiedResultsOnly = parsed.verifiedResultsOnly;
      $("verifiedResultsOnly").checked = parsed.verifiedResultsOnly;
    }
    if (typeof parsed.resultLocalStateFilter === "string") {
      state.resultLocalStateFilter = parsed.resultLocalStateFilter;
    }
    if (typeof parsed.resultPairStatusFilter === "string") {
      state.resultPairStatusFilter = parsed.resultPairStatusFilter;
    }
    if (typeof parsed.resultReviewFilter === "string") {
      state.resultReviewFilter = parsed.resultReviewFilter;
    }
    if (typeof parsed.arbResultSort === "string" && ARB_RESULT_SORT_VALUES.has(parsed.arbResultSort)) {
      state.arbResultSort = parsed.arbResultSort;
      $("arbResultSort").value = parsed.arbResultSort;
    }
    if (typeof parsed.spreadResultSort === "string" && SPREAD_RESULT_SORT_VALUES.has(parsed.spreadResultSort)) {
      state.spreadResultSort = parsed.spreadResultSort;
      $("spreadResultSort").value = parsed.spreadResultSort;
    }
    if (parsed.previewResultSort && typeof parsed.previewResultSort === "object") {
      if (typeof parsed.previewResultSort.arbs === "string" && PREVIEW_RESULT_SORT_VALUES.has(parsed.previewResultSort.arbs)) {
        state.previewResultSort.arbs = parsed.previewResultSort.arbs;
      }
      if (typeof parsed.previewResultSort.spreads === "string" && PREVIEW_RESULT_SORT_VALUES.has(parsed.previewResultSort.spreads)) {
        state.previewResultSort.spreads = parsed.previewResultSort.spreads;
      }
    }
    setNumberInputFromSetting("minNetCents", parsed.minNetCents, 0);
    setNumberInputFromSetting("kalshiFeeCents", parsed.kalshiFeeCents, 0);
    setNumberInputFromSetting("polymarketFeeCents", parsed.polymarketFeeCents, 0);
    setNumberInputFromSetting("watchIntervalSeconds", parsed.watchIntervalSeconds, 5);
    setNumberInputFromSetting("minResultProfitDollars", parsed.minResultProfitDollars, 0);
    setNumberInputFromSetting("minResultSpreadCents", parsed.minResultSpreadCents, 0);
    setNumberInputFromSetting("resultLimitRows", parsed.resultLimitRows, 1);
    setSelectFromSetting("simpleVenueFilter", parsed.simpleVenueFilter);
    setSelectFromSetting("simpleCategoryFilter", parsed.simpleCategoryFilter);
    setSelectFromSetting("simpleReviewFilter", parsed.simpleReviewFilter);
    setSelectFromSetting("simpleDiscoveryStatusFilter", parsed.simpleDiscoveryStatusFilter);
    state.simpleVenueFilter = $("simpleVenueFilter").value || "all";
    state.simpleCategoryFilter = $("simpleCategoryFilter").value || "all";
    state.simpleReviewFilter = $("simpleReviewFilter").value || "all";
    state.simpleResolveWithinFilter = typeof parsed.simpleResolveWithinFilter === "string"
      ? parsed.simpleResolveWithinFilter
      : "any";
    state.simpleDiscoveryStatusFilter = $("simpleDiscoveryStatusFilter").value || "open";
    setNumberInputFromSetting("simpleMinNetCents", parsed.simpleMinNetCents ?? parsed.minNetCents, 0);
    setNumberInputFromSetting("simpleMinVolume24h", parsed.simpleMinVolume24h, 0);
    setNumberInputFromSetting("simpleMinLiquidity", parsed.simpleMinLiquidity, 0);
    updateSimpleSliderOutputs();
    updateSimpleResolveButtons();
  } catch {
    // Settings are best-effort local UI state.
  }
}

function setSelectFromSetting(id, value) {
  if (typeof value !== "string") return;
  const element = $(id);
  if ([...element.options].some((option) => option.value === value)) {
    element.value = value;
  }
}

function setNumberInputFromSetting(id, value, min) {
  if (value === null || value === undefined || value === "") return;
  const element = $(id);
  if (!element) return;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= min) {
    element.value = String(parsed);
  }
}

function saveDashboardSettings() {
  try {
    localStorage.setItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify({
      autoDiscover: Boolean($("autoDiscover").checked),
      verifiedResultsOnly: Boolean(state.verifiedResultsOnly),
      resultPairStatusFilter: String(state.resultPairStatusFilter || ""),
      resultLocalStateFilter: String(state.resultLocalStateFilter || ""),
      resultReviewFilter: String(state.resultReviewFilter || ""),
      arbResultSort: String(state.arbResultSort || "report"),
      spreadResultSort: String(state.spreadResultSort || "report"),
      previewResultSort: {
        arbs: String(state.previewResultSort.arbs || "preview_order"),
        spreads: String(state.previewResultSort.spreads || "preview_order")
      },
      minNetCents: readNumberInput("minNetCents"),
      kalshiFeeCents: readNumberInput("kalshiFeeCents"),
      polymarketFeeCents: readNumberInput("polymarketFeeCents"),
      watchIntervalSeconds: readNumberInput("watchIntervalSeconds"),
      minResultProfitDollars: readOptionalNumberInput("minResultProfitDollars"),
      minResultSpreadCents: readOptionalNumberInput("minResultSpreadCents"),
      resultLimitRows: readOptionalPositiveIntegerInput("resultLimitRows"),
      simpleVenueFilter: String(state.simpleVenueFilter || "all"),
      simpleCategoryFilter: String(state.simpleCategoryFilter || "all"),
      simpleReviewFilter: String(state.simpleReviewFilter || "all"),
      simpleResolveWithinFilter: String(state.simpleResolveWithinFilter || "any"),
      simpleDiscoveryStatusFilter: String(state.simpleDiscoveryStatusFilter || "open"),
      simpleMinNetCents: readOptionalNumberInput("simpleMinNetCents"),
      simpleMinVolume24h: readOptionalNumberInput("simpleMinVolume24h"),
      simpleMinLiquidity: readOptionalNumberInput("simpleMinLiquidity")
    }));
  } catch {
    // Best-effort local preference only.
  }
}

function readNumberInput(id) {
  const element = $(id);
  const parsed = Number(element?.value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalNumberInput(id) {
  const element = $(id);
  if (!element) return null;
  const value = String(element.value || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalPositiveIntegerInput(id) {
  const element = $(id);
  if (!element) return null;
  const value = String(element.value || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function updateSimpleSliderOutputs() {
  setSimpleSliderOutput("simpleMinNetCents", formatCentsSliderValue);
  setSimpleSliderOutput("simpleMinVolume24h", formatDollarSliderValue);
  setSimpleSliderOutput("simpleMinLiquidity", formatDollarSliderValue);
}

function setSimpleSliderOutput(inputId, formatter) {
  const input = $(inputId);
  const output = $(inputId + "Value");
  if (!input || !output) return;
  output.textContent = formatter(Number(input.value));
}

function formatCentsSliderValue(value) {
  return Number.isFinite(value) ? value.toFixed(1) + "c" : "0.0c";
}

function formatDollarSliderValue(value) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return "$" + Math.round(value / 1_000) + "k";
  return "$" + Math.round(value);
}

function updateSimpleResolveButtons() {
  document.querySelectorAll("[data-simple-resolve-filter]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-simple-resolve-filter") === state.simpleResolveWithinFilter);
  });
}

function bindDashboardSettingsPersistence() {
  ["autoDiscover", "minNetCents", "kalshiFeeCents", "polymarketFeeCents", "watchIntervalSeconds"].forEach((id) => {
    $(id).addEventListener("change", saveDashboardSettings);
    $(id).addEventListener("input", saveDashboardSettings);
  });
  ["simpleVenueFilter", "simpleCategoryFilter", "simpleReviewFilter", "simpleDiscoveryStatusFilter"].forEach((id) => {
    const updateSimpleFilter = () => {
      state[id] = $(id).value;
      saveDashboardSettings();
      if (state.data) {
        render(state.data);
      }
      if (state.discoveryReview) {
        renderDiscoveryReview(state.discoveryReview);
      }
    };
    $(id).addEventListener("change", updateSimpleFilter);
  });
  document.querySelectorAll("[data-simple-resolve-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.simpleResolveWithinFilter = button.getAttribute("data-simple-resolve-filter") || "any";
      updateSimpleResolveButtons();
      saveDashboardSettings();
      if (state.data) {
        render(state.data);
      }
    });
  });
  ["simpleMinNetCents", "simpleMinVolume24h", "simpleMinLiquidity"].forEach((id) => {
    const updateSimpleNumericFilter = () => {
      updateSimpleSliderOutputs();
      if (id === "simpleMinNetCents") {
        $("minNetCents").value = $("simpleMinNetCents").value || "0.5";
      }
      saveDashboardSettings();
      if (state.data) {
        render(state.data);
      }
    };
    $(id).addEventListener("change", updateSimpleNumericFilter);
    $(id).addEventListener("input", updateSimpleNumericFilter);
  });
  ["minResultProfitDollars", "minResultSpreadCents", "resultLimitRows"].forEach((id) => {
    const updateResultFilter = () => {
      saveDashboardSettings();
      if (state.data) {
        render(state.data);
      }
    };
    $(id).addEventListener("change", updateResultFilter);
    $(id).addEventListener("input", updateResultFilter);
  });
  $("arbResultSort").addEventListener("change", () => {
    state.arbResultSort = ARB_RESULT_SORT_VALUES.has($("arbResultSort").value)
      ? $("arbResultSort").value
      : "report";
    saveDashboardSettings();
    if (state.data) {
      render(state.data);
    }
  });
  $("spreadResultSort").addEventListener("change", () => {
    state.spreadResultSort = SPREAD_RESULT_SORT_VALUES.has($("spreadResultSort").value)
      ? $("spreadResultSort").value
      : "report";
    saveDashboardSettings();
    if (state.data) {
      render(state.data);
    }
  });
  $("verifiedResultsOnly").addEventListener("change", (event) => {
    state.verifiedResultsOnly = Boolean(event.target.checked);
    saveDashboardSettings();
    if (state.data) {
      render(state.data);
    }
  });
}

function loadNotificationPreference() {
  try {
    state.notifyOnArbs = localStorage.getItem(NOTIFY_ON_ARBS_STORAGE_KEY) === "true";
    state.notifyVerifiedOnly = localStorage.getItem(NOTIFY_VERIFIED_ONLY_STORAGE_KEY) === "true";
  } catch {
    state.notifyOnArbs = false;
    state.notifyVerifiedOnly = false;
  }
  $("notifyOnArbs").checked = state.notifyOnArbs;
  $("notifyVerifiedOnly").checked = state.notifyVerifiedOnly;
  updateNotificationControls();
}

function saveNotificationPreference() {
  try {
    localStorage.setItem(NOTIFY_ON_ARBS_STORAGE_KEY, state.notifyOnArbs ? "true" : "false");
    localStorage.setItem(NOTIFY_VERIFIED_ONLY_STORAGE_KEY, state.notifyVerifiedOnly ? "true" : "false");
  } catch {
    // Best-effort local preference only.
  }
}

function updateNotificationControls() {
  const button = $("enableNotifications");
  if (!("Notification" in window)) {
    button.disabled = true;
    button.textContent = "Notifications unavailable";
    return;
  }
  if (Notification.permission === "granted") {
    button.disabled = true;
    button.textContent = "Notifications enabled";
    return;
  }
  button.disabled = false;
  button.textContent = Notification.permission === "denied" ? "Notifications blocked" : "Enable notifications";
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    $("status").textContent = "Browser notifications are not available.";
    updateNotificationControls();
    return;
  }
  const permission = await Notification.requestPermission();
  updateNotificationControls();
  $("status").textContent = permission === "granted"
    ? "Local arb notifications enabled."
    : "Local arb notifications not enabled by the browser.";
}

function canNotify() {
  return "Notification" in window && Notification.permission === "granted";
}

function maybeNotifyArbs(data, mode) {
  const arbs = getNotifiableArbs(data);
  const count = arbs.length;
  if (count <= 0 || !state.notifyOnArbs || !canNotify()) return;
  const signature = buildArbNotificationSignature(arbs);
  if (!signature || signature === state.lastNotificationSignature) return;
  state.lastNotificationSignature = signature;
  try {
    new Notification(state.notifyVerifiedOnly ? "Verified cross-venue arb candidates" : "Cross-venue arb candidates", {
      body: count + (state.notifyVerifiedOnly ? " verified" : "") + " candidate(s) found in " + mode + ". Open the local dashboard for details.",
      tag: "crossvenue-arbs",
      renotify: true
    });
  } catch {
    // Notification delivery is best-effort and must not break scanning.
  }
}

function getNotifiableArbs(data) {
  const arbs = data?.opportunities || [];
  return state.notifyVerifiedOnly
    ? arbs.filter((item) => pairById(item.pairId)?.verified === true)
    : arbs;
}

function buildArbNotificationSignature(arbs) {
  return (arbs || [])
    .map((item) => [
      item.pairId,
      item.title,
      item.outcomeLabel,
      item.buyYesVenue,
      item.buyNoVenue,
      item.netCents,
      item.executableSize
    ].join("|"))
    .sort()
    .join(";");
}

function renderNearSummary(candidates, visibleCount) {
  if (!candidates || candidates.length === 0) {
    return '<span>Near matches: 0</span>';
  }

  const active = state.nearStatusFilter;
  const statusRows = summarizeNearStatuses(candidates);
  const addableCount = candidates.filter(isAddableNearCandidate).length;

  return [
    '<span>Near matches: ' + html(candidates.length) + '</span>',
    '<span>Visible near: ' + html(visibleCount) + '</span>',
    active ? '<button type="button" data-clear-near-status-filter="true">All near</button>' : "",
    '<button type="button" data-near-status-filter="__addable"' + (active === "__addable" ? " disabled" : "") + '>Addable: ' + html(addableCount) + '</button>',
    ...statusRows.slice(0, 5).map((item) =>
      '<button type="button" data-near-status-filter="' + html(item.status) + '"' + (item.status === active ? " disabled" : "") + '>' + html(item.status) + ': ' + html(item.count) + '</button>'
    )
  ].filter(Boolean).join("");
}

function summarizeNearStatuses(candidates) {
  const counts = new Map();

  for (const item of candidates || []) {
    const status = String(item?.status || "unknown");
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
}

function renderNearCandidates(candidates) {
  if (candidates.length === 0) return '<p class="empty">No rows.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>Kalshi</th><th>Polymarket</th><th>Score</th><th>Status</th><th>Shared</th><th>Action</th></tr></thead><tbody>' +
    candidates.map((item) => {
      const canAdd = isAddableNearCandidate(item);
      const key = candidateKey(item);
      const action = canAdd
        ? '<button type="button" data-preview-near-pair-key="' + html(key) + '">Preview</button> <button type="button" data-add-pair-key="' + html(key) + '">Add pair</button> <button type="button" data-add-verified-pair-key="' + html(key) + '">Add verified</button>'
        : '<span class="warn">Filtered</span>';
      return '<tr><td>' + kalshiMarketLink(item.kalshiTicker) + '<br>' + html(item.kalshiTitle) + '</td><td>' + polymarketMarketLink(item.polymarketSlug) + '<br>' + html(item.polymarketQuestion) + '</td><td>' + html(Number(item.matchScore).toFixed(3)) + '</td><td>' + html(item.status) + '</td><td>' + html(item.matchReason) + '</td><td>' + action + '</td></tr>';
    }).join("") +
    '</tbody></table></div>';
}

function configuredPairActions(item) {
  return [
    '<button type="button" data-preview-config-pair="' + html(item.id) + '">Preview</button>',
    '<button type="button" data-scan-config-pair="' + html(item.id) + '">Scan</button>',
    copyPairJsonButton(item.id),
    copyPairSummaryButton(item.id),
    '<button type="button" data-edit-note-pair="' + html(item.id) + '">Note</button>',
    '<button type="button" data-clear-note-pair="' + html(item.id) + '">Clear note</button>',
    '<button type="button" data-toggle-priority-pair="' + html(item.id) + '" data-toggle-priority="' + html(item.priority === true ? "false" : "true") + '">' + html(item.priority === true ? "Unstar" : "Star") + '</button>',
    '<button type="button" data-toggle-verified-pair="' + html(item.id) + '" data-toggle-verified="' + html(item.verified === true ? "false" : "true") + '">' + html(item.verified === true ? "Unverify" : "Verify") + '</button>',
    '<button type="button" data-toggle-pair="' + html(item.id) + '" data-toggle-enabled="' + html(item.enabled === false ? "true" : "false") + '">' + html(item.enabled === false ? "Resume" : "Pause") + '</button>',
    '<button type="button" data-delete-pair="' + html(item.id) + '">Remove</button>'
  ].filter(Boolean).join(" ");
}

function renderConfiguredPairs(data) {
  state.configPairs = data.pairs || [];
  const validPairIds = new Set(state.configPairs.map((item) => item.id));
  state.selectedConfigPairIds = state.selectedConfigPairIds.filter((id) => validPairIds.has(id));
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const allPairs = state.configPairs.map((item) => ({
    ...item,
    lastScanStatus: getPairLastScanStatus(item),
    review: getConfiguredPairReview(item, reviewContext)
  }));
  const activeCount = allPairs.filter((item) => item.enabled !== false).length;
  const pausedCount = allPairs.length - activeCount;
  const priorityCount = allPairs.filter((item) => item.priority === true).length;
  const verifiedCount = allPairs.filter((item) => item.verified === true).length;
  const reviewCount = allPairs.filter((item) => item.review.status !== "ok").length;
  const readyCount = allPairs.filter((item) => isConfiguredPairReady(item)).length;
  const lastArbCount = allPairs.filter((item) => isConfiguredPairLastArb(item)).length;
  const lastSpreadCount = allPairs.filter((item) => isConfiguredPairLastSpread(item)).length;
  const lastRejectedCount = allPairs.filter((item) => isConfiguredPairLastRejected(item)).length;
  const pairs = allPairs
    .filter((item) => shouldShowConfiguredPairForFilter(item))
    .filter((item) => matchesReviewWarning(item))
    .filter((item) => matches([item.title, item.kalshi?.ticker, item.polymarket?.slug, item.note, item.lastScanStatus, item.review.label].join(" ")));
  $("configPairSummary").innerHTML = '<span>Total: ' + html(allPairs.length) + '</span><span>Priority: ' + html(priorityCount) + '</span><span>Verified: ' + html(verifiedCount) + '</span><span>Ready: ' + html(readyCount) + '</span><span>Active: ' + html(activeCount) + '</span><span>Paused: ' + html(pausedCount) + '</span><span>Needs review: ' + html(reviewCount) + '</span><span>Last arb: ' + html(lastArbCount) + '</span><span>Last spread: ' + html(lastSpreadCount) + '</span><span>Last rejected: ' + html(lastRejectedCount) + '</span><span>Selected: ' + html(state.selectedConfigPairIds.length) + '</span><span>Filter: ' + html(state.configPairFilter) + '</span><span>Warning filter: ' + html(state.reviewWarningFilter || "all") + '</span>' + renderConfigReviewWarningSummary(allPairs);
  $("configPairs").innerHTML = table(["Select", "Pair", "Priority", "Verified", "Note", "Kalshi", "Polymarket", "Tokens", "Status", "Review", "Last Scan", "Action"], pairs.map((item) =>
    rowRaw([
      '<input type="checkbox" data-select-config-pair="' + html(item.id) + '"' + (state.selectedConfigPairIds.includes(item.id) ? " checked" : "") + '>',
      html(item.title),
      html(item.priority === true ? "yes" : "no"),
      html(item.verified === true ? "yes" : "no"),
      html(item.note || ""),
      kalshiMarketLink(item.kalshi?.ticker),
      polymarketMarketLink(item.polymarket?.slug),
      html([item.polymarket?.yesTokenId, item.polymarket?.noTokenId].join(" / ")),
      html(item.enabled === false ? "paused" : "active"),
      html(item.review.label),
      html(item.lastScanStatus),
      configuredPairActions(item)
    ])
  ));
}

function shouldShowConfiguredPairForFilter(item) {
  if (state.configPairFilter === "priority") return item.priority === true;
  if (state.configPairFilter === "verified") return item.verified === true;
  if (state.configPairFilter === "unverified") return item.verified !== true;
  if (state.configPairFilter === "ready") return isConfiguredPairReady(item);
  if (state.configPairFilter === "active") return item.enabled !== false;
  if (state.configPairFilter === "paused") return item.enabled === false;
  if (state.configPairFilter === "review") return item.review.status !== "ok";
  if (state.configPairFilter === "lastArb") return isConfiguredPairLastArb(item);
  if (state.configPairFilter === "lastSpread") return isConfiguredPairLastSpread(item);
  if (state.configPairFilter === "lastRejected") return isConfiguredPairLastRejected(item);
  return true;
}

function matchesReviewWarning(item) {
  return !state.reviewWarningFilter || (item.review?.warnings || []).includes(state.reviewWarningFilter);
}

function summarizeReviewWarnings(pairs) {
  const counts = new Map();
  for (const item of pairs || []) {
    for (const warning of item.review?.warnings || []) {
      counts.set(warning, (counts.get(warning) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([warning, count]) => ({ warning, count }))
    .sort((left, right) => right.count - left.count || left.warning.localeCompare(right.warning));
}

function renderConfigReviewWarningSummary(pairs) {
  const rows = summarizeReviewWarnings(pairs);
  if (rows.length === 0 && !state.reviewWarningFilter) return "";
  const clearButton = state.reviewWarningFilter
    ? '<button type="button" data-clear-review-warning-filter="true">All warnings</button>'
    : "";
  const warningButtons = rows.slice(0, 8).map((item) =>
    '<button type="button" data-review-warning-filter="' + html(item.warning) + '"' + (item.warning === state.reviewWarningFilter ? " disabled" : "") + '>' + html(item.warning) + ': ' + html(item.count) + '</button>'
  );
  return clearButton + warningButtons.join("");
}

function isConfiguredPairReady(item) {
  return item.enabled !== false && item.review.status === "ok";
}

function isConfiguredPairLastArb(item) {
  return String(item.lastScanStatus || "").startsWith("arb ");
}

function isConfiguredPairLastSpread(item) {
  return String(item.lastScanStatus || "").startsWith("spread ");
}

function isConfiguredPairLastRejected(item) {
  return String(item.lastScanStatus || "").startsWith("rejected:");
}

function getLastRejectedConfigPairs() {
  return state.configPairs.filter((pair) =>
    isConfiguredPairLastRejected({ ...pair, lastScanStatus: getPairLastScanStatus(pair) })
  );
}

function buildConfiguredPairReviewContext(pairs) {
  const context = {
    kalshiTickerCounts: new Map(),
    polymarketSlugCounts: new Map(),
    tokenPairCounts: new Map()
  };
  (pairs || []).forEach((pair) => {
    incrementReviewCount(context.kalshiTickerCounts, normalizedReviewKey(pair.kalshi?.ticker));
    incrementReviewCount(context.polymarketSlugCounts, normalizedReviewKey(pair.polymarket?.slug));
    incrementReviewCount(context.tokenPairCounts, normalizedTokenPairKey(pair));
  });
  return context;
}

function incrementReviewCount(counts, key) {
  if (!key) return;
  counts.set(key, (counts.get(key) || 0) + 1);
}

function normalizedReviewKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedTokenPairKey(pair) {
  return [
    String(pair.polymarket?.yesTokenId || "").trim(),
    String(pair.polymarket?.noTokenId || "").trim()
  ]
    .filter((value) => value)
    .sort()
    .join("|");
}

function getConfiguredPairReview(pair, context) {
  const warnings = [];
  const kalshiTicker = String(pair.kalshi?.ticker || "").trim();
  const polymarketSlug = String(pair.polymarket?.slug || "").trim();
  const yesTokenId = String(pair.polymarket?.yesTokenId || "").trim();
  const noTokenId = String(pair.polymarket?.noTokenId || "").trim();
  const title = String(pair.title || "").trim();

  if (!kalshiTicker) warnings.push("missing_kalshi_ticker");
  if (!polymarketSlug) warnings.push("missing_polymarket_slug");
  if (!yesTokenId) warnings.push("missing_yes_token");
  if (!noTokenId) warnings.push("missing_no_token");
  if (!Number.isFinite(pair.expectedResolutionAt)) warnings.push("missing_resolution_time");
  if ((context?.kalshiTickerCounts.get(normalizedReviewKey(kalshiTicker)) || 0) > 1) warnings.push("duplicate_kalshi_ticker");
  if ((context?.polymarketSlugCounts.get(normalizedReviewKey(polymarketSlug)) || 0) > 1) warnings.push("duplicate_polymarket_slug");
  if ((context?.tokenPairCounts.get(normalizedTokenPairKey(pair)) || 0) > 1) warnings.push("duplicate_token_pair");

  const leftTokens = normalizeTokens([title, pair.outcomeLabel, kalshiTicker].join(" "));
  const rightTokens = normalizeTokens(polymarketSlug);
  const sharedTokens = leftTokens.filter((token) => rightTokens.includes(token));
  if (title && polymarketSlug && sharedTokens.length === 0) {
    warnings.push("low_text_overlap");
  }

  return warnings.length === 0
    ? { status: "ok", label: "ok", warnings: [] }
    : { status: "review", label: "review: " + warnings.join(", "), warnings };
}

function setConfigPairSelected(id, selected) {
  if (!id) return;
  const next = new Set(state.selectedConfigPairIds);
  if (selected) next.add(id);
  else next.delete(id);
  state.selectedConfigPairIds = Array.from(next).sort();
  renderConfiguredPairs({ pairs: state.configPairs });
}

function getVisibleConfigPairIds() {
  return Array.from(document.querySelectorAll("[data-select-config-pair]"))
    .map((input) => input.getAttribute("data-select-config-pair"))
    .filter((id) => id);
}

function setVisibleConfigPairsSelected(selected) {
  const visibleIds = getVisibleConfigPairIds();
  const next = new Set(state.selectedConfigPairIds);
  visibleIds.forEach((id) => {
    if (selected) next.add(id);
    else next.delete(id);
  });
  state.selectedConfigPairIds = Array.from(next).sort();
  renderConfiguredPairs({ pairs: state.configPairs });
  $("status").textContent = selected
    ? "Visible configured pairs selected."
    : "Visible configured pair selection cleared.";
}

function getPairLastScanStatus(pair) {
  const data = state.data;
  if (!data || data.status === "missing") {
    return pair.enabled === false ? "paused" : "not scanned";
  }
  const arbs = (data.opportunities || []).filter((item) => item.pairId === pair.id);
  if (arbs.length > 0) {
    const best = Math.max(...arbs.map((item) => Number(item.netCents || 0)));
    return "arb x" + arbs.length + " | best " + best.toFixed(2) + "c";
  }
  const spreads = (data.priceSpreads || []).filter((item) => item.pairId === pair.id);
  if (spreads.length > 0) {
    const best = Math.max(...spreads.map((item) => Number(item.diffCents || 0)));
    return "spread x" + spreads.length + " | max " + best.toFixed(2) + "c";
  }
  const rejected = (data.rejectedPairs || []).find((item) => item.pairId === pair.id);
  if (rejected) {
    return "rejected: " + rejected.reason;
  }
  const scanned = (data.pairs || []).some((item) => item.id === pair.id);
  if (scanned) {
    return "no signal";
  }
  return pair.enabled === false ? "paused" : "not in last scan";
}

function setConfigPairFilter(filter) {
  state.configPairFilter = ["all", "priority", "verified", "unverified", "ready", "active", "paused", "review", "lastArb", "lastSpread", "lastRejected"].includes(filter) ? filter : "all";
  loadPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Pair filter failed: ' + html(error?.message || error) + '</span>';
  });
}

function setReviewWarningFilter(filter) {
  state.reviewWarningFilter = filter || "";
  renderConfiguredPairs({ pairs: state.configPairs });
}

function renderPairBuilder() {
  state.selectedPairPreviewId = "";
  const kalshi = state.selectedKalshi;
  const polymarket = state.selectedPolymarket;
  $("selectedPair").innerHTML =
    selectedBox("Kalshi", kalshi ? kalshi.ticker : "None selected", kalshi ? kalshi.title : "Search and use a Kalshi market.") +
    selectedBox("Polymarket", polymarket ? polymarket.slug : "None selected", polymarket ? polymarket.question : "Search and use a Polymarket market.");
  $("selectedPair").insertAdjacentHTML("afterend", renderPairQuality(kalshi, polymarket));
  $("pairPreview").innerHTML = "";
  updateManualPairButtons();
}

function selectedPairPreviewReady(pair) {
  return Boolean(pair?.id && state.selectedPairPreviewId === pair.id);
}

function updateManualPairButtons() {
  const pair = buildSelectedPair();
  const hasPair = Boolean(pair);
  const previewReady = selectedPairPreviewReady(pair);
  $("previewManualPair").disabled = !hasPair;
  $("saveManualPair").disabled = !hasPair;
  $("saveVerifiedManualPair").disabled = !hasPair || !previewReady;
  $("saveVerifiedManualPair").title = previewReady
    ? "Save this previewed pair as manually verified."
    : "Preview this exact pair before saving it as verified.";
}

function selectedBox(label, title, detail) {
  return '<div class="selected-box"><small>' + html(label) + '</small><strong>' + html(title) + '</strong><span>' + html(detail) + '</span></div>';
}

function renderPairQuality(kalshi, polymarket) {
  const existing = document.getElementById("pairQuality");
  if (existing) existing.remove();
  if (!kalshi || !polymarket) {
    return '<div id="pairQuality" class="quality-box"><strong>Pair quality</strong><span>Select both sides to see text and timing checks.</span></div>';
  }
  const quality = evaluatePairQuality(kalshi, polymarket);
  const className = quality.status === "ok" ? "quality-ok" : "quality-warning";
  const warningText = quality.warnings.length === 0 ? "none" : quality.warnings.join(", ");
  return '<div id="pairQuality" class="quality-box"><strong class="' + className + '">Pair quality: ' + html(quality.status) + '</strong><span>Match score: ' + html(quality.matchScore.toFixed(3)) + ' | Shared: ' + html(quality.sharedTokens.join(", ") || "none") + ' | Resolution diff: ' + html(quality.resolutionDiffHours === null ? "unknown" : quality.resolutionDiffHours.toFixed(2) + "h") + ' | Warnings: ' + html(warningText) + '</span></div>';
}

function evaluatePairQuality(kalshi, polymarket) {
  const kalshiTokens = normalizeTokens([kalshi.ticker, kalshi.eventTicker, kalshi.title, kalshi.subtitle, kalshi.yesSubTitle, kalshi.noSubTitle].join(" "));
  const polymarketTokens = normalizeTokens([polymarket.slug, polymarket.question].join(" "));
  const sharedTokens = kalshiTokens.filter((token) => polymarketTokens.includes(token));
  const matchScore = Math.round((sharedTokens.length / Math.max(1, Math.min(kalshiTokens.length, polymarketTokens.length)) + Number.EPSILON) * 1000) / 1000;
  const hasKalshiTime = Number.isFinite(kalshi.expectedResolutionAt);
  const hasPolymarketTime = Number.isFinite(polymarket.expectedResolutionAt);
  const resolutionDiffHours = hasKalshiTime && hasPolymarketTime
    ? Math.round((Math.abs(kalshi.expectedResolutionAt - polymarket.expectedResolutionAt) / 3600000 + Number.EPSILON) * 100) / 100
    : null;
  const warnings = [];
  if (!String(kalshi.ticker || "").trim()) warnings.push("missing_kalshi_ticker");
  if (!String(polymarket.yesTokenId || "").trim() || !String(polymarket.noTokenId || "").trim()) warnings.push("missing_polymarket_tokens");
  if (matchScore < 0.25) warnings.push("low_text_overlap");
  if (resolutionDiffHours === null) warnings.push("missing_resolution_time");
  else if (resolutionDiffHours > 336) warnings.push("resolution_time_mismatch");
  if (hasResolutionTermsMismatch(kalshi, polymarket)) warnings.push("resolution_terms_mismatch");
  return { status: warnings.length === 0 ? "ok" : "warning", matchScore, sharedTokens, resolutionDiffHours, warnings };
}

function normalizeTokens(text) {
  const synonyms = new Map([["usa", "us"], ["u", "us"], ["united", "us"], ["states", "us"], ["election", "elect"], ["elections", "elect"], ["championship", "champion"], ["champions", "champion"], ["wins", "win"], ["winning", "win"], ["rates", "rate"]]);
  const stopwords = new Set(["a", "an", "and", "any", "as", "at", "be", "before", "by", "for", "from", "in", "is", "it", "market", "of", "on", "or", "the", "to", "will", "with"]);
  return [...new Set(String(text || "").toLowerCase().replaceAll("&", " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\\s+/).filter((token) => token.length > 1).map((token) => synonyms.get(token) || token).filter((token) => !stopwords.has(token)))];
}

function hasResolutionTermsMismatch(kalshi, polymarket) {
  const kalshiText = [kalshi.title, kalshi.subtitle, kalshi.yesSubTitle, kalshi.noSubTitle, kalshi.rulesPrimary, kalshi.rulesSecondary].join(" ");
  const polymarketText = [polymarket.question, polymarket.slug, polymarket.rulesText, polymarket.resolutionSource].join(" ");
  const kalshiYears = extractResolutionYears(kalshiText);
  const polymarketYears = extractResolutionYears(polymarketText);
  if (kalshiYears.length && polymarketYears.length && !kalshiYears.some((year) => polymarketYears.includes(year))) return true;
  const kalshiThresholds = extractResolutionThresholds(kalshiText);
  const polymarketThresholds = extractResolutionThresholds(polymarketText);
  return kalshiThresholds.length && polymarketThresholds.length && !kalshiThresholds.some((threshold) => polymarketThresholds.includes(threshold));
}

function extractResolutionYears(text) {
  return [...new Set((String(text || "").match(/\\b20[2-9]\\d\\b/g) || []))];
}

function extractResolutionThresholds(text) {
  const normalized = String(text || "").toLowerCase().replace(/,/g, "").replace(/\\s+/g, " ");
  const regex = /\\b(at\\s+or\\s+above|at\\s+or\\s+below|at\\s+least|at\\s+most|greater\\s+than|less\\s+than|more\\s+than|above|below|over|under)\\s+(\\$)?(\\d+(?:\\.\\d+)?)\\s*(%|percent|points?|dollars?|usd)?\\b/g;
  const thresholds = [];
  let match = regex.exec(normalized);
  while (match) {
    thresholds.push([normalizeThresholdDirection(match[1]), match[3], normalizeThresholdUnit(match[4], match[2] === "$")].join(":"));
    match = regex.exec(normalized);
  }
  return [...new Set(thresholds)];
}

function normalizeThresholdDirection(value) {
  const text = String(value || "").replace(/\\s+/g, " ");
  if (["above", "over", "more than", "greater than"].includes(text)) return "above";
  if (["at least", "at or above"].includes(text)) return "above_equal";
  if (["below", "under", "less than"].includes(text)) return "below";
  if (["at most", "at or below"].includes(text)) return "below_equal";
  return text;
}

function normalizeThresholdUnit(value, currency) {
  const text = String(value || "").toLowerCase();
  if (currency || ["dollars", "dollar", "usd"].includes(text)) return "dollar";
  if (["%", "percent"].includes(text)) return "percent";
  if (["point", "points"].includes(text)) return "point";
  return "";
}

function renderMarketSearchResults() {
  const kalshiRows = (state.marketSearch.kalshi || []).map((item, index) =>
    '<tr><td>' + kalshiMarketLink(item.ticker) + '</td><td>' + html(item.title) + '</td><td>' + html(item.yesSubTitle || "YES") + '</td><td>' + html(price(item.yesAsk) + " / " + price(item.noAsk)) + '</td><td>' + html(item.matchReason) + '</td><td><button type="button" data-use-kalshi="' + index + '">Use Kalshi</button></td></tr>'
  );
  const polymarketRows = (state.marketSearch.polymarket || []).map((item, index) =>
    '<tr><td>' + polymarketMarketLink(item.slug) + '</td><td>' + html(item.question) + '</td><td>' + html(item.yesTokenId.slice(0, 10) + "..." + " / " + item.noTokenId.slice(0, 10) + "...") + '</td><td>' + html(item.matchReason) + '</td><td><button type="button" data-use-polymarket="' + index + '">Use Polymarket</button></td></tr>'
  );
  $("searchResults").innerHTML =
    '<h3>Kalshi Results</h3>' + table(["Ticker", "Title", "Outcome", "YES / NO ask", "Match", "Action"], kalshiRows) +
    '<h3>Polymarket Results</h3>' + table(["Slug", "Question", "Tokens", "Match", "Action"], polymarketRows);
}

async function searchMarkets() {
  const query = $("pairSearch").value.trim();
  if (!query) {
    state.marketSearch = { kalshi: [], polymarket: [] };
    renderMarketSearchResults();
    return;
  }

  const button = $("pairSearchButton");
  button.disabled = true;
  $("status").textContent = "Searching read-only public markets...";
  try {
    const response = await fetch("/api/search?q=" + encodeURIComponent(query), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    state.marketSearch = await response.json();
    renderMarketSearchResults();
    $("status").textContent = "Search loaded. Select one Kalshi market and one Polymarket market.";
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Search failed: ' + html(error?.message || error) + '</span>';
  } finally {
    button.disabled = false;
  }
}

async function saveManualPair(verified) {
  const pair = buildSelectedPair();
  if (!pair) return;
  if (verified && !selectedPairPreviewReady(pair)) {
    $("status").innerHTML = '<span class="warn">Preview this exact pair before saving it as verified.</span>';
    return;
  }
  const pairToSave = { ...pair, verified: Boolean(verified) };
  $("status").textContent = verified ? "Saving local verified pair config..." : "Saving local pair config...";
  const response = await fetch("/api/pairs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pair: pairToSave })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  renderConfiguredPairs(await response.json());
  $("status").textContent = verified
    ? "Pair saved locally as manually verified. Use Scan verified or Start verified watch to monitor it."
    : "Pair saved locally. Use Scan configured pairs to evaluate saved mappings.";
}

function buildSelectedPair() {
  const kalshi = state.selectedKalshi;
  const polymarket = state.selectedPolymarket;
  if (!kalshi || !polymarket) return null;
  const times = [kalshi.expectedResolutionAt, polymarket.expectedResolutionAt].filter((value) => Number.isFinite(value));
  return {
    id: kalshi.ticker + "|" + polymarket.slug,
    title: kalshi.title || polymarket.question,
    outcomeLabel: kalshi.yesSubTitle || "YES",
    expectedResolutionAt: times.length > 0 ? Math.max(...times) : null,
    kalshi: { ticker: kalshi.ticker },
    polymarket: {
      slug: polymarket.slug,
      yesTokenId: polymarket.yesTokenId,
      noTokenId: polymarket.noTokenId
    }
  };
}

async function previewSelectedPair() {
  const pair = buildSelectedPair();
  if (!pair) return;
  const button = $("previewManualPair");
  button.disabled = true;
  $("status").textContent = "Previewing selected pair with read-only orderbooks...";
  try {
    const payload = await fetchPairPreview(pair);
    renderPairPreview(payload, "pairPreview", "Selected Pair Preview");
    state.selectedPairPreviewId = pair.id;
    $("status").textContent = "Pair preview loaded. Save as verified only if the mapping and economics make sense.";
  } catch (error) {
    state.selectedPairPreviewId = "";
    $("status").innerHTML = '<span class="warn">Preview failed: ' + html(error?.message || error) + '</span>';
  } finally {
    updateManualPairButtons();
  }
}

async function previewConfiguredPair(id) {
  const configuredPair = state.configPairs.find((item) => item.id === id);
  const reportPair = (state.data?.pairs || []).find((item) => item.id === id);
  const pair = configuredPair || reportPair;
  if (!pair) {
    $("status").textContent = "Pair is not in local configured pairs or the loaded scan report.";
    return;
  }
  $("status").textContent = configuredPair
    ? "Previewing configured pair with read-only orderbooks..."
    : "Previewing scan result pair with read-only orderbooks...";
  try {
    const payload = await fetchPairPreview(pair);
    renderPairPreview(payload, "configPairPreview", configuredPair ? "Configured Pair Preview" : "Scan Result Pair Preview");
    $("status").textContent = configuredPair
      ? "Configured pair preview loaded."
      : "Scan result pair preview loaded.";
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Configured preview failed: ' + html(error?.message || error) + '</span>';
  }
}

async function fetchPairPreview(pair) {
  const params = buildPricingParams();
  const response = await fetch("/api/preview-pair?" + params.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ pair })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

function renderPairPreview(payload, targetId, title) {
  const result = payload?.result || {};
  const opportunities = result.opportunities || [];
  const spreads = result.priceSpreads || [];
  const rejected = result.rejected || [];
  $(targetId).innerHTML = '<div class="preview-box"><h3>' + html(title) + '</h3>' +
    pairMarketLinks(payload?.pair) +
    table(["YES", "NO", "Net", "ROI", "Size", "Profit"], opportunities.map((item) => row([
      item.buyYesVenue + " @ " + price(item.yesLeg?.bestAsk),
      item.buyNoVenue + " @ " + price(item.noLeg?.bestAsk),
      Number(item.netCents).toFixed(2) + "c",
      Number(item.roiBps).toFixed(2) + " bps",
      Number(item.executableSize).toFixed(2),
      money(item.maxProfitDollars)
    ]))) +
    '<h3>Price Differences</h3>' +
    table(["Side", "Cheap", "Rich", "Diff"], spreads.map((item) => row([
      item.side,
      item.cheapVenue + " " + price(item.cheapPrice),
      item.richVenue + " " + price(item.richPrice),
      Number(item.diffCents).toFixed(2) + "c"
    ]))) +
    '<h3>Rejected</h3>' +
    table(["Pair", "Reason"], rejected.map((item) => row([item.pairId, item.reason]))) +
    '</div>';
}

async function previewVisibleResultPairs(kind, button) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const pairs = getExportableVisibleResultPairs(kind);
  const targetId = kind === "arbs" ? "arbResultPreview" : "spreadResultPreview";
  const label = kind === "arbs" ? "arb" : "spread";
  if (pairs.length === 0) {
    state.resultPreviews[kind] = [];
    state.resultPreviewGeneratedAt[kind] = 0;
    resetPreviewResultFilters(kind);
    $(targetId).innerHTML = "";
    $("status").textContent = kind === "arbs"
      ? "No visible arb result pairs to preview."
      : "No visible spread result pairs to preview.";
    return;
  }

  const previewPairs = pairs.slice(0, MAX_VISIBLE_RESULT_PREVIEWS);
  resetPreviewResultFilters(kind);
  button.disabled = true;
  $("status").textContent = "Previewing " + previewPairs.length + " visible " + label + " result pair(s) with read-only orderbooks...";
  const previews = [];
  for (const pair of previewPairs) {
    try {
      previews.push({ pair, payload: await fetchPairPreview(pair) });
    } catch (error) {
      previews.push({ pair, error: error?.message || String(error) });
    }
  }
  state.resultPreviews[kind] = previews;
  state.resultPreviewGeneratedAt[kind] = Date.now();
  button.disabled = false;
  renderVisibleResultPreviews(kind, previews, targetId);
  const failures = previews.filter((item) => item.error).length;
  const skipped = pairs.length - previewPairs.length;
  $("status").textContent = "Previewed " + previews.length + " visible " + label + " result pair(s)" +
    (failures > 0 ? "; " + failures + " failed" : "") +
    (skipped > 0 ? "; " + skipped + " skipped by preview cap. Use Top rows to narrow further." : ".");
}

function renderVisibleResultPreviews(kind, previews, targetId) {
  const title = kind === "arbs" ? "Visible Arb Result Preview" : "Visible Spread Result Preview";
  const label = kind === "arbs" ? "arb" : "spread";
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const quickViewCounts = previewQuickViewCounts(kind, previews, reviewContext);
  const summaryHtml = renderPreviewResultSummary(kind, previews);
  const visiblePreviews = sortPreviewResultRows(
    kind,
    previews.filter((item) => matchesPreviewResultFilters(kind, item, reviewContext)),
    reviewContext
  );
  const hasActivePreviewFilter = hasActivePreviewResultFilter(kind);
  const rows = visiblePreviews.map((item) => {
    const pairId = item.pair?.id;
    const rowIndex = previews.indexOf(item);
    const rowActions = [resultPairActions(pairId), removePreviewResultRowAction(kind, rowIndex)].filter(Boolean).join(" ");
    if (item.error) {
      return rowRaw([
        html(resultPreviewPairLabel(item.pair)),
        '<span class="warn">preview_failed</span>',
        html(resultPairStatus(pairId)),
        html(resultPairLocalState(pairId)),
        html(resultPairReviewLabel(pairId, reviewContext)),
        html(resultPairNote(pairId)),
        "",
        "",
        "",
        html(item.error),
        rowActions
      ]);
    }
    const result = item.payload?.result || {};
    const bestArb = bestOpportunity(result.opportunities || []);
    const bestSpread = bestPriceSpread(result.priceSpreads || []);
    const rejected = result.rejected || result.rejectedPairs || [];
    const status = previewResultStatus(item);
    return rowRaw([
      html(resultPreviewPairLabel(item.pair)),
      html(status),
      html(resultPairStatus(pairId)),
      html(resultPairLocalState(pairId)),
      html(resultPairReviewLabel(pairId, reviewContext)),
      html(resultPairNote(pairId)),
      bestArb ? html(Number(bestArb.netCents).toFixed(2) + "c") : "",
      bestArb ? html(money(bestArb.maxProfitDollars)) : "",
      bestSpread ? html(Number(bestSpread.diffCents).toFixed(2) + "c") : "",
      rejected.length > 0 ? html(rejected.map((entry) => entry.reason || "rejected").join("|")) : "",
      rowActions
    ]);
  });
  const filteredExportControlsHtml = hasActivePreviewFilter
    ? '<button type="button" data-export-filtered-preview-result-pairs-json="' + html(kind) + '">Export filtered preview ' + html(label) + ' pairs JSON</button>' +
      '<button type="button" data-export-saved-filtered-preview-result-pairs-json="' + html(kind) + '">Export saved filtered preview ' + html(label) + ' pairs JSON</button>' +
      '<button type="button" data-export-filtered-preview-result-review-csv="' + html(kind) + '">Export filtered preview ' + html(label) + ' review CSV</button>'
    : "";
  const filteredAddControlsHtml = hasActivePreviewFilter
    ? '<button type="button" data-add-filtered-preview-result-pairs="' + html(kind) + '">Add filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-add-verified-priority-filtered-preview-result-pairs="' + html(kind) + '">Add verified priority filtered preview ' + html(label) + ' pairs</button>'
    : "";
  const filteredSavedActionControlsHtml = hasActivePreviewFilter
    ? '<button type="button" data-star-filtered-preview-result-pairs="' + html(kind) + '">Star saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-unstar-filtered-preview-result-pairs="' + html(kind) + '">Unstar saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-verify-filtered-preview-result-pairs="' + html(kind) + '">Verify saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-unverify-filtered-preview-result-pairs="' + html(kind) + '">Unverify saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-pause-filtered-preview-result-pairs="' + html(kind) + '">Pause saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-resume-filtered-preview-result-pairs="' + html(kind) + '">Resume saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-select-filtered-preview-result-pairs="' + html(kind) + '">Select saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button type="button" data-scan-filtered-preview-result-pairs="' + html(kind) + '">Scan saved filtered preview ' + html(label) + ' pairs</button>' +
      '<button id="' + html(kind === "arbs" ? "startFilteredPreviewArbResultsWatch" : "startFilteredPreviewSpreadResultsWatch") + '" type="button" data-start-filtered-preview-result-watch="' + html(kind) + '">Start saved filtered preview ' + html(label) + ' watch</button>'
    : "";
  const filteredRefreshControlsHtml = hasActivePreviewFilter
    ? '<button type="button" data-refresh-filtered-preview-result-pairs="' + html(kind) + '">Refresh filtered preview ' + html(label) + ' rows</button>' +
      '<button type="button" data-retry-failed-filtered-preview-result-pairs="' + html(kind) + '">Retry failed filtered preview ' + html(label) + ' rows</button>' +
      '<button type="button" data-clear-filtered-preview-result-pairs="' + html(kind) + '">Clear filtered preview ' + html(label) + ' rows</button>'
    : "";
  const previewSortControlHtml = '<label class="scan-setting">Preview sort<select data-preview-result-sort="' + html(kind) + '">' +
    previewSortOptionHtml(kind, "preview_order", "Preview order") +
    previewSortOptionHtml(kind, "edge_desc", "Best edge desc") +
    previewSortOptionHtml(kind, "profit_desc", "Best profit desc") +
    previewSortOptionHtml(kind, "diff_desc", "Best diff desc") +
    previewSortOptionHtml(kind, "status", "Status") +
    previewSortOptionHtml(kind, "pair_status", "Pair status") +
    previewSortOptionHtml(kind, "local_state", "Local state") +
    previewSortOptionHtml(kind, "review", "Review") +
    previewSortOptionHtml(kind, "title", "Title") +
    '</select></label>';
  const previewSearchControlHtml = '<label class="scan-setting">Preview search<input type="search" data-preview-result-search="' + html(kind) + '" value="' + html(state.resultPreviewSearch[kind] || "") + '" placeholder="Search preview rows"></label>';
  const previewQuickViewControlsHtml = previewQuickViewButtonHtml(kind, "signal", "Signal view", quickViewCounts.signal) +
    previewQuickViewButtonHtml(kind, "saved_active", "Saved active", quickViewCounts.saved_active) +
    previewQuickViewButtonHtml(kind, "priority", "Priority view", quickViewCounts.priority) +
    previewQuickViewButtonHtml(kind, "needs_review", "Needs-review view", quickViewCounts.needs_review) +
    previewQuickViewButtonHtml(kind, "problems", "Problem view", quickViewCounts.problems) +
    '<button type="button" data-preview-quick-view-kind="' + html(kind) + '" data-preview-quick-view="reset">Reset preview view</button>';
  const previewControlHtml = '<div class="pair-filter-controls">' +
    previewSortControlHtml +
    previewSearchControlHtml +
    previewQuickViewControlsHtml +
    '<button type="button" data-add-preview-result-pairs="' + html(kind) + '">Add preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-add-verified-priority-preview-result-pairs="' + html(kind) + '">Add verified priority preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-add-signal-preview-result-pairs="' + html(kind) + '">Add signal preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-add-verified-priority-signal-preview-result-pairs="' + html(kind) + '">Add verified priority signal preview ' + html(label) + ' pairs</button>' +
    filteredAddControlsHtml +
    '<button type="button" data-star-preview-result-pairs="' + html(kind) + '">Star saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-unstar-preview-result-pairs="' + html(kind) + '">Unstar saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-verify-preview-result-pairs="' + html(kind) + '">Verify saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-unverify-preview-result-pairs="' + html(kind) + '">Unverify saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-pause-preview-result-pairs="' + html(kind) + '">Pause saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-resume-preview-result-pairs="' + html(kind) + '">Resume saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-select-preview-result-pairs="' + html(kind) + '">Select saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-select-signal-preview-result-pairs="' + html(kind) + '">Select saved signal preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-scan-preview-result-pairs="' + html(kind) + '">Scan saved preview ' + html(label) + ' pairs</button>' +
    '<button type="button" data-scan-signal-preview-result-pairs="' + html(kind) + '">Scan saved signal preview ' + html(label) + ' pairs</button>' +
    filteredSavedActionControlsHtml +
    '<button id="' + html(kind === "arbs" ? "startPreviewArbResultsWatch" : "startPreviewSpreadResultsWatch") + '" type="button" data-start-preview-result-watch="' + html(kind) + '">Start saved preview ' + html(label) + ' watch</button>' +
    '<button id="' + html(kind === "arbs" ? "startSignalPreviewArbResultsWatch" : "startSignalPreviewSpreadResultsWatch") + '" type="button" data-start-signal-preview-result-watch="' + html(kind) + '">Start saved signal preview ' + html(label) + ' watch</button>' +
    '<button type="button" data-export-preview-result-pairs-json="' + html(kind) + '">Export preview ' + html(label) + ' pairs JSON</button>' +
    '<button type="button" data-export-preview-result-review-csv="' + html(kind) + '">Export preview ' + html(label) + ' review CSV</button>' +
    '<button type="button" data-export-signal-preview-result-pairs-json="' + html(kind) + '">Export signal preview ' + html(label) + ' pairs JSON</button>' +
    '<button type="button" data-export-signal-preview-result-review-csv="' + html(kind) + '">Export signal preview ' + html(label) + ' review CSV</button>' +
    filteredExportControlsHtml +
    '<button type="button" data-export-saved-preview-result-pairs-json="' + html(kind) + '">Export saved preview ' + html(label) + ' pairs JSON</button>' +
    '<button type="button" data-export-saved-signal-preview-result-pairs-json="' + html(kind) + '">Export saved signal preview ' + html(label) + ' pairs JSON</button>' +
    filteredRefreshControlsHtml +
    '<button type="button" data-refresh-preview-result-pairs="' + html(kind) + '">Refresh preview ' + html(label) + ' rows</button>' +
    '<button type="button" data-retry-failed-preview-result-pairs="' + html(kind) + '">Retry failed preview ' + html(label) + ' rows</button>' +
    '<button type="button" data-clear-preview-result-pairs="' + html(kind) + '">Clear preview ' + html(label) + ' rows</button>' +
    '</div>';
  $(targetId).innerHTML = '<div class="preview-box"><h3>' + html(title) + '</h3>' +
    summaryHtml +
    previewControlHtml +
    table(["Pair", "Status", "Pair Status", "Local State", "Review", "Note", "Best Edge", "Best Profit", "Best Diff", "Rejected", "Action"], rows) +
    '</div>';
  updateWatchControls();
}

function renderPreviewResultSummary(kind, previews) {
  const previewRows = previews || [];
  if (previewRows.length === 0) return "";
  const generatedAt = Number(state.resultPreviewGeneratedAt[kind] || 0);
  const activeStatus = state.resultPreviewStatusFilter[kind] || "";
  const activePairStatus = state.resultPreviewPairStatusFilter[kind] || "";
  const activeLocalState = state.resultPreviewLocalStateFilter[kind] || "";
  const activeReview = state.resultPreviewReviewFilter[kind] || "";
  const activeProblem = Boolean(state.resultPreviewProblemOnly[kind]);
  const activeProblemReason = state.resultPreviewProblemReasonFilter[kind] || "";
  const activeSearch = state.resultPreviewSearch[kind] || "";
  const activeQuickView = currentPreviewQuickView(kind);
  const hasActiveFilter = hasActivePreviewResultFilter(kind);
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const visibleRows = previewRows.filter((item) => matchesPreviewResultFilters(kind, item, reviewContext));
  const visibleMetrics = summarizeVisiblePreviewMetrics(visibleRows);

  const previewStatusCounts = new Map();
  const pairStatusCounts = new Map();
  const localStateCounts = new Map();
  const reviewCounts = new Map();
  const problemReasonCounts = new Map();
  previewRows.forEach((item) => {
    const pairId = item?.pair?.id;
    incrementPreviewSummaryCount(previewStatusCounts, previewResultStatus(item));
    incrementPreviewSummaryCount(pairStatusCounts, resultPairStatus(pairId));
    resultPairLocalStateFilterValues(pairId).forEach((stateName) => {
      incrementPreviewSummaryCount(localStateCounts, stateName);
    });
    incrementPreviewSummaryCount(reviewCounts, resultPairReviewLabel(pairId, reviewContext));
    previewProblemReasons(item).forEach((reason) => {
      incrementPreviewSummaryCount(problemReasonCounts, reason);
    });
  });

  const signalCount = Number(previewStatusCounts.get("arb") || 0) + Number(previewStatusCounts.get("spread") || 0);
  const problemCount = Number(previewStatusCounts.get("preview_failed") || 0) + Number(previewStatusCounts.get("rejected") || 0);
  const chips = [
    '<span>Preview rows: ' + html(previewRows.length) + '</span>',
    hasActiveFilter ? '<span>Visible preview rows: ' + html(visibleRows.length) + '</span>' : "",
    '<span>Signal rows: ' + html(signalCount) + '</span>',
    '<span>Problem rows: ' + html(problemCount) + '</span>',
    visibleMetrics.bestEdgeCents !== null ? '<span>Visible preview best edge: ' + html(Number(visibleMetrics.bestEdgeCents).toFixed(2)) + 'c</span>' : "",
    visibleMetrics.bestProfitDollars !== null ? '<span>Visible preview best profit: ' + html(money(visibleMetrics.bestProfitDollars)) + '</span>' : "",
    visibleMetrics.bestDiffCents !== null ? '<span>Visible preview best diff: ' + html(Number(visibleMetrics.bestDiffCents).toFixed(2)) + 'c</span>' : "",
    generatedAt > 0 ? '<span>Previewed at: ' + html(new Date(generatedAt).toLocaleTimeString()) + '</span>' : "",
    activeStatus ? '<span>Preview status filter: ' + html(activeStatus) + '</span>' : "",
    activePairStatus ? '<span>Preview pair filter: ' + html(activePairStatus) + '</span>' : "",
    activeLocalState ? '<span>Preview local filter: ' + html(activeLocalState) + '</span>' : "",
    activeReview ? '<span>Preview review filter: ' + html(activeReview) + '</span>' : "",
    activeProblem ? '<span>Preview problem filter: failed/rejected</span>' : "",
    activeProblemReason ? '<span>Preview problem reason: ' + html(activeProblemReason) + '</span>' : "",
    activeSearch ? '<span>Preview search: ' + html(activeSearch) + '</span>' : "",
    activeQuickView ? '<span>Preview quick view: ' + html(previewQuickViewLabel(activeQuickView)) + '</span>' : "",
    state.previewResultSort[kind] !== "preview_order" ? '<span>Preview sort: ' + html(previewSortLabel(kind)) + '</span>' : "",
    hasActiveFilter ? '<button type="button" data-clear-preview-result-filters="' + html(kind) + '">Clear preview filters</button>' : "",
    ...renderPreviewStatusFilterButtons(kind, previewStatusCounts),
    ...renderPreviewPairStatusFilterButtons(kind, pairStatusCounts),
    ...renderPreviewLocalStateFilterButtons(kind, localStateCounts),
    ...renderPreviewReviewFilterButtons(kind, reviewCounts),
    ...renderPreviewProblemReasonFilterButtons(kind, problemReasonCounts)
  ];
  return '<div class="pair-summary">' + chips.filter(Boolean).join("") + '</div>';
}

function previewSortOptionHtml(kind, value, label) {
  return '<option value="' + html(value) + '"' + (state.previewResultSort[kind] === value ? " selected" : "") + '>' + html(label) + '</option>';
}

function previewQuickViewButtonHtml(kind, value, label, count) {
  const active = currentPreviewQuickView(kind) === value;
  const countLabel = Number.isFinite(Number(count)) ? " (" + Number(count) + ")" : "";
  return '<button type="button" data-preview-quick-view-kind="' + html(kind) + '" data-preview-quick-view="' + html(value) + '" aria-pressed="' + html(active ? "true" : "false") + '"' + (active ? ' class="active"' : "") + '>' + html(label + countLabel) + '</button>';
}

function previewSortLabel(kind) {
  const labels = {
    preview_order: "Preview order",
    edge_desc: "Best edge desc",
    profit_desc: "Best profit desc",
    diff_desc: "Best diff desc",
    status: "Status",
    pair_status: "Pair status",
    local_state: "Local state",
    review: "Review",
    title: "Title"
  };
  return labels[state.previewResultSort[kind]] || labels.preview_order;
}

function renderPreviewStatusFilterButtons(kind, counts) {
  const active = state.resultPreviewStatusFilter[kind] || "";
  const clearButton = active
    ? '<button type="button" data-clear-preview-status-filter="' + html(kind) + '">All preview statuses</button>'
    : "";
  const statusButtons = Array.from(counts.entries())
    .sort((left, right) => Number(right[1]) - Number(left[1]) || compareText(left[0], right[0]))
    .slice(0, 8)
    .map(([name, count]) =>
      '<button type="button" data-preview-status-filter-kind="' + html(kind) + '" data-preview-status-filter="' + html(name) + '"' + (name === active ? " disabled" : "") + '>Status ' + html(name) + ': ' + html(count) + '</button>'
  );
  return [clearButton, ...statusButtons].filter(Boolean);
}

function renderPreviewPairStatusFilterButtons(kind, counts) {
  const active = state.resultPreviewPairStatusFilter[kind] || "";
  const clearButton = active
    ? '<button type="button" data-clear-preview-pair-status-filter="' + html(kind) + '">All preview pair statuses</button>'
    : "";
  const statusButtons = Array.from(counts.entries())
    .sort((left, right) => Number(right[1]) - Number(left[1]) || compareText(left[0], right[0]))
    .slice(0, 8)
    .map(([name, count]) =>
      '<button type="button" data-preview-pair-status-filter-kind="' + html(kind) + '" data-preview-pair-status-filter="' + html(name) + '"' + (name === active ? " disabled" : "") + '>Pair ' + html(name) + ': ' + html(count) + '</button>'
    );
  return [clearButton, ...statusButtons].filter(Boolean);
}

function renderPreviewLocalStateFilterButtons(kind, counts) {
  const active = state.resultPreviewLocalStateFilter[kind] || "";
  const clearButton = active
    ? '<button type="button" data-clear-preview-local-state-filter="' + html(kind) + '">All preview local states</button>'
    : "";
  const stateButtons = Array.from(counts.entries())
    .sort((left, right) => Number(right[1]) - Number(left[1]) || compareText(left[0], right[0]))
    .slice(0, 8)
    .map(([name, count]) =>
      '<button type="button" data-preview-local-state-filter-kind="' + html(kind) + '" data-preview-local-state-filter="' + html(name) + '"' + (name === active ? " disabled" : "") + '>Local ' + html(name) + ': ' + html(count) + '</button>'
    );
  return [clearButton, ...stateButtons].filter(Boolean);
}

function renderPreviewReviewFilterButtons(kind, counts) {
  const active = state.resultPreviewReviewFilter[kind] || "";
  const clearButton = active
    ? '<button type="button" data-clear-preview-review-filter="' + html(kind) + '">All preview reviews</button>'
    : "";
  const reviewButtons = Array.from(counts.entries())
    .sort((left, right) => Number(right[1]) - Number(left[1]) || compareText(left[0], right[0]))
    .slice(0, 8)
    .map(([name, count]) =>
      '<button type="button" data-preview-review-filter-kind="' + html(kind) + '" data-preview-review-filter="' + html(name) + '"' + (name === active ? " disabled" : "") + '>Review ' + html(name) + ': ' + html(count) + '</button>'
    );
  return [clearButton, ...reviewButtons].filter(Boolean);
}

function renderPreviewProblemReasonFilterButtons(kind, counts) {
  const active = state.resultPreviewProblemReasonFilter[kind] || "";
  const clearButton = active
    ? '<button type="button" data-clear-preview-problem-reason-filter="' + html(kind) + '">All preview problem reasons</button>'
    : "";
  const reasonButtons = Array.from(counts.entries())
    .sort((left, right) => Number(right[1]) - Number(left[1]) || compareText(left[0], right[0]))
    .slice(0, 8)
    .map(([name, count]) =>
      '<button type="button" data-preview-problem-reason-filter-kind="' + html(kind) + '" data-preview-problem-reason-filter="' + html(name) + '"' + (name === active ? " disabled" : "") + '>Problem reason ' + html(name) + ': ' + html(count) + '</button>'
    );
  return [clearButton, ...reasonButtons].filter(Boolean);
}

function renderPreviewSummaryCountSpans(prefix, counts) {
  return Array.from(counts.entries())
    .sort((left, right) => Number(right[1]) - Number(left[1]) || compareText(left[0], right[0]))
    .slice(0, 8)
    .map(([name, count]) => '<span>' + html(prefix) + ' ' + html(name) + ': ' + html(count) + '</span>');
}

function incrementPreviewSummaryCount(counts, key) {
  const value = String(key || "unknown");
  counts.set(value, (counts.get(value) || 0) + 1);
}

function resultPreviewPairLabel(pair) {
  return [pair?.title, pair?.outcomeLabel].filter(Boolean).join(" / ") || pair?.id || "unknown_pair";
}

async function deleteConfiguredPair(id) {
  if (!id) return;
  $("status").textContent = "Removing local pair config...";
  renderConfiguredPairs(await removeConfiguredPair(id));
  $("status").textContent = "Pair removed locally.";
}

async function removeConfiguredPair(id) {
  const response = await fetch("/api/pairs?id=" + encodeURIComponent(id), {
    method: "DELETE",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function toggleConfiguredPair(id, enabled) {
  if (!id) return;
  $("status").textContent = enabled ? "Resuming local pair..." : "Pausing local pair...";
  renderConfiguredPairs(await setConfiguredPairEnabled(id, enabled));
  $("status").textContent = enabled
    ? "Pair resumed locally. It will be included in configured-pair scans."
    : "Pair paused locally. It will be skipped by configured-pair scans.";
}

async function toggleConfiguredPairPriority(id, priority) {
  if (!id) return;
  $("status").textContent = priority ? "Adding pair to priority watchlist..." : "Removing pair from priority watchlist...";
  renderConfiguredPairs(await setConfiguredPairPriority(id, priority));
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = priority
    ? "Pair added to priority watchlist."
    : "Pair removed from priority watchlist.";
}

async function toggleConfiguredPairVerified(id, verified) {
  if (!id) return;
  $("status").textContent = verified ? "Marking pair as manually verified..." : "Removing manual verification...";
  renderConfiguredPairs(await setConfiguredPairVerified(id, verified));
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = verified
    ? "Pair marked as manually verified."
    : "Pair manual verification removed.";
}

async function editConfiguredPairNote(id) {
  const pair = state.configPairs.find((item) => item.id === id);
  if (!pair) {
    $("status").textContent = "Pair is not in the local configured watchlist.";
    return;
  }

  const nextNote = window.prompt("Pair note", pair.note || "");
  if (nextNote === null) {
    $("status").textContent = "Note edit canceled.";
    return;
  }
  await saveConfiguredPairNote(id, nextNote);
}

async function clearConfiguredPairNote(id) {
  await saveConfiguredPairNote(id, "");
}

async function saveConfiguredPairNote(id, note) {
  $("status").textContent = note.trim() ? "Saving pair note..." : "Clearing pair note...";
  renderConfiguredPairs(await setConfiguredPairNote(id, note));
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = note.trim() ? "Pair note saved locally." : "Pair note cleared locally.";
}

async function setConfiguredPairEnabled(id, enabled) {
  const response = await fetch("/api/pairs?id=" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ enabled })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function setConfiguredPairPriority(id, priority) {
  const response = await fetch("/api/pairs/priority?id=" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ priority })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function setConfiguredPairVerified(id, verified) {
  const response = await fetch("/api/pairs/verified?id=" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ verified })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function setConfiguredPairsEnabled(ids, enabled) {
  const response = await fetch("/api/pairs/bulk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ ids, enabled })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function setConfiguredPairNote(id, note) {
  const response = await fetch("/api/pairs/note?id=" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ note })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function setConfiguredPairsPriority(ids, priority) {
  const response = await fetch("/api/pairs/priority/bulk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ ids, priority })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function setConfiguredPairsVerified(ids, verified) {
  const response = await fetch("/api/pairs/verified/bulk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ ids, verified })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function bulkSetSelectedPairsEnabled(enabled) {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }
  $("status").textContent = enabled ? "Resuming selected pairs..." : "Pausing selected pairs...";
  const latestConfig = await setConfiguredPairsEnabled(ids, enabled);
  state.selectedConfigPairIds = [];
  renderConfiguredPairs(latestConfig);
  $("status").textContent = enabled
    ? "Selected pairs resumed locally."
    : "Selected pairs paused locally.";
}

async function bulkSetSelectedPairsPriority(priority) {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  $("status").textContent = priority ? "Starring selected pairs..." : "Unstarring selected pairs...";
  const latestConfig = await setConfiguredPairsPriority(ids, priority);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = priority
    ? "Selected pairs added to priority watchlist."
    : "Selected pairs removed from priority watchlist.";
}

async function bulkSetSelectedPairsVerified(verified) {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  $("status").textContent = verified ? "Verifying selected pairs..." : "Unverifying selected pairs...";
  const latestConfig = await setConfiguredPairsVerified(ids, verified);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = verified
    ? "Selected pairs marked as manually verified."
    : "Selected pair verification removed.";
}

async function editSelectedPairNotes() {
  if (state.selectedConfigPairIds.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  const nextNote = window.prompt("Selected pair note", "");
  if (nextNote === null) {
    $("status").textContent = "Selected note edit canceled.";
    return;
  }
  await saveSelectedPairNotes(nextNote);
}

async function clearSelectedPairNotes() {
  if (state.selectedConfigPairIds.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  const confirmed = window.confirm("Clear notes from " + state.selectedConfigPairIds.length + " selected pair(s)?");
  if (!confirmed) {
    $("status").textContent = "Clear selected notes canceled.";
    return;
  }
  await saveSelectedPairNotes("");
}

async function saveSelectedPairNotes(note) {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  const trimmed = String(note || "").trim();
  $("status").textContent = trimmed ? "Saving selected pair notes..." : "Clearing selected pair notes...";
  let latestConfig = null;
  for (const id of ids) {
    latestConfig = await setConfiguredPairNote(id, note);
  }
  if (latestConfig) {
    renderConfiguredPairs(latestConfig);
  }
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = trimmed
    ? "Selected pair notes saved locally."
    : "Selected pair notes cleared locally.";
}

async function bulkSetVisiblePairsEnabled(enabled) {
  const visibleIds = getVisibleConfigPairIds();
  const ids = visibleIds.filter((id) =>
    state.configPairs.some((pair) =>
      pair.id === id && (enabled ? pair.enabled === false : pair.enabled !== false)
    )
  );

  if (ids.length === 0) {
    $("status").textContent = enabled
      ? "No paused visible pairs to resume."
      : "No active visible pairs to pause.";
    return;
  }

  $("status").textContent = enabled ? "Resuming visible pairs..." : "Pausing visible pairs...";
  const latestConfig = await setConfiguredPairsEnabled(ids, enabled);
  if (!enabled) {
    state.selectedConfigPairIds = state.selectedConfigPairIds.filter((id) => !ids.includes(id));
  }
  renderConfiguredPairs(latestConfig);
  $("status").textContent = enabled
    ? "Visible pairs resumed locally."
    : "Visible pairs paused locally.";
}

async function bulkSetVisiblePairsPriority(priority) {
  const visibleIds = getVisibleConfigPairIds();
  const ids = visibleIds.filter((id) =>
    state.configPairs.some((pair) =>
      pair.id === id && (priority ? pair.priority !== true : pair.priority === true)
    )
  );

  if (ids.length === 0) {
    $("status").textContent = priority
      ? "No visible pairs to add to priority watchlist."
      : "No visible priority pairs to unstar.";
    return;
  }

  $("status").textContent = priority ? "Starring visible pairs..." : "Unstarring visible pairs...";
  const latestConfig = await setConfiguredPairsPriority(ids, priority);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = priority
    ? "Visible pairs added to priority watchlist."
    : "Visible pairs removed from priority watchlist.";
}

async function bulkSetVisiblePairsVerified(verified) {
  const visibleIds = getVisibleConfigPairIds();
  const ids = visibleIds.filter((id) =>
    state.configPairs.some((pair) =>
      pair.id === id && (verified ? pair.verified !== true : pair.verified === true)
    )
  );

  if (ids.length === 0) {
    $("status").textContent = verified
      ? "No visible pairs to mark as manually verified."
      : "No visible verified pairs to unverify.";
    return;
  }

  $("status").textContent = verified ? "Verifying visible pairs..." : "Unverifying visible pairs...";
  const latestConfig = await setConfiguredPairsVerified(ids, verified);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = verified
    ? "Visible pairs marked as manually verified."
    : "Visible pair verification removed.";
}

async function pauseVisibleRejectedPairs() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const rejectedIds = [...new Set(getVisibleRejectedPairs(state.data)
    .map((item) => item.pairId)
    .filter((id) => id))];
  const activeRejectedIds = rejectedIds.filter((id) =>
    state.configPairs.some((pair) => pair.id === id && pair.enabled !== false)
  );

  if (activeRejectedIds.length === 0) {
    $("status").textContent = "No active visible rejected pairs to pause.";
    return;
  }

  $("status").textContent = "Pausing visible rejected pairs...";
  const latestConfig = await setConfiguredPairsEnabled(activeRejectedIds, false);
  renderConfiguredPairs(latestConfig);
  $("status").textContent = "Paused " + activeRejectedIds.length + " visible rejected pair(s).";
}

async function removeSelectedPairs() {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  const confirmed = window.confirm("Remove " + ids.length + " selected local pair config(s)?");
  if (!confirmed) {
    $("status").textContent = "Remove selected canceled.";
    return;
  }

  $("status").textContent = "Removing selected local pair configs...";
  let latestConfig = null;
  for (const id of ids) {
    latestConfig = await removeConfiguredPair(id);
  }
  state.selectedConfigPairIds = [];
  if (latestConfig) {
    renderConfiguredPairs(latestConfig);
  }
  $("status").textContent = "Removed " + ids.length + " selected pair config(s) locally.";
}

async function pauseNeedsReviewPairs() {
  const reviewContext = buildConfiguredPairReviewContext(state.configPairs);
  const ids = state.configPairs
    .filter((pair) => pair.enabled !== false && getConfiguredPairReview(pair, reviewContext).status !== "ok")
    .map((pair) => pair.id)
    .filter((id) => id);

  if (ids.length === 0) {
    $("status").textContent = "No active needs-review pairs to pause.";
    return;
  }

  $("status").textContent = "Pausing needs-review pairs...";
  const latestConfig = await setConfiguredPairsEnabled(ids, false);
  state.selectedConfigPairIds = state.selectedConfigPairIds.filter((id) => !ids.includes(id));
  renderConfiguredPairs(latestConfig);
  $("status").textContent = "Paused " + ids.length + " needs-review pair(s) locally.";
}

async function pauseLastRejectedPairs() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getLastRejectedConfigPairs()
    .filter((pair) => pair.enabled !== false)
    .map((pair) => pair.id)
    .filter((id) => id);

  if (ids.length === 0) {
    $("status").textContent = "No active last-rejected pairs to pause.";
    return;
  }

  $("status").textContent = "Pausing last-rejected pairs...";
  const latestConfig = await setConfiguredPairsEnabled(ids, false);
  state.selectedConfigPairIds = state.selectedConfigPairIds.filter((id) => !ids.includes(id));
  renderConfiguredPairs(latestConfig);
  $("status").textContent = "Paused " + ids.length + " last-rejected pair(s) locally.";
}

async function loadLatest() {
  const [response] = await Promise.all([
    fetch("/api/latest", { cache: "no-store" }),
    loadLiveFeed(),
    loadDiscoveryReview()
  ]);
  await loadPairs();
  render(await response.json());
  renderPairBuilder();
}

async function loadLiveFeed() {
  const response = await fetch("/api/live-feed", { cache: "no-store" });
  state.liveFeed = await response.json();
}

async function loadPairs() {
  const response = await fetch("/api/pairs", { cache: "no-store" });
  renderConfiguredPairs(await response.json());
}

async function loadDiscoveryReview() {
  const response = await fetch("/api/discovery-review", { cache: "no-store" });
  state.discoveryReview = await response.json();
  renderDiscoveryReview(state.discoveryReview);
}

function renderDiscoveryReview(queue) {
  const entries = queue?.entries || [];
  const visibleEntries = entries
    .filter((entry) => entry.status !== "ignored")
    .filter((entry) => matches([
      entry.candidate?.kalshiTicker,
      entry.candidate?.kalshiTitle,
      entry.candidate?.polymarketSlug,
      entry.candidate?.polymarketQuestion,
      entry.candidate?.matchReason,
      entry.status
    ].join(" ")))
    .slice(0, 50);

  $("discoveryReviewSummary").innerHTML = [
    "<span>Total: " + html(queue?.summary?.total || 0) + "</span>",
    "<span>New: " + html(queue?.summary?.new || 0) + "</span>",
    "<span>Reviewed: " + html(queue?.summary?.reviewed || 0) + "</span>",
    "<span>Saved: " + html(queue?.summary?.saved || 0) + "</span>",
    "<span>Ignored: " + html(queue?.summary?.ignored || 0) + "</span>",
    "<span>Visible: " + html(visibleEntries.length) + "</span>"
  ].join("");
  $("discoveryReview").innerHTML = visibleEntries.length === 0
    ? '<p class="empty">No discovery review candidates.</p>'
    : '<div class="table-wrap"><table><thead><tr><th>Status</th><th>Kalshi</th><th>Polymarket</th><th>Score</th><th>Reason</th><th>Action</th></tr></thead><tbody>' +
      visibleEntries.map((entry) => renderDiscoveryReviewRow(entry)).join("") +
      "</tbody></table></div>";
  renderSimpleDiscoveryReview(queue);
}

function renderSimpleDiscoveryReview(queue) {
  const entries = getVisibleSimpleDiscoveryEntries(queue);
  const summary = queue?.summary || {};
  $("simpleDiscoveryStats").innerHTML = [
    "<strong>" + html(summary.total || 0) + " candidates</strong>",
    "<span>New " + html(summary.new || 0) + "</span>",
    "<span>Reviewed " + html(summary.reviewed || 0) + "</span>",
    "<span>Saved " + html(summary.saved || 0) + "</span>",
    "<span>Visible " + html(entries.length) + "</span>",
    "<span>Paper-only review queue</span>"
  ].join("");
  $("simpleDiscoveryReview").innerHTML = entries.length === 0
    ? '<p class="empty">No pair-discovery candidates in the current filter. Run Discover candidates to refresh the review queue.</p>'
    : '<div class="opportunity-table-wrap"><table class="opportunity-table review-table"><thead><tr><th>Status</th><th>Pair</th><th>Score</th><th>Action</th><th>Reason</th></tr></thead><tbody>' +
      entries.map((entry) => renderSimpleDiscoveryReviewRow(entry)).join("") +
      "</tbody></table></div>";
}

function getVisibleSimpleDiscoveryEntries(queue) {
  const statusFilter = state.simpleDiscoveryStatusFilter || "open";
  return (queue?.entries || [])
    .filter((entry) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "open") return entry.status !== "ignored" && entry.status !== "saved";
      return entry.status === statusFilter;
    })
    .filter((entry) => matches([
      entry.candidate?.kalshiTicker,
      entry.candidate?.kalshiTitle,
      entry.candidate?.polymarketSlug,
      entry.candidate?.polymarketQuestion,
      entry.candidate?.matchReason,
      entry.candidate?.status,
      entry.status
    ].join(" ")))
    .sort((left, right) =>
      simpleDiscoveryReviewStatusRank(left.status) - simpleDiscoveryReviewStatusRank(right.status) ||
      Number(right.candidate?.matchScore || 0) - Number(left.candidate?.matchScore || 0)
    )
    .slice(0, 12);
}

function simpleDiscoveryReviewStatusRank(status) {
  switch (status) {
    case "new":
      return 0;
    case "reviewed":
      return 1;
    case "saved":
      return 2;
    case "ignored":
      return 3;
    default:
      return 4;
  }
}

function renderSimpleDiscoveryReviewRow(entry) {
  const candidate = entry.candidate || {};
  return '<tr><td>' + html(entry.status) + '</td>' +
    '<td><div class="review-pair"><div><span class="venue-name">Kalshi</span><br>' + kalshiMarketLink(candidate.kalshiTicker) + '<br><span class="event-title">' + html(candidate.kalshiTitle || "") + '</span></div><div><span class="venue-name">Polymarket</span><br>' + polymarketMarketLink(candidate.polymarketSlug) + '<br>' + html(candidate.polymarketQuestion || "") + '</div></div></td>' +
    '<td><span class="roi-cell">' + html(Number(candidate.matchScore || 0).toFixed(3)) + '</span><br><small>' + html(candidate.status || "") + '</small></td>' +
    '<td class="action-cell">' +
      '<button type="button" data-preview-review-candidate="' + html(entry.id) + '">Preview</button>' +
      '<button type="button" data-save-review-candidate="' + html(entry.id) + '">Save</button>' +
      '<button type="button" data-mark-review-candidate="' + html(entry.id) + '" data-review-status="reviewed">Reviewed</button>' +
      '<button type="button" data-mark-review-candidate="' + html(entry.id) + '" data-review-status="ignored">Ignore</button>' +
    '</td>' +
    '<td><span class="review-reason">' + html(candidate.matchReason || "") + '</span><br><span class="outcome-pill">' + html(candidate.outcomeLabel || "YES") + '</span></td></tr>';
}

function renderDiscoveryReviewRow(entry) {
  const candidate = entry.candidate || {};
  return '<tr><td>' + html(entry.status) + '</td>' +
    '<td>' + kalshiMarketLink(candidate.kalshiTicker) + '<br>' + html(candidate.kalshiTitle || "") + '<br><small>' + html(candidate.outcomeLabel || "") + '</small></td>' +
    '<td>' + polymarketMarketLink(candidate.polymarketSlug) + '<br>' + html(candidate.polymarketQuestion || "") + '</td>' +
    '<td>' + html(Number(candidate.matchScore || 0).toFixed(3)) + '</td>' +
    '<td>' + html(candidate.matchReason || "") + '<br><small>' + html(candidate.status || "") + '</small></td>' +
    '<td>' +
      '<button type="button" data-preview-review-candidate="' + html(entry.id) + '">Preview</button> ' +
      '<button type="button" data-save-review-candidate="' + html(entry.id) + '">Save verified</button> ' +
      '<button type="button" data-mark-review-candidate="' + html(entry.id) + '" data-review-status="reviewed">Reviewed</button> ' +
      '<button type="button" data-mark-review-candidate="' + html(entry.id) + '" data-review-status="ignored">Ignore</button>' +
    '</td></tr>';
}

async function runDiscoveryReview() {
  $("status").textContent = "Discovering review candidates from read-only APIs...";
  const params = new URLSearchParams();
  appendNumberParam(params, "gammaLimit", $("discoveryGammaLimit").value);
  appendNumberParam(params, "minMatchScore", $("discoveryMinMatchScore").value);
  appendListParam(params, "kalshiEvents", $("discoveryKalshiEvents").value);
  appendListParam(params, "kalshiSeries", $("discoveryKalshiSeries").value);
  appendListParam(params, "gammaSearch", $("discoveryGammaSearch").value);
  const response = await fetch("/api/discovery-review/discover?" + params.toString(), {
    method: "POST",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json();
  state.discoveryReview = payload.review;
  renderDiscoveryReview(state.discoveryReview);
  $("status").textContent =
    "Discovery review updated: " +
    Number(payload.discoveryResult?.candidatePreview?.length || 0) +
    " candidate preview row(s), " +
    Number(payload.discoveryResult?.pairs?.length || 0) +
    " clear match(es).";
}

function appendListParam(params, key, value) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item);
  if (items.length > 0) {
    params.set(key, [...new Set(items)].join(","));
  }
}

function getDiscoveryReviewEntry(id) {
  return (state.discoveryReview?.entries || []).find((entry) => entry.id === id);
}

async function previewDiscoveryReviewCandidate(id) {
  const entry = getDiscoveryReviewEntry(id);
  if (!entry) return;
  $("status").textContent = "Previewing discovery review candidate with read-only orderbooks...";
  const payload = await fetchPairPreview(buildPairFromCandidate(entry.candidate));
  renderPairPreview(payload, "simpleDiscoveryReviewPreview", "Discovery Review Preview");
  renderPairPreview(payload, "discoveryReviewPreview", "Discovery Review Preview");
  $("status").textContent = "Discovery review preview loaded.";
}

async function markDiscoveryReviewCandidate(id, status) {
  const response = await fetch("/api/discovery-review?id=" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ status })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  state.discoveryReview = await response.json();
  renderDiscoveryReview(state.discoveryReview);
  $("status").textContent = "Discovery candidate marked " + status + ".";
}

async function saveDiscoveryReviewCandidate(id) {
  const response = await fetch("/api/discovery-review/save?id=" + encodeURIComponent(id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ verified: true, priority: true })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json();
  renderConfiguredPairs(payload.pairs);
  state.discoveryReview = payload.review;
  renderDiscoveryReview(state.discoveryReview);
  $("status").textContent = "Discovery candidate saved as verified priority pair.";
}

async function runScan(autoDiscover, button, mode, endpoint, extraParams) {
  if (state.scanInFlight) {
    $("status").textContent = "Scan skipped: previous scan still running.";
    return false;
  }
  state.scanInFlight = true;
  button.disabled = true;
  updateWatchControls();
  $("status").textContent = "Scanning read-only APIs...";
  try {
    const params = buildPricingParams();
    params.set("autoDiscover", autoDiscover ? "true" : "false");
    if (extraParams) {
      extraParams.forEach((value, key) => {
        params.append(key, value);
      });
    }
    const response = await fetch((endpoint || "/api/scan") + "?" + params.toString(), { method: "POST", cache: "no-store" });
    const data = await response.json();
    await loadLiveFeed();
    render(data);
    recordScanHistory(data, mode);
    if (Number(data.summary?.opportunities || 0) > 0) {
      $("status").textContent = "Arbitrage candidates found: " + data.summary.opportunities;
    }
    maybeNotifyArbs(data, mode);
    return true;
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Scan failed: ' + html(error?.message || error) + '</span>';
    return false;
  } finally {
    button.disabled = false;
    state.scanInFlight = false;
    updateWatchControls();
  }
}

function buildPricingParams() {
  const params = new URLSearchParams();
  appendNumberParam(params, "minNetCents", $("minNetCents").value);
  appendNumberParam(params, "kalshiFeeCents", $("kalshiFeeCents").value);
  appendNumberParam(params, "polymarketFeeCents", $("polymarketFeeCents").value);
  return params;
}

function appendNumberParam(params, key, value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    params.set(key, String(parsed));
  }
}

async function refreshScan() {
  await runScan($("autoDiscover").checked, $("refresh"), $("autoDiscover").checked ? "auto-discovery" : "manual");
}

async function scanConfiguredPairs() {
  $("autoDiscover").checked = false;
  saveDashboardSettings();
  await runScan(false, $("scanConfigured"), "configured");
}

async function scanReadyPairs() {
  $("autoDiscover").checked = false;
  saveDashboardSettings();
  await runScan(false, $("scanReady"), "ready", "/api/scan-ready");
}

async function scanSelectedPairs() {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  await runScan(false, $("scanSelectedPairs"), "selected", "/api/scan-selected", params);
}

async function scanConfiguredPair(id, button) {
  if (!state.configPairs.some((pair) => pair.id === id)) {
    $("status").textContent = "Pair is not in the local configured watchlist.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  params.append("id", id);
  await runScan(false, button, "single-pair", "/api/scan-selected", params);
}

async function scanVisiblePairs() {
  const ids = getVisibleConfigPairIds();
  if (ids.length === 0) {
    $("status").textContent = "No visible configured pairs to scan.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  await runScan(false, $("scanVisiblePairs"), "visible", "/api/scan-selected", params);
}

function getPriorityConfigPairIds() {
  return state.configPairs
    .filter((pair) => pair.enabled !== false && pair.priority === true)
    .map((pair) => pair.id)
    .filter((id) => id);
}

function getVerifiedConfigPairIds() {
  return state.configPairs
    .filter((pair) => pair.enabled !== false && pair.verified === true)
    .map((pair) => pair.id)
    .filter((id) => id);
}

async function scanPriorityPairs() {
  const ids = getPriorityConfigPairIds();
  if (ids.length === 0) {
    $("status").textContent = "No active priority configured pairs to scan.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  await runScan(false, $("scanPriorityPairs"), "priority", "/api/scan-selected", params);
}

async function scanVerifiedPairs() {
  const ids = getVerifiedConfigPairIds();
  if (ids.length === 0) {
    $("status").textContent = "No active verified configured pairs to scan.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  await runScan(false, $("scanVerifiedPairs"), "verified", "/api/scan-selected", params);
}

async function scanLastRejectedPairs() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getLastRejectedConfigPairs()
    .map((pair) => pair.id)
    .filter((id) => id);

  if (ids.length === 0) {
    $("status").textContent = "No last-rejected configured pairs to scan.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  await runScan(false, $("scanLastRejectedPairs"), "last-rejected", "/api/scan-selected", params);
}

function startWatch() {
  startWatchMode({
    buttonId: "startWatch",
    endpoint: "/api/scan",
    label: "Configured-pair watch",
    mode: "watch"
  });
}

function startReadyWatch() {
  startWatchMode({
    buttonId: "startReadyWatch",
    endpoint: "/api/scan-ready",
    label: "Ready-pair watch",
    mode: "ready-watch"
  });
}

function startSelectedWatch() {
  const ids = [...state.selectedConfigPairIds];
  if (ids.length === 0) {
    $("status").textContent = "No configured pairs selected.";
    return;
  }

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  startWatchMode({
    buttonId: "startSelectedWatch",
    endpoint: "/api/scan-selected",
    extraParams: params,
    label: "Selected-pair watch (" + ids.length + ")",
    mode: "selected-watch"
  });
}

function startPriorityWatch() {
  const ids = getPriorityConfigPairIds();
  if (ids.length === 0) {
    $("status").textContent = "No active priority configured pairs to watch.";
    return;
  }

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  startWatchMode({
    buttonId: "startPriorityWatch",
    endpoint: "/api/scan-selected",
    extraParams: params,
    label: "Priority-pair watch (" + ids.length + ")",
    mode: "priority-watch"
  });
}

function startVerifiedWatch() {
  const ids = getVerifiedConfigPairIds();
  if (ids.length === 0) {
    $("status").textContent = "No active verified configured pairs to watch.";
    return;
  }

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  startWatchMode({
    buttonId: "startVerifiedWatch",
    endpoint: "/api/scan-selected",
    extraParams: params,
    label: "Verified-pair watch (" + ids.length + ")",
    mode: "verified-watch"
  });
}

function startVisibleWatch() {
  const ids = getVisibleConfigPairIds();
  if (ids.length === 0) {
    $("status").textContent = "No visible configured pairs to watch.";
    return;
  }

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  startWatchMode({
    buttonId: "startVisibleWatch",
    endpoint: "/api/scan-selected",
    extraParams: params,
    label: "Visible-pair watch (" + ids.length + ")",
    mode: "visible-watch"
  });
}

function startVisibleResultWatch(kind) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getSavedVisibleResultPairIds(kind);
  if (ids.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No saved visible arb result pairs to watch. Use Add visible arbs first."
      : "No saved visible spread result pairs to watch. Use Add visible spreads first.";
    return;
  }

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  startWatchMode({
    buttonId: kind === "arbs" ? "startVisibleArbResultsWatch" : "startVisibleSpreadResultsWatch",
    endpoint: "/api/scan-selected",
    extraParams: params,
    label: (kind === "arbs" ? "Visible arb-result watch" : "Visible spread-result watch") + " (" + ids.length + ")",
    mode: kind === "arbs" ? "visible-arb-results-watch" : "visible-spread-results-watch"
  });
}

function startLastRejectedWatch() {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getLastRejectedConfigPairs()
    .map((pair) => pair.id)
    .filter((id) => id);

  if (ids.length === 0) {
    $("status").textContent = "No last-rejected configured pairs to watch.";
    return;
  }

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  startWatchMode({
    buttonId: "startLastRejectedWatch",
    endpoint: "/api/scan-selected",
    extraParams: params,
    label: "Last-rejected watch (" + ids.length + ")",
    mode: "last-rejected-watch"
  });
}

function startWatchMode(options) {
  if (state.watchTimer !== null) return;
  $("autoDiscover").checked = false;
  saveDashboardSettings();
  state.watchButtonId = options.buttonId;
  state.watchEndpoint = options.endpoint;
  state.watchLabel = options.label;
  state.watchMode = options.mode;
  state.watchParams = options.extraParams || null;
  const intervalMs = getWatchIntervalMs();
  state.watchTimer = setInterval(() => {
    runWatchTick();
  }, intervalMs);
  updateWatchStatus(state.watchLabel + " running. Waiting for first scan.");
  updateWatchControls();
  runWatchTick();
}

function stopWatch() {
  const label = state.watchLabel;
  if (state.watchTimer !== null) {
    clearInterval(state.watchTimer);
    state.watchTimer = null;
  }
  $("status").textContent = label + " stopped.";
  updateWatchStatus("Watch stopped.");
  updateWatchControls();
}

function runWatchTick() {
  $("autoDiscover").checked = false;
  saveDashboardSettings();
  runScan(false, $(state.watchButtonId), state.watchMode, state.watchEndpoint, state.watchParams).then((ran) => {
    if (ran) {
      const opportunities = Number(state.data?.summary?.opportunities || 0);
      const spreads = Number(state.data?.summary?.priceSpreads || 0);
      const rejected = Number(state.data?.summary?.rejectedPairs || 0);
      const timestamp = new Date().toLocaleTimeString();
      updateWatchStatus("Last watch scan " + timestamp + " | mode=" + state.watchMode + " | arbs=" + opportunities + " | spreads=" + spreads + " | rejected=" + rejected);
      if (opportunities === 0) {
        $("status").textContent = state.watchLabel + " refreshed at " + timestamp;
      }
    }
  });
}

function updateWatchStatus(message) {
  $("watchStatus").textContent = message;
}

function updateWatchControls() {
  const running = state.watchTimer !== null;
  $("simpleRefresh").disabled = state.scanInFlight;
  $("simpleScanConfigured").disabled = running || state.scanInFlight;
  $("simpleStartWatch").disabled = running || state.scanInFlight;
  $("simpleStopWatch").disabled = !running;
  $("startWatch").disabled = running || state.scanInFlight;
  $("startReadyWatch").disabled = running || state.scanInFlight;
  $("startVisibleWatch").disabled = running || state.scanInFlight;
  $("startSelectedWatch").disabled = running || state.scanInFlight;
  $("startPriorityWatch").disabled = running || state.scanInFlight;
  $("startVerifiedWatch").disabled = running || state.scanInFlight;
  $("startLastRejectedWatch").disabled = running || state.scanInFlight;
  $("startVisibleArbResultsWatch").disabled = running || state.scanInFlight;
  $("startVisibleSpreadResultsWatch").disabled = running || state.scanInFlight;
  setOptionalDisabled("startPreviewArbResultsWatch", running || state.scanInFlight);
  setOptionalDisabled("startPreviewSpreadResultsWatch", running || state.scanInFlight);
  setOptionalDisabled("startSignalPreviewArbResultsWatch", running || state.scanInFlight);
  setOptionalDisabled("startSignalPreviewSpreadResultsWatch", running || state.scanInFlight);
  setOptionalDisabled("startFilteredPreviewArbResultsWatch", running || state.scanInFlight);
  setOptionalDisabled("startFilteredPreviewSpreadResultsWatch", running || state.scanInFlight);
  $("stopWatch").disabled = !running;
  $("watchIntervalSeconds").disabled = running;
}

function setOptionalDisabled(id, disabled) {
  const element = $(id);
  if (element) {
    element.disabled = disabled;
  }
}

function getWatchIntervalMs() {
  const seconds = Number($("watchIntervalSeconds").value);
  const safeSeconds = Number.isFinite(seconds) && seconds >= 5 ? seconds : 30;
  return safeSeconds * 1000;
}

async function addCandidatePair(key, verified) {
  const candidate = (state.data?.discoveryResult?.candidatePreview || [])
    .find((item) => candidateKey(item) === key);
  if (!candidate) return;
  const pair = { ...buildPairFromCandidate(candidate), verified: Boolean(verified) };
  $("status").textContent = verified ? "Saving verified local pair config..." : "Saving local pair config...";
  const response = await fetch("/api/pairs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pair })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  renderConfiguredPairs(await response.json());
  $("status").textContent = verified
    ? "Pair saved locally as manually verified. Use Scan verified or Start verified watch to monitor it."
    : "Pair saved locally. Use Scan configured pairs to evaluate saved mappings.";
}

async function addReportPair(id, verified, priority) {
  const pair = (state.data?.pairs || []).find((item) => item.id === id);
  if (!pair) {
    $("status").textContent = "Pair is not available in the loaded scan report.";
    return;
  }

  const nextPair = { ...pair, priority: Boolean(priority), verified: Boolean(verified) };
  $("status").textContent = verified && priority
    ? "Saving scan result pair as verified priority..."
    : verified
      ? "Saving scan result pair as manually verified..."
      : priority
        ? "Saving scan result pair as priority..."
    : "Saving scan result pair to local watchlist...";
  const response = await fetch("/api/pairs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ pair: nextPair })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  renderConfiguredPairs(await response.json());
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = verified && priority
    ? "Scan result pair saved as verified priority. Use Scan verified or Start priority watch to monitor it."
    : verified
      ? "Scan result pair saved as manually verified. Use Scan verified or Start verified watch to monitor it."
      : priority
        ? "Scan result pair saved as priority. Use Scan priority or Start priority watch to monitor it."
    : "Scan result pair saved locally. Use Scan configured pairs or Start watch to monitor it.";
}

function getVisibleResultPairIds(kind) {
  if (!state.data || state.data.status === "missing") return [];
  const rows = kind === "arbs"
    ? getVisibleArbs(state.data)
    : getVisiblePriceSpreads(state.data);
  return [...new Set(rows.map((item) => item.pairId).filter((id) => id))];
}

function getSavedVisibleResultPairIds(kind) {
  const configuredIds = new Set(state.configPairs.map((pair) => pair.id));
  return getVisibleResultPairIds(kind).filter((id) => configuredIds.has(id));
}

function getExportableVisibleResultPairs(kind) {
  const reportPairs = state.data?.pairs || [];
  return getVisibleResultPairIds(kind)
    .map((id) =>
      state.configPairs.find((pair) => pair.id === id)
      || reportPairs.find((pair) => pair.id === id)
    )
    .filter((pair) => pair);
}

function getPreviewResultPairs(kind) {
  return (state.resultPreviews[kind] || [])
    .filter((item) => item?.pair && !item.error)
    .map((item) => item.pair);
}

function getSignalPreviewResultPairs(kind) {
  return (state.resultPreviews[kind] || [])
    .filter((item) => item?.pair && !item.error && ["arb", "spread"].includes(previewResultStatus(item)))
    .map((item) => item.pair);
}

function getSavedPreviewResultPairIds(kind) {
  const configuredIds = new Set(state.configPairs.map((pair) => pair.id));
  return getPreviewResultPairs(kind)
    .map((pair) => pair.id)
    .filter((id) => configuredIds.has(id));
}

function getSavedSignalPreviewResultPairIds(kind) {
  const configuredIds = new Set(state.configPairs.map((pair) => pair.id));
  return getSignalPreviewResultPairs(kind)
    .map((pair) => pair.id)
    .filter((id) => configuredIds.has(id));
}

function getSavedFilteredPreviewResultPairIds(kind) {
  const configuredIds = new Set(state.configPairs.map((pair) => pair.id));
  return getFilteredPreviewResultPairs(kind)
    .map((pair) => pair.id)
    .filter((id) => configuredIds.has(id));
}

function refreshPreviewResultPanel(kind) {
  const previews = state.resultPreviews[kind] || [];
  if (previews.length === 0) return;
  renderVisibleResultPreviews(
    kind,
    previews,
    kind === "arbs" ? "arbResultPreview" : "spreadResultPreview"
  );
}

async function refreshPreviewResultPairs(kind, button, filteredOnly = false) {
  const currentPreviews = state.resultPreviews[kind] || [];
  const entries = filteredOnly
    ? getFilteredPreviewResultEntries(kind)
    : currentPreviews
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item?.pair);
  const label = kind === "arbs" ? "arb" : "spread";
  const targetId = kind === "arbs" ? "arbResultPreview" : "spreadResultPreview";
  if (entries.length === 0) {
    $("status").textContent = filteredOnly
      ? "No filtered preview " + label + " row(s) to refresh."
      : "No preview " + label + " row(s) to refresh.";
    return;
  }

  button.disabled = true;
  $("status").textContent = filteredOnly
    ? "Refreshing " + entries.length + " filtered preview " + label + " row(s) with read-only orderbooks..."
    : "Refreshing " + entries.length + " preview " + label + " row(s) with read-only orderbooks...";
  const previews = filteredOnly ? currentPreviews.slice() : [];
  let failures = 0;
  try {
    for (const entry of entries) {
      const pair = entry.item.pair;
      try {
        const refreshed = { pair, payload: await fetchPairPreview(pair) };
        if (filteredOnly) {
          previews[entry.index] = refreshed;
        } else {
          previews.push(refreshed);
        }
      } catch (error) {
        failures += 1;
        const failed = { pair, error: error?.message || String(error) };
        if (filteredOnly) {
          previews[entry.index] = failed;
        } else {
          previews.push(failed);
        }
      }
    }
    state.resultPreviews[kind] = previews;
    state.resultPreviewGeneratedAt[kind] = Date.now();
    renderVisibleResultPreviews(kind, previews, targetId);
    $("status").textContent = filteredOnly
      ? "Refreshed " + entries.length + " filtered preview " + label + " row(s)" + (failures > 0 ? "; " + failures + " failed." : ".")
      : "Refreshed " + previews.length + " preview " + label + " row(s)" + (failures > 0 ? "; " + failures + " failed." : ".");
  } finally {
    button.disabled = false;
  }
}

async function retryFailedPreviewResultPairs(kind, button, filteredOnly = false) {
  const currentPreviews = state.resultPreviews[kind] || [];
  const candidateEntries = filteredOnly
    ? getFilteredPreviewResultEntries(kind)
    : currentPreviews.map((item, index) => ({ item, index }));
  const failedEntries = candidateEntries
    .filter((entry) => entry.item?.pair && entry.item?.error);
  const label = kind === "arbs" ? "arb" : "spread";
  const targetId = kind === "arbs" ? "arbResultPreview" : "spreadResultPreview";
  if (failedEntries.length === 0) {
    $("status").textContent = filteredOnly
      ? "No failed filtered preview " + label + " row(s) to retry."
      : "No failed preview " + label + " row(s) to retry.";
    return;
  }

  button.disabled = true;
  $("status").textContent = filteredOnly
    ? "Retrying " + failedEntries.length + " failed filtered preview " + label + " row(s) with read-only orderbooks..."
    : "Retrying " + failedEntries.length + " failed preview " + label + " row(s) with read-only orderbooks...";
  const nextPreviews = currentPreviews.slice();
  try {
    for (const entry of failedEntries) {
      const pair = entry.item.pair;
      try {
        nextPreviews[entry.index] = { pair, payload: await fetchPairPreview(pair) };
      } catch (error) {
        nextPreviews[entry.index] = { pair, error: error?.message || String(error) };
      }
    }
    state.resultPreviews[kind] = nextPreviews;
    state.resultPreviewGeneratedAt[kind] = Date.now();
    renderVisibleResultPreviews(kind, nextPreviews, targetId);
    const remainingFailures = filteredOnly
      ? getFilteredPreviewResultEntries(kind).filter((entry) => entry.item?.error).length
      : nextPreviews.filter((item) => item?.error).length;
    $("status").textContent = filteredOnly
      ? "Retried " + failedEntries.length + " failed filtered preview " + label + " row(s)" + (remainingFailures > 0 ? "; " + remainingFailures + " still failed." : ".")
      : "Retried " + failedEntries.length + " failed preview " + label + " row(s)" + (remainingFailures > 0 ? "; " + remainingFailures + " still failed." : ".");
  } finally {
    button.disabled = false;
  }
}

function clearPreviewResultPairs(kind) {
  state.resultPreviews[kind] = [];
  state.resultPreviewGeneratedAt[kind] = 0;
  resetPreviewResultFilters(kind);
  $(kind === "arbs" ? "arbResultPreview" : "spreadResultPreview").innerHTML = "";
  $("status").textContent = kind === "arbs"
    ? "Preview arb rows cleared."
    : "Preview spread rows cleared.";
}

function clearFilteredPreviewResultPairs(kind) {
  const currentPreviews = state.resultPreviews[kind] || [];
  const entries = getFilteredPreviewResultEntries(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  const targetId = kind === "arbs" ? "arbResultPreview" : "spreadResultPreview";
  if (!hasActivePreviewResultFilter(kind)) {
    $("status").textContent = "No active preview " + label + " filters. Use Clear preview rows to clear all.";
    return;
  }
  if (entries.length === 0) {
    $("status").textContent = "No filtered preview " + label + " row(s) to clear.";
    return;
  }

  const removeIndexes = new Set(entries.map((entry) => entry.index));
  const nextPreviews = currentPreviews.filter((_item, index) => !removeIndexes.has(index));
  state.resultPreviews[kind] = nextPreviews;
  if (nextPreviews.length === 0) {
    state.resultPreviewGeneratedAt[kind] = 0;
    resetPreviewResultFilters(kind);
    $(targetId).innerHTML = "";
    $("status").textContent = "Cleared " + entries.length + " filtered preview " + label + " row(s); preview is empty.";
    return;
  }

  renderVisibleResultPreviews(kind, nextPreviews, targetId);
  $("status").textContent = "Cleared " + entries.length + " filtered preview " + label + " row(s); " + nextPreviews.length + " preview row(s) remain.";
}

function removePreviewResultRow(kind, indexValue) {
  if (kind !== "arbs" && kind !== "spreads") return;
  const index = typeof indexValue === "string" && indexValue.trim() !== "" ? Number(indexValue) : NaN;
  const currentPreviews = state.resultPreviews[kind] || [];
  const label = kind === "arbs" ? "arb" : "spread";
  const targetId = kind === "arbs" ? "arbResultPreview" : "spreadResultPreview";
  if (!Number.isInteger(index) || index < 0 || index >= currentPreviews.length) {
    $("status").textContent = "Preview " + label + " row is no longer available.";
    return;
  }

  const nextPreviews = currentPreviews.filter((_item, itemIndex) => itemIndex !== index);
  state.resultPreviews[kind] = nextPreviews;
  if (nextPreviews.length === 0) {
    state.resultPreviewGeneratedAt[kind] = 0;
    resetPreviewResultFilters(kind);
    $(targetId).innerHTML = "";
    $("status").textContent = "Removed preview " + label + " row; preview is empty.";
    return;
  }

  renderVisibleResultPreviews(kind, nextPreviews, targetId);
  $("status").textContent = "Removed preview " + label + " row; " + nextPreviews.length + " preview row(s) remain.";
}

function selectPreviewResultPairs(kind, signalOnly = false, filteredOnly = false) {
  const ids = filteredOnly
    ? getSavedFilteredPreviewResultPairIds(kind)
    : signalOnly ? getSavedSignalPreviewResultPairIds(kind) : getSavedPreviewResultPairIds(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  if (ids.length === 0) {
    $("status").textContent = filteredOnly
      ? "No saved filtered preview " + label + " pair(s) to select. Add filtered preview pairs first."
      : signalOnly
        ? "No saved signal preview " + label + " pair(s) to select. Add signal preview pairs first."
        : "No saved preview " + label + " pair(s) to select. Add preview pairs first.";
    return;
  }

  const next = new Set(state.selectedConfigPairIds);
  ids.forEach((id) => next.add(id));
  state.selectedConfigPairIds = Array.from(next).sort();
  renderConfiguredPairs({ pairs: state.configPairs });
  $("status").textContent = filteredOnly
    ? "Selected " + ids.length + " saved filtered preview " + label + " pair(s)."
    : signalOnly
      ? "Selected " + ids.length + " saved signal preview " + label + " pair(s)."
      : "Selected " + ids.length + " saved preview " + label + " pair(s).";
}

async function scanPreviewResultPairs(kind, button, signalOnly = false, filteredOnly = false) {
  const ids = filteredOnly
    ? getSavedFilteredPreviewResultPairIds(kind)
    : signalOnly ? getSavedSignalPreviewResultPairIds(kind) : getSavedPreviewResultPairIds(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  if (ids.length === 0) {
    $("status").textContent = filteredOnly
      ? "No saved filtered preview " + label + " pair(s) to scan. Add filtered preview pairs first."
      : signalOnly
        ? "No saved signal preview " + label + " pair(s) to scan. Add signal preview pairs first."
        : "No saved preview " + label + " pair(s) to scan. Add preview pairs first.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  const mode = filteredOnly
    ? kind === "arbs" ? "filtered-preview-arb-results" : "filtered-preview-spread-results"
    : signalOnly
      ? kind === "arbs" ? "signal-preview-arb-results" : "signal-preview-spread-results"
      : kind === "arbs" ? "preview-arb-results" : "preview-spread-results";
  await runScan(false, button, mode, "/api/scan-selected", params);
}

function startPreviewResultWatch(kind, signalOnly = false, filteredOnly = false) {
  const ids = filteredOnly
    ? getSavedFilteredPreviewResultPairIds(kind)
    : signalOnly ? getSavedSignalPreviewResultPairIds(kind) : getSavedPreviewResultPairIds(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  if (ids.length === 0) {
    $("status").textContent = filteredOnly
      ? "No saved filtered preview " + label + " pair(s) to watch. Add filtered preview pairs first."
      : signalOnly
        ? "No saved signal preview " + label + " pair(s) to watch. Add signal preview pairs first."
        : "No saved preview " + label + " pair(s) to watch. Add preview pairs first.";
    return;
  }

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  startWatchMode({
    buttonId: filteredOnly
      ? kind === "arbs" ? "startFilteredPreviewArbResultsWatch" : "startFilteredPreviewSpreadResultsWatch"
      : signalOnly
        ? kind === "arbs" ? "startSignalPreviewArbResultsWatch" : "startSignalPreviewSpreadResultsWatch"
        : kind === "arbs" ? "startPreviewArbResultsWatch" : "startPreviewSpreadResultsWatch",
    endpoint: "/api/scan-selected",
    extraParams: params,
    label: filteredOnly
      ? (kind === "arbs" ? "Filtered preview arb-result watch" : "Filtered preview spread-result watch") + " (" + ids.length + ")"
      : signalOnly
        ? (kind === "arbs" ? "Signal preview arb-result watch" : "Signal preview spread-result watch") + " (" + ids.length + ")"
        : (kind === "arbs" ? "Preview arb-result watch" : "Preview spread-result watch") + " (" + ids.length + ")",
    mode: filteredOnly
      ? kind === "arbs" ? "filtered-preview-arb-results-watch" : "filtered-preview-spread-results-watch"
      : signalOnly
        ? kind === "arbs" ? "signal-preview-arb-results-watch" : "signal-preview-spread-results-watch"
        : kind === "arbs" ? "preview-arb-results-watch" : "preview-spread-results-watch"
  });
}

async function setPreviewResultPairsPriority(kind, priority, filteredOnly = false) {
  const sourceIds = filteredOnly ? getSavedFilteredPreviewResultPairIds(kind) : getSavedPreviewResultPairIds(kind);
  const ids = sourceIds.filter((id) =>
    state.configPairs.some((pair) =>
      pair.id === id && (priority ? pair.priority !== true : pair.priority === true)
    )
  );
  const label = kind === "arbs" ? "arb" : "spread";
  if (ids.length === 0) {
    $("status").textContent = filteredOnly
      ? priority
        ? "No saved filtered preview " + label + " pair(s) to star. Add filtered preview pairs first."
        : "No starred saved filtered preview " + label + " pair(s) to unstar."
      : priority
        ? "No saved preview " + label + " pair(s) to star. Add preview pairs first."
        : "No starred saved preview " + label + " pair(s) to unstar.";
    return;
  }

  $("status").textContent = filteredOnly
    ? priority
      ? "Starring saved filtered preview " + label + " pairs..."
      : "Unstarring saved filtered preview " + label + " pairs..."
    : priority
      ? "Starring saved preview " + label + " pairs..."
      : "Unstarring saved preview " + label + " pairs...";
  const latestConfig = await setConfiguredPairsPriority(ids, priority);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  refreshPreviewResultPanel(kind);
  $("status").textContent = filteredOnly
    ? priority
      ? "Starred " + ids.length + " saved filtered preview " + label + " pair(s)."
      : "Unstarred " + ids.length + " saved filtered preview " + label + " pair(s)."
    : priority
      ? "Starred " + ids.length + " saved preview " + label + " pair(s)."
      : "Unstarred " + ids.length + " saved preview " + label + " pair(s).";
}

async function setPreviewResultPairsVerified(kind, verified, filteredOnly = false) {
  const sourceIds = filteredOnly ? getSavedFilteredPreviewResultPairIds(kind) : getSavedPreviewResultPairIds(kind);
  const ids = sourceIds.filter((id) =>
    state.configPairs.some((pair) =>
      pair.id === id && (verified ? pair.verified !== true : pair.verified === true)
    )
  );
  const label = kind === "arbs" ? "arb" : "spread";
  if (ids.length === 0) {
    $("status").textContent = filteredOnly
      ? verified
        ? "No unverified saved filtered preview " + label + " pair(s) to verify. Add filtered preview pairs first."
        : "No verified saved filtered preview " + label + " pair(s) to unverify."
      : verified
        ? "No unverified saved preview " + label + " pair(s) to verify. Add preview pairs first."
        : "No verified saved preview " + label + " pair(s) to unverify.";
    return;
  }

  $("status").textContent = filteredOnly
    ? verified
      ? "Verifying saved filtered preview " + label + " pairs..."
      : "Unverifying saved filtered preview " + label + " pairs..."
    : verified
      ? "Verifying saved preview " + label + " pairs..."
      : "Unverifying saved preview " + label + " pairs...";
  const latestConfig = await setConfiguredPairsVerified(ids, verified);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  refreshPreviewResultPanel(kind);
  $("status").textContent = filteredOnly
    ? verified
      ? "Verified " + ids.length + " saved filtered preview " + label + " pair(s)."
      : "Unverified " + ids.length + " saved filtered preview " + label + " pair(s)."
    : verified
      ? "Verified " + ids.length + " saved preview " + label + " pair(s)."
      : "Unverified " + ids.length + " saved preview " + label + " pair(s).";
}

async function setPreviewResultPairsEnabled(kind, enabled, filteredOnly = false) {
  const sourceIds = filteredOnly ? getSavedFilteredPreviewResultPairIds(kind) : getSavedPreviewResultPairIds(kind);
  const ids = sourceIds.filter((id) =>
    state.configPairs.some((pair) =>
      pair.id === id && (enabled ? pair.enabled === false : pair.enabled !== false)
    )
  );
  const label = kind === "arbs" ? "arb" : "spread";
  if (ids.length === 0) {
    $("status").textContent = filteredOnly
      ? enabled
        ? "No paused saved filtered preview " + label + " pair(s) to resume."
        : "No active saved filtered preview " + label + " pair(s) to pause. Add filtered preview pairs first."
      : enabled
        ? "No paused saved preview " + label + " pair(s) to resume."
        : "No active saved preview " + label + " pair(s) to pause. Add preview pairs first.";
    return;
  }

  $("status").textContent = filteredOnly
    ? enabled
      ? "Resuming saved filtered preview " + label + " pairs..."
      : "Pausing saved filtered preview " + label + " pairs..."
    : enabled
      ? "Resuming saved preview " + label + " pairs..."
      : "Pausing saved preview " + label + " pairs...";
  const latestConfig = await setConfiguredPairsEnabled(ids, enabled);
  if (!enabled) {
    state.selectedConfigPairIds = state.selectedConfigPairIds.filter((id) => !ids.includes(id));
  }
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  refreshPreviewResultPanel(kind);
  $("status").textContent = filteredOnly
    ? enabled
      ? "Resumed " + ids.length + " saved filtered preview " + label + " pair(s)."
      : "Paused " + ids.length + " saved filtered preview " + label + " pair(s)."
    : enabled
      ? "Resumed " + ids.length + " saved preview " + label + " pair(s)."
      : "Paused " + ids.length + " saved preview " + label + " pair(s).";
}

async function addPreviewResultPairs(kind, priority, verified, signalOnly = false, filteredOnly = false) {
  const pairs = filteredOnly
    ? getFilteredPreviewResultPairs(kind)
    : signalOnly ? getSignalPreviewResultPairs(kind) : getPreviewResultPairs(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  if (pairs.length === 0) {
    $("status").textContent = filteredOnly
      ? "No successful filtered preview " + label + " pair(s) to add."
      : signalOnly
      ? "No current-signal preview " + label + " pair(s) to add."
      : "No successful preview " + label + " pair(s) to add.";
    return;
  }

  $("status").textContent = verified && priority
    ? filteredOnly
      ? "Saving, verifying, and starring filtered preview result pairs..."
      : signalOnly
      ? "Saving, verifying, and starring current-signal preview result pairs..."
      : "Saving, verifying, and starring preview result pairs..."
    : verified
      ? filteredOnly
        ? "Saving and verifying filtered preview result pairs..."
        : signalOnly
        ? "Saving and verifying current-signal preview result pairs..."
        : "Saving and verifying preview result pairs..."
      : priority
        ? filteredOnly
          ? "Saving and starring filtered preview result pairs..."
          : signalOnly
          ? "Saving and starring current-signal preview result pairs..."
          : "Saving and starring preview result pairs..."
        : filteredOnly
          ? "Saving filtered preview result pairs..."
          : signalOnly
          ? "Saving current-signal preview result pairs..."
          : "Saving preview result pairs...";

  const configuredIds = new Set(state.configPairs.map((pair) => pair.id));
  let latestConfig = null;
  let addedCount = 0;
  for (const pair of pairs) {
    if (configuredIds.has(pair.id)) {
      continue;
    }
    const response = await fetch("/api/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ pair: { ...pair, priority: Boolean(priority), verified: Boolean(verified) } })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    latestConfig = await response.json();
    configuredIds.add(pair.id);
    addedCount += 1;
  }

  if (verified) {
    latestConfig = await setConfiguredPairsVerified(pairs.map((pair) => pair.id), true);
  }
  if (latestConfig) {
    renderConfiguredPairs(latestConfig);
  }
  if (priority) {
    const latestPriorityConfig = await setConfiguredPairsPriority(pairs.map((pair) => pair.id), true);
    renderConfiguredPairs(latestPriorityConfig);
  }
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  refreshPreviewResultPanel(kind);

  const newPreviewLabel = filteredOnly ? "new filtered preview " : signalOnly ? "new signal preview " : "new preview ";
  const savedPreviewLabel = filteredOnly ? "filtered preview " : signalOnly ? "signal preview " : "preview ";
  const allExistingPreviewLabel = filteredOnly ? "All filtered preview " : signalOnly ? "All current-signal preview " : "All preview ";
  $("status").textContent = verified && priority
    ? "Saved " + addedCount + " " + newPreviewLabel + label + " pair(s), marked " + pairs.length + " total as manually verified, and starred " + pairs.length + " total."
    : verified
      ? "Saved " + addedCount + " " + newPreviewLabel + label + " pair(s) and marked " + pairs.length + " total as manually verified."
      : priority
        ? "Saved " + addedCount + " " + newPreviewLabel + label + " pair(s) and starred " + pairs.length + " total."
        : addedCount > 0
          ? "Saved " + addedCount + " " + savedPreviewLabel + label + " pair(s) locally."
          : allExistingPreviewLabel + label + " pair(s) were already saved locally.";
}

function selectVisibleResultPairs(kind) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getVisibleResultPairIds(kind);
  const savedIds = getSavedVisibleResultPairIds(kind);
  const label = kind === "arbs" ? "arb" : "spread";
  if (savedIds.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No saved visible arb result pairs to select. Use Add visible arbs first."
      : "No saved visible spread result pairs to select. Use Add visible spreads first.";
    return;
  }

  const next = new Set(state.selectedConfigPairIds);
  savedIds.forEach((id) => next.add(id));
  state.selectedConfigPairIds = Array.from(next).sort();
  renderConfiguredPairs({ pairs: state.configPairs });
  const skipped = ids.length - savedIds.length;
  $("status").textContent = "Selected " + savedIds.length + " saved visible " + label + " pair(s)" +
    (skipped > 0 ? "; " + skipped + " unsaved result pair(s) skipped." : ".");
}

async function scanVisibleResultPairs(kind, button) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getSavedVisibleResultPairIds(kind);
  if (ids.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No saved visible arb result pairs to scan. Use Add visible arbs first."
      : "No saved visible spread result pairs to scan. Use Add visible spreads first.";
    return;
  }

  $("autoDiscover").checked = false;
  saveDashboardSettings();
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  await runScan(false, button, kind === "arbs" ? "visible-arb-results" : "visible-spread-results", "/api/scan-selected", params);
}

async function pauseVisibleResultPairs(kind) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getSavedVisibleResultPairIds(kind).filter((id) =>
    state.configPairs.some((pair) => pair.id === id && pair.enabled !== false)
  );
  if (ids.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No active saved visible arb result pairs to pause. Use Add visible arbs first."
      : "No active saved visible spread result pairs to pause. Use Add visible spreads first.";
    return;
  }

  $("status").textContent = kind === "arbs"
    ? "Pausing visible arb result pairs..."
    : "Pausing visible spread result pairs...";
  const latestConfig = await setConfiguredPairsEnabled(ids, false);
  state.selectedConfigPairIds = state.selectedConfigPairIds.filter((id) => !ids.includes(id));
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = kind === "arbs"
    ? "Paused " + ids.length + " visible arb result pair(s)."
    : "Paused " + ids.length + " visible spread result pair(s).";
}

async function resumeVisibleResultPairs(kind) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getSavedVisibleResultPairIds(kind).filter((id) =>
    state.configPairs.some((pair) => pair.id === id && pair.enabled === false)
  );
  if (ids.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No paused saved visible arb result pairs to resume. Use Add visible arbs first."
      : "No paused saved visible spread result pairs to resume. Use Add visible spreads first.";
    return;
  }

  $("status").textContent = kind === "arbs"
    ? "Resuming visible arb result pairs..."
    : "Resuming visible spread result pairs...";
  const latestConfig = await setConfiguredPairsEnabled(ids, true);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = kind === "arbs"
    ? "Resumed " + ids.length + " visible arb result pair(s)."
    : "Resumed " + ids.length + " visible spread result pair(s).";
}

async function setVisibleResultPairsVerified(kind, verified) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getSavedVisibleResultPairIds(kind).filter((id) =>
    state.configPairs.some((pair) =>
      pair.id === id && (verified ? pair.verified !== true : pair.verified === true)
    )
  );
  if (ids.length === 0) {
    $("status").textContent = kind === "arbs"
      ? verified
        ? "No unverified saved visible arb result pairs to verify. Use Add visible arbs first for new rows."
        : "No verified saved visible arb result pairs to unverify."
      : verified
        ? "No unverified saved visible spread result pairs to verify. Use Add visible spreads first for new rows."
        : "No verified saved visible spread result pairs to unverify.";
    return;
  }

  $("status").textContent = kind === "arbs"
    ? verified
      ? "Verifying visible arb result pairs..."
      : "Unverifying visible arb result pairs..."
    : verified
      ? "Verifying visible spread result pairs..."
      : "Unverifying visible spread result pairs...";
  const latestConfig = await setConfiguredPairsVerified(ids, verified);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = kind === "arbs"
    ? verified
      ? "Verified " + ids.length + " visible arb result pair(s)."
      : "Unverified " + ids.length + " visible arb result pair(s)."
    : verified
      ? "Verified " + ids.length + " visible spread result pair(s)."
      : "Unverified " + ids.length + " visible spread result pair(s).";
}

async function unstarVisibleResultPairs(kind) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getSavedVisibleResultPairIds(kind).filter((id) =>
    state.configPairs.some((pair) => pair.id === id && pair.priority === true)
  );
  if (ids.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No starred saved visible arb result pairs to unstar."
      : "No starred saved visible spread result pairs to unstar.";
    return;
  }

  $("status").textContent = kind === "arbs"
    ? "Unstarring visible arb result pairs..."
    : "Unstarring visible spread result pairs...";
  const latestConfig = await setConfiguredPairsPriority(ids, false);
  renderConfiguredPairs(latestConfig);
  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }
  $("status").textContent = kind === "arbs"
    ? "Unstarred " + ids.length + " visible arb result pair(s)."
    : "Unstarred " + ids.length + " visible spread result pair(s).";
}

async function addVisibleResultPairs(kind, priority, verified) {
  if (!state.data || state.data.status === "missing") {
    $("status").textContent = "No scan report loaded.";
    return;
  }

  const ids = getVisibleResultPairIds(kind);
  if (ids.length === 0) {
    $("status").textContent = kind === "arbs"
      ? "No visible arb result pairs to add."
      : "No visible spread result pairs to add.";
    return;
  }

  const reportPairs = ids
    .map((id) => (state.data?.pairs || []).find((pair) => pair.id === id))
    .filter((pair) => pair);

  if (reportPairs.length === 0) {
    $("status").textContent = "Visible result pairs are not available in the loaded scan report.";
    return;
  }

  $("status").textContent = verified && priority
    ? "Saving, verifying, and starring visible result pairs..."
    : verified
      ? "Saving and verifying visible result pairs..."
      : priority
        ? "Saving and starring visible result pairs..."
        : "Saving visible result pairs...";

  const configuredIds = new Set(state.configPairs.map((pair) => pair.id));
  let latestConfig = null;
  let addedCount = 0;

  for (const pair of reportPairs) {
    if (configuredIds.has(pair.id)) {
      continue;
    }
    const response = await fetch("/api/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ pair: { ...pair, priority: Boolean(priority), verified: Boolean(verified) } })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    latestConfig = await response.json();
    configuredIds.add(pair.id);
    addedCount += 1;
  }

  if (verified) {
    latestConfig = await setConfiguredPairsVerified(reportPairs.map((pair) => pair.id), true);
  }

  if (latestConfig) {
    renderConfiguredPairs(latestConfig);
  }

  if (priority) {
    const latestPriorityConfig = await setConfiguredPairsPriority(reportPairs.map((pair) => pair.id), true);
    renderConfiguredPairs(latestPriorityConfig);
  }

  if (state.data && state.data.status !== "missing") {
    render(state.data);
  }

  const label = kind === "arbs" ? "arb" : "spread";
  $("status").textContent = verified && priority
    ? "Saved " + addedCount + " new visible " + label + " pair(s), marked " + reportPairs.length + " total as manually verified, and starred " + reportPairs.length + " total."
    : verified
      ? "Saved " + addedCount + " new visible " + label + " pair(s) and marked " + reportPairs.length + " total as manually verified."
      : priority
      ? "Saved " + addedCount + " new visible " + label + " pair(s) and starred " + reportPairs.length + " total."
      : addedCount > 0
        ? "Saved " + addedCount + " visible " + label + " pair(s) locally."
        : "All visible " + label + " pair(s) were already saved locally.";
}

async function previewNearCandidatePair(key) {
  const candidate = (state.data?.discoveryResult?.candidatePreview || [])
    .find((item) => candidateKey(item) === key);
  if (!candidate) return;
  $("status").textContent = "Previewing near match with read-only orderbooks...";
  const payload = await fetchPairPreview(buildPairFromCandidate(candidate));
  renderPairPreview(payload, "nearPairPreview", "Near Match Preview");
  $("status").textContent = "Near match preview loaded. Add only if the mapping and economics make sense.";
}

function buildPairFromCandidate(candidate) {
  return {
    id: candidate.kalshiTicker + "|" + candidate.polymarketSlug,
    title: candidate.kalshiTitle || candidate.polymarketQuestion,
    outcomeLabel: candidate.outcomeLabel || "YES",
    category: candidate.category || undefined,
    expectedResolutionAt: candidate.expectedResolutionAt ?? null,
    liquidityDollars: candidate.liquidityDollars ?? null,
    volume24h: candidate.volume24h ?? null,
    kalshi: {
      ticker: candidate.kalshiTicker,
      liquidityDollars: candidate.kalshiLiquidityDollars ?? null,
      volume24h: candidate.kalshiVolume24h ?? null
    },
    polymarket: {
      slug: candidate.polymarketSlug,
      yesTokenId: candidate.yesTokenId,
      noTokenId: candidate.noTokenId,
      liquidityDollars: candidate.polymarketLiquidityDollars ?? null,
      volume24h: candidate.polymarketVolume24h ?? null
    }
  };
}

$("refresh").addEventListener("click", refreshScan);
$("scanConfigured").addEventListener("click", scanConfiguredPairs);
$("scanReady").addEventListener("click", scanReadyPairs);
$("startWatch").addEventListener("click", startWatch);
$("startReadyWatch").addEventListener("click", startReadyWatch);
$("startVisibleWatch").addEventListener("click", startVisibleWatch);
$("startSelectedWatch").addEventListener("click", startSelectedWatch);
$("startPriorityWatch").addEventListener("click", startPriorityWatch);
$("startVerifiedWatch").addEventListener("click", startVerifiedWatch);
$("startLastRejectedWatch").addEventListener("click", startLastRejectedWatch);
$("stopWatch").addEventListener("click", stopWatch);
$("simpleRefresh").addEventListener("click", refreshScan);
$("simpleScanConfigured").addEventListener("click", scanConfiguredPairs);
$("simpleStartWatch").addEventListener("click", () => {
  $("watchIntervalSeconds").value = "30";
  startWatch();
});
$("simpleStopWatch").addEventListener("click", stopWatch);
$("simpleRefreshDiscoveryReview").addEventListener("click", () => {
  loadDiscoveryReview().catch((error) => {
    $("status").innerHTML = '<span class="warn">Discovery review refresh failed: ' + html(error?.message || error) + '</span>';
  });
});
$("simpleRunDiscoveryReview").addEventListener("click", () => {
  runDiscoveryReview().catch((error) => {
    $("status").innerHTML = '<span class="warn">Discovery review failed: ' + html(error?.message || error) + '</span>';
  });
});
$("clearScanHistory").addEventListener("click", clearScanHistory);
$("exportScanJson").addEventListener("click", exportScanJson);
$("exportArbsCsv").addEventListener("click", exportArbsCsv);
$("exportVisibleArbsCsv").addEventListener("click", exportVisibleArbsCsv);
$("exportVisibleSpreadsCsv").addEventListener("click", exportVisibleSpreadsCsv);
$("exportRejectedCsv").addEventListener("click", exportRejectedCsv);
$("exportNearCsv").addEventListener("click", exportNearCsv);
$("refreshDiscoveryReview").addEventListener("click", () => {
  loadDiscoveryReview().catch((error) => {
    $("status").innerHTML = '<span class="warn">Discovery review refresh failed: ' + html(error?.message || error) + '</span>';
  });
});
$("runDiscoveryReview").addEventListener("click", () => {
  runDiscoveryReview().catch((error) => {
    $("status").innerHTML = '<span class="warn">Discovery review failed: ' + html(error?.message || error) + '</span>';
  });
});
$("addVisibleArbs").addEventListener("click", () => {
  addVisibleResultPairs("arbs", false, false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Add visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("addVerifiedVisibleArbs").addEventListener("click", () => {
  addVisibleResultPairs("arbs", false, true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Add verified visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("addVerifiedPriorityVisibleArbs").addEventListener("click", () => {
  addVisibleResultPairs("arbs", true, true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Add verified priority visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("starVisibleArbs").addEventListener("click", () => {
  addVisibleResultPairs("arbs", true, false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Star visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unstarVisibleArbs").addEventListener("click", () => {
  unstarVisibleResultPairs("arbs").catch((error) => {
    $("status").innerHTML = '<span class="warn">Unstar visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("selectVisibleArbs").addEventListener("click", () => {
  try {
    selectVisibleResultPairs("arbs");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Select visible arbs failed: ' + html(error?.message || error) + '</span>';
  }
});
$("previewVisibleArbResults").addEventListener("click", () => {
  previewVisibleResultPairs("arbs", $("previewVisibleArbResults")).catch((error) => {
    $("status").innerHTML = '<span class="warn">Preview visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("scanVisibleArbResults").addEventListener("click", () => {
  scanVisibleResultPairs("arbs", $("scanVisibleArbResults")).catch((error) => {
    $("status").innerHTML = '<span class="warn">Scan visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("startVisibleArbResultsWatch").addEventListener("click", () => {
  try {
    startVisibleResultWatch("arbs");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Start visible arbs watch failed: ' + html(error?.message || error) + '</span>';
  }
});
$("pauseVisibleArbResults").addEventListener("click", () => {
  pauseVisibleResultPairs("arbs").catch((error) => {
    $("status").innerHTML = '<span class="warn">Pause visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("resumeVisibleArbResults").addEventListener("click", () => {
  resumeVisibleResultPairs("arbs").catch((error) => {
    $("status").innerHTML = '<span class="warn">Resume visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("verifyVisibleArbResults").addEventListener("click", () => {
  setVisibleResultPairsVerified("arbs", true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Verify visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unverifyVisibleArbResults").addEventListener("click", () => {
  setVisibleResultPairsVerified("arbs", false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Unverify visible arbs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportVisibleArbPairsJson").addEventListener("click", () => {
  try {
    exportVisibleResultPairsJson("arbs");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Export visible arb pairs JSON failed: ' + html(error?.message || error) + '</span>';
  }
});
$("exportVisibleArbReviewCsv").addEventListener("click", () => {
  try {
    exportVisibleResultReviewCsv("arbs");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Export visible arb review CSV failed: ' + html(error?.message || error) + '</span>';
  }
});
$("addVisibleSpreads").addEventListener("click", () => {
  addVisibleResultPairs("spreads", false, false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Add visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("addVerifiedVisibleSpreads").addEventListener("click", () => {
  addVisibleResultPairs("spreads", false, true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Add verified visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("addVerifiedPriorityVisibleSpreads").addEventListener("click", () => {
  addVisibleResultPairs("spreads", true, true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Add verified priority visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("starVisibleSpreads").addEventListener("click", () => {
  addVisibleResultPairs("spreads", true, false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Star visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unstarVisibleSpreads").addEventListener("click", () => {
  unstarVisibleResultPairs("spreads").catch((error) => {
    $("status").innerHTML = '<span class="warn">Unstar visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("selectVisibleSpreads").addEventListener("click", () => {
  try {
    selectVisibleResultPairs("spreads");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Select visible spreads failed: ' + html(error?.message || error) + '</span>';
  }
});
$("previewVisibleSpreadResults").addEventListener("click", () => {
  previewVisibleResultPairs("spreads", $("previewVisibleSpreadResults")).catch((error) => {
    $("status").innerHTML = '<span class="warn">Preview visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("scanVisibleSpreadResults").addEventListener("click", () => {
  scanVisibleResultPairs("spreads", $("scanVisibleSpreadResults")).catch((error) => {
    $("status").innerHTML = '<span class="warn">Scan visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("startVisibleSpreadResultsWatch").addEventListener("click", () => {
  try {
    startVisibleResultWatch("spreads");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Start visible spreads watch failed: ' + html(error?.message || error) + '</span>';
  }
});
$("pauseVisibleSpreadResults").addEventListener("click", () => {
  pauseVisibleResultPairs("spreads").catch((error) => {
    $("status").innerHTML = '<span class="warn">Pause visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("resumeVisibleSpreadResults").addEventListener("click", () => {
  resumeVisibleResultPairs("spreads").catch((error) => {
    $("status").innerHTML = '<span class="warn">Resume visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("verifyVisibleSpreadResults").addEventListener("click", () => {
  setVisibleResultPairsVerified("spreads", true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Verify visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unverifyVisibleSpreadResults").addEventListener("click", () => {
  setVisibleResultPairsVerified("spreads", false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Unverify visible spreads failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportVisibleSpreadPairsJson").addEventListener("click", () => {
  try {
    exportVisibleResultPairsJson("spreads");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Export visible spread pairs JSON failed: ' + html(error?.message || error) + '</span>';
  }
});
$("exportVisibleSpreadReviewCsv").addEventListener("click", () => {
  try {
    exportVisibleResultReviewCsv("spreads");
  } catch (error) {
    $("status").innerHTML = '<span class="warn">Export visible spread review CSV failed: ' + html(error?.message || error) + '</span>';
  }
});
$("exportPairsJson").addEventListener("click", () => {
  exportPairsJson().catch((error) => {
    $("status").innerHTML = '<span class="warn">Export failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportPairReviewCsv").addEventListener("click", () => {
  exportPairReviewCsv().catch((error) => {
    $("status").innerHTML = '<span class="warn">Review export failed: ' + html(error?.message || error) + '</span>';
  });
});
$("importPairsJson").addEventListener("click", openImportPairsFile);
$("importPairsFile").addEventListener("change", (event) => {
  const file = event.target?.files?.[0];
  importPairsJsonFromFile(file).catch((error) => {
    $("status").innerHTML = '<span class="warn">Import failed: ' + html(error?.message || error) + '</span>';
  });
});
$("selectVisiblePairs").addEventListener("click", () => {
  setVisibleConfigPairsSelected(true);
});
$("clearSelectedPairs").addEventListener("click", () => {
  setVisibleConfigPairsSelected(false);
});
$("scanVisiblePairs").addEventListener("click", () => {
  scanVisiblePairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Visible scan failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportVisibleReviewCsv").addEventListener("click", () => {
  exportVisiblePairReviewCsv();
});
$("copyVisibleReviewCsv").addEventListener("click", () => {
  copyVisiblePairReviewCsv().catch((error) => {
    $("status").innerHTML = '<span class="warn">Copy visible review CSV failed: ' + html(error?.message || error) + '</span>';
  });
});
$("copyVisibleSummaries").addEventListener("click", () => {
  copyVisiblePairSummaries().catch((error) => {
    $("status").innerHTML = '<span class="warn">Copy visible summaries failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportSelectedReviewCsv").addEventListener("click", () => {
  exportSelectedPairReviewCsv();
});
$("copySelectedReviewCsv").addEventListener("click", () => {
  copySelectedPairReviewCsv().catch((error) => {
    $("status").innerHTML = '<span class="warn">Copy selected review CSV failed: ' + html(error?.message || error) + '</span>';
  });
});
$("copySelectedSummaries").addEventListener("click", () => {
  copySelectedPairSummaries().catch((error) => {
    $("status").innerHTML = '<span class="warn">Copy selected summaries failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportVisiblePairsJson").addEventListener("click", () => {
  exportVisiblePairsJson();
});
$("copyVisiblePairsJson").addEventListener("click", () => {
  copyVisiblePairsJson().catch((error) => {
    $("status").innerHTML = '<span class="warn">Copy visible JSON failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportSelectedPairsJson").addEventListener("click", () => {
  exportSelectedPairsJson();
});
$("copySelectedPairsJson").addEventListener("click", () => {
  copySelectedPairsJson().catch((error) => {
    $("status").innerHTML = '<span class="warn">Copy selected JSON failed: ' + html(error?.message || error) + '</span>';
  });
});
$("exportReadyPairsJson").addEventListener("click", () => {
  exportReadyPairsJson();
});
$("exportPriorityPairsJson").addEventListener("click", () => {
  exportPriorityPairsJson();
});
$("exportVerifiedPairsJson").addEventListener("click", () => {
  exportVerifiedPairsJson();
});
$("exportLastRejectedPairsJson").addEventListener("click", () => {
  exportLastRejectedPairsJson();
});
$("scanSelectedPairs").addEventListener("click", () => {
  scanSelectedPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Selected scan failed: ' + html(error?.message || error) + '</span>';
  });
});
$("scanPriorityPairs").addEventListener("click", () => {
  scanPriorityPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Priority scan failed: ' + html(error?.message || error) + '</span>';
  });
});
$("scanVerifiedPairs").addEventListener("click", () => {
  scanVerifiedPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Verified scan failed: ' + html(error?.message || error) + '</span>';
  });
});
$("scanLastRejectedPairs").addEventListener("click", () => {
  scanLastRejectedPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Last-rejected scan failed: ' + html(error?.message || error) + '</span>';
  });
});
$("pauseVisiblePairs").addEventListener("click", () => {
  bulkSetVisiblePairsEnabled(false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Visible pause failed: ' + html(error?.message || error) + '</span>';
  });
});
$("resumeVisiblePairs").addEventListener("click", () => {
  bulkSetVisiblePairsEnabled(true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Visible resume failed: ' + html(error?.message || error) + '</span>';
  });
});
$("starVisiblePairs").addEventListener("click", () => {
  bulkSetVisiblePairsPriority(true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Visible star failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unstarVisiblePairs").addEventListener("click", () => {
  bulkSetVisiblePairsPriority(false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Visible unstar failed: ' + html(error?.message || error) + '</span>';
  });
});
$("verifyVisiblePairs").addEventListener("click", () => {
  bulkSetVisiblePairsVerified(true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Visible verify failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unverifyVisiblePairs").addEventListener("click", () => {
  bulkSetVisiblePairsVerified(false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Visible unverify failed: ' + html(error?.message || error) + '</span>';
  });
});
$("pauseSelectedPairs").addEventListener("click", () => {
  bulkSetSelectedPairsEnabled(false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Bulk pause failed: ' + html(error?.message || error) + '</span>';
  });
});
$("pauseVisibleRejectedPairs").addEventListener("click", () => {
  pauseVisibleRejectedPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Pause rejected failed: ' + html(error?.message || error) + '</span>';
  });
});
$("resumeSelectedPairs").addEventListener("click", () => {
  bulkSetSelectedPairsEnabled(true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Bulk resume failed: ' + html(error?.message || error) + '</span>';
  });
});
$("starSelectedPairs").addEventListener("click", () => {
  bulkSetSelectedPairsPriority(true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Bulk star failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unstarSelectedPairs").addEventListener("click", () => {
  bulkSetSelectedPairsPriority(false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Bulk unstar failed: ' + html(error?.message || error) + '</span>';
  });
});
$("verifySelectedPairs").addEventListener("click", () => {
  bulkSetSelectedPairsVerified(true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Bulk verify failed: ' + html(error?.message || error) + '</span>';
  });
});
$("unverifySelectedPairs").addEventListener("click", () => {
  bulkSetSelectedPairsVerified(false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Bulk unverify failed: ' + html(error?.message || error) + '</span>';
  });
});
$("noteSelectedPairs").addEventListener("click", () => {
  editSelectedPairNotes().catch((error) => {
    $("status").innerHTML = '<span class="warn">Note selected pairs failed: ' + html(error?.message || error) + '</span>';
  });
});
$("clearSelectedPairNotes").addEventListener("click", () => {
  clearSelectedPairNotes().catch((error) => {
    $("status").innerHTML = '<span class="warn">Clear selected pair notes failed: ' + html(error?.message || error) + '</span>';
  });
});
$("removeSelectedPairs").addEventListener("click", () => {
  removeSelectedPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Bulk remove failed: ' + html(error?.message || error) + '</span>';
  });
});
$("pauseNeedsReviewPairs").addEventListener("click", () => {
  pauseNeedsReviewPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Pause needs-review failed: ' + html(error?.message || error) + '</span>';
  });
});
$("pauseLastRejectedPairs").addEventListener("click", () => {
  pauseLastRejectedPairs().catch((error) => {
    $("status").innerHTML = '<span class="warn">Pause last-rejected failed: ' + html(error?.message || error) + '</span>';
  });
});
$("enableNotifications").addEventListener("click", () => {
  enableNotifications().catch(() => {
    $("status").textContent = "Local notification setup failed.";
    updateNotificationControls();
  });
});
$("notifyOnArbs").addEventListener("change", (event) => {
  state.notifyOnArbs = Boolean(event.target.checked);
  saveNotificationPreference();
  updateNotificationControls();
  if (state.notifyOnArbs && !canNotify()) {
    $("status").textContent = "Click Enable notifications to allow local arb alerts.";
  }
});
$("notifyVerifiedOnly").addEventListener("change", (event) => {
  state.notifyVerifiedOnly = Boolean(event.target.checked);
  saveNotificationPreference();
  state.lastNotificationSignature = "";
});
$("showReviewedResults").addEventListener("click", () => applyResultQuickView("reviewed"));
$("showPriorityResults").addEventListener("click", () => applyResultQuickView("priority"));
$("showNewResultCandidates").addEventListener("click", () => applyResultQuickView("new"));
$("showNeedsReviewResults").addEventListener("click", () => applyResultQuickView("needs_review"));
$("clearResultFilters").addEventListener("click", clearResultFilters);
function handleResultActionClick(event) {
  const addPreviewButton = event.target?.closest?.("[data-add-preview-result-pairs]");
  const addPreviewKind = addPreviewButton?.getAttribute?.("data-add-preview-result-pairs");
  if (addPreviewKind === "arbs" || addPreviewKind === "spreads") {
    addPreviewResultPairs(addPreviewKind, false, false).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addVerifiedPriorityPreviewButton = event.target?.closest?.("[data-add-verified-priority-preview-result-pairs]");
  const addVerifiedPriorityPreviewKind = addVerifiedPriorityPreviewButton?.getAttribute?.("data-add-verified-priority-preview-result-pairs");
  if (addVerifiedPriorityPreviewKind === "arbs" || addVerifiedPriorityPreviewKind === "spreads") {
    addPreviewResultPairs(addVerifiedPriorityPreviewKind, true, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add verified priority preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addFilteredPreviewButton = event.target?.closest?.("[data-add-filtered-preview-result-pairs]");
  const addFilteredPreviewKind = addFilteredPreviewButton?.getAttribute?.("data-add-filtered-preview-result-pairs");
  if (addFilteredPreviewKind === "arbs" || addFilteredPreviewKind === "spreads") {
    addPreviewResultPairs(addFilteredPreviewKind, false, false, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addVerifiedPriorityFilteredPreviewButton = event.target?.closest?.("[data-add-verified-priority-filtered-preview-result-pairs]");
  const addVerifiedPriorityFilteredPreviewKind = addVerifiedPriorityFilteredPreviewButton?.getAttribute?.("data-add-verified-priority-filtered-preview-result-pairs");
  if (addVerifiedPriorityFilteredPreviewKind === "arbs" || addVerifiedPriorityFilteredPreviewKind === "spreads") {
    addPreviewResultPairs(addVerifiedPriorityFilteredPreviewKind, true, true, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add verified priority filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addSignalPreviewButton = event.target?.closest?.("[data-add-signal-preview-result-pairs]");
  const addSignalPreviewKind = addSignalPreviewButton?.getAttribute?.("data-add-signal-preview-result-pairs");
  if (addSignalPreviewKind === "arbs" || addSignalPreviewKind === "spreads") {
    addPreviewResultPairs(addSignalPreviewKind, false, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add signal preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addVerifiedPrioritySignalPreviewButton = event.target?.closest?.("[data-add-verified-priority-signal-preview-result-pairs]");
  const addVerifiedPrioritySignalPreviewKind = addVerifiedPrioritySignalPreviewButton?.getAttribute?.("data-add-verified-priority-signal-preview-result-pairs");
  if (addVerifiedPrioritySignalPreviewKind === "arbs" || addVerifiedPrioritySignalPreviewKind === "spreads") {
    addPreviewResultPairs(addVerifiedPrioritySignalPreviewKind, true, true, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add verified priority signal preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const selectPreviewButton = event.target?.closest?.("[data-select-preview-result-pairs]");
  const selectPreviewKind = selectPreviewButton?.getAttribute?.("data-select-preview-result-pairs");
  if (selectPreviewKind === "arbs" || selectPreviewKind === "spreads") {
    selectPreviewResultPairs(selectPreviewKind);
    return;
  }
  const selectSignalPreviewButton = event.target?.closest?.("[data-select-signal-preview-result-pairs]");
  const selectSignalPreviewKind = selectSignalPreviewButton?.getAttribute?.("data-select-signal-preview-result-pairs");
  if (selectSignalPreviewKind === "arbs" || selectSignalPreviewKind === "spreads") {
    selectPreviewResultPairs(selectSignalPreviewKind, true);
    return;
  }
  const selectFilteredPreviewButton = event.target?.closest?.("[data-select-filtered-preview-result-pairs]");
  const selectFilteredPreviewKind = selectFilteredPreviewButton?.getAttribute?.("data-select-filtered-preview-result-pairs");
  if (selectFilteredPreviewKind === "arbs" || selectFilteredPreviewKind === "spreads") {
    selectPreviewResultPairs(selectFilteredPreviewKind, false, true);
    return;
  }
  const scanPreviewButton = event.target?.closest?.("[data-scan-preview-result-pairs]");
  const scanPreviewKind = scanPreviewButton?.getAttribute?.("data-scan-preview-result-pairs");
  if (scanPreviewKind === "arbs" || scanPreviewKind === "spreads") {
    scanPreviewResultPairs(scanPreviewKind, scanPreviewButton).catch((error) => {
      $("status").innerHTML = '<span class="warn">Scan preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const scanSignalPreviewButton = event.target?.closest?.("[data-scan-signal-preview-result-pairs]");
  const scanSignalPreviewKind = scanSignalPreviewButton?.getAttribute?.("data-scan-signal-preview-result-pairs");
  if (scanSignalPreviewKind === "arbs" || scanSignalPreviewKind === "spreads") {
    scanPreviewResultPairs(scanSignalPreviewKind, scanSignalPreviewButton, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Scan signal preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const scanFilteredPreviewButton = event.target?.closest?.("[data-scan-filtered-preview-result-pairs]");
  const scanFilteredPreviewKind = scanFilteredPreviewButton?.getAttribute?.("data-scan-filtered-preview-result-pairs");
  if (scanFilteredPreviewKind === "arbs" || scanFilteredPreviewKind === "spreads") {
    scanPreviewResultPairs(scanFilteredPreviewKind, scanFilteredPreviewButton, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Scan filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const startPreviewWatchButton = event.target?.closest?.("[data-start-preview-result-watch]");
  const startPreviewWatchKind = startPreviewWatchButton?.getAttribute?.("data-start-preview-result-watch");
  if (startPreviewWatchKind === "arbs" || startPreviewWatchKind === "spreads") {
    startPreviewResultWatch(startPreviewWatchKind);
    return;
  }
  const startSignalPreviewWatchButton = event.target?.closest?.("[data-start-signal-preview-result-watch]");
  const startSignalPreviewWatchKind = startSignalPreviewWatchButton?.getAttribute?.("data-start-signal-preview-result-watch");
  if (startSignalPreviewWatchKind === "arbs" || startSignalPreviewWatchKind === "spreads") {
    startPreviewResultWatch(startSignalPreviewWatchKind, true);
    return;
  }
  const startFilteredPreviewWatchButton = event.target?.closest?.("[data-start-filtered-preview-result-watch]");
  const startFilteredPreviewWatchKind = startFilteredPreviewWatchButton?.getAttribute?.("data-start-filtered-preview-result-watch");
  if (startFilteredPreviewWatchKind === "arbs" || startFilteredPreviewWatchKind === "spreads") {
    startPreviewResultWatch(startFilteredPreviewWatchKind, false, true);
    return;
  }
  const starFilteredPreviewButton = event.target?.closest?.("[data-star-filtered-preview-result-pairs]");
  const starFilteredPreviewKind = starFilteredPreviewButton?.getAttribute?.("data-star-filtered-preview-result-pairs");
  if (starFilteredPreviewKind === "arbs" || starFilteredPreviewKind === "spreads") {
    setPreviewResultPairsPriority(starFilteredPreviewKind, true, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Star filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const unstarFilteredPreviewButton = event.target?.closest?.("[data-unstar-filtered-preview-result-pairs]");
  const unstarFilteredPreviewKind = unstarFilteredPreviewButton?.getAttribute?.("data-unstar-filtered-preview-result-pairs");
  if (unstarFilteredPreviewKind === "arbs" || unstarFilteredPreviewKind === "spreads") {
    setPreviewResultPairsPriority(unstarFilteredPreviewKind, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Unstar filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const verifyFilteredPreviewButton = event.target?.closest?.("[data-verify-filtered-preview-result-pairs]");
  const verifyFilteredPreviewKind = verifyFilteredPreviewButton?.getAttribute?.("data-verify-filtered-preview-result-pairs");
  if (verifyFilteredPreviewKind === "arbs" || verifyFilteredPreviewKind === "spreads") {
    setPreviewResultPairsVerified(verifyFilteredPreviewKind, true, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Verify filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const unverifyFilteredPreviewButton = event.target?.closest?.("[data-unverify-filtered-preview-result-pairs]");
  const unverifyFilteredPreviewKind = unverifyFilteredPreviewButton?.getAttribute?.("data-unverify-filtered-preview-result-pairs");
  if (unverifyFilteredPreviewKind === "arbs" || unverifyFilteredPreviewKind === "spreads") {
    setPreviewResultPairsVerified(unverifyFilteredPreviewKind, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Unverify filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const pauseFilteredPreviewButton = event.target?.closest?.("[data-pause-filtered-preview-result-pairs]");
  const pauseFilteredPreviewKind = pauseFilteredPreviewButton?.getAttribute?.("data-pause-filtered-preview-result-pairs");
  if (pauseFilteredPreviewKind === "arbs" || pauseFilteredPreviewKind === "spreads") {
    setPreviewResultPairsEnabled(pauseFilteredPreviewKind, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Pause filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const resumeFilteredPreviewButton = event.target?.closest?.("[data-resume-filtered-preview-result-pairs]");
  const resumeFilteredPreviewKind = resumeFilteredPreviewButton?.getAttribute?.("data-resume-filtered-preview-result-pairs");
  if (resumeFilteredPreviewKind === "arbs" || resumeFilteredPreviewKind === "spreads") {
    setPreviewResultPairsEnabled(resumeFilteredPreviewKind, true, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Resume filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const starPreviewButton = event.target?.closest?.("[data-star-preview-result-pairs]");
  const starPreviewKind = starPreviewButton?.getAttribute?.("data-star-preview-result-pairs");
  if (starPreviewKind === "arbs" || starPreviewKind === "spreads") {
    setPreviewResultPairsPriority(starPreviewKind, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Star preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const unstarPreviewButton = event.target?.closest?.("[data-unstar-preview-result-pairs]");
  const unstarPreviewKind = unstarPreviewButton?.getAttribute?.("data-unstar-preview-result-pairs");
  if (unstarPreviewKind === "arbs" || unstarPreviewKind === "spreads") {
    setPreviewResultPairsPriority(unstarPreviewKind, false).catch((error) => {
      $("status").innerHTML = '<span class="warn">Unstar preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const verifyPreviewButton = event.target?.closest?.("[data-verify-preview-result-pairs]");
  const verifyPreviewKind = verifyPreviewButton?.getAttribute?.("data-verify-preview-result-pairs");
  if (verifyPreviewKind === "arbs" || verifyPreviewKind === "spreads") {
    setPreviewResultPairsVerified(verifyPreviewKind, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Verify preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const unverifyPreviewButton = event.target?.closest?.("[data-unverify-preview-result-pairs]");
  const unverifyPreviewKind = unverifyPreviewButton?.getAttribute?.("data-unverify-preview-result-pairs");
  if (unverifyPreviewKind === "arbs" || unverifyPreviewKind === "spreads") {
    setPreviewResultPairsVerified(unverifyPreviewKind, false).catch((error) => {
      $("status").innerHTML = '<span class="warn">Unverify preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const pausePreviewButton = event.target?.closest?.("[data-pause-preview-result-pairs]");
  const pausePreviewKind = pausePreviewButton?.getAttribute?.("data-pause-preview-result-pairs");
  if (pausePreviewKind === "arbs" || pausePreviewKind === "spreads") {
    setPreviewResultPairsEnabled(pausePreviewKind, false).catch((error) => {
      $("status").innerHTML = '<span class="warn">Pause preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const resumePreviewButton = event.target?.closest?.("[data-resume-preview-result-pairs]");
  const resumePreviewKind = resumePreviewButton?.getAttribute?.("data-resume-preview-result-pairs");
  if (resumePreviewKind === "arbs" || resumePreviewKind === "spreads") {
    setPreviewResultPairsEnabled(resumePreviewKind, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Resume preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const exportPreviewPairsButton = event.target?.closest?.("[data-export-preview-result-pairs-json]");
  const exportPreviewPairsKind = exportPreviewPairsButton?.getAttribute?.("data-export-preview-result-pairs-json");
  if (exportPreviewPairsKind === "arbs" || exportPreviewPairsKind === "spreads") {
    exportPreviewResultPairsJson(exportPreviewPairsKind);
    return;
  }
  const exportPreviewReviewButton = event.target?.closest?.("[data-export-preview-result-review-csv]");
  const exportPreviewReviewKind = exportPreviewReviewButton?.getAttribute?.("data-export-preview-result-review-csv");
  if (exportPreviewReviewKind === "arbs" || exportPreviewReviewKind === "spreads") {
    exportPreviewResultReviewCsv(exportPreviewReviewKind);
    return;
  }
  const exportSignalPreviewPairsButton = event.target?.closest?.("[data-export-signal-preview-result-pairs-json]");
  const exportSignalPreviewPairsKind = exportSignalPreviewPairsButton?.getAttribute?.("data-export-signal-preview-result-pairs-json");
  if (exportSignalPreviewPairsKind === "arbs" || exportSignalPreviewPairsKind === "spreads") {
    exportPreviewResultPairsJson(exportSignalPreviewPairsKind, true);
    return;
  }
  const exportSignalPreviewReviewButton = event.target?.closest?.("[data-export-signal-preview-result-review-csv]");
  const exportSignalPreviewReviewKind = exportSignalPreviewReviewButton?.getAttribute?.("data-export-signal-preview-result-review-csv");
  if (exportSignalPreviewReviewKind === "arbs" || exportSignalPreviewReviewKind === "spreads") {
    exportPreviewResultReviewCsv(exportSignalPreviewReviewKind, true);
    return;
  }
  const exportFilteredPreviewPairsButton = event.target?.closest?.("[data-export-filtered-preview-result-pairs-json]");
  const exportFilteredPreviewPairsKind = exportFilteredPreviewPairsButton?.getAttribute?.("data-export-filtered-preview-result-pairs-json");
  if (exportFilteredPreviewPairsKind === "arbs" || exportFilteredPreviewPairsKind === "spreads") {
    exportFilteredPreviewResultPairsJson(exportFilteredPreviewPairsKind);
    return;
  }
  const exportSavedFilteredPreviewPairsButton = event.target?.closest?.("[data-export-saved-filtered-preview-result-pairs-json]");
  const exportSavedFilteredPreviewPairsKind = exportSavedFilteredPreviewPairsButton?.getAttribute?.("data-export-saved-filtered-preview-result-pairs-json");
  if (exportSavedFilteredPreviewPairsKind === "arbs" || exportSavedFilteredPreviewPairsKind === "spreads") {
    exportSavedPreviewResultPairsJson(exportSavedFilteredPreviewPairsKind, false, true);
    return;
  }
  const exportFilteredPreviewReviewButton = event.target?.closest?.("[data-export-filtered-preview-result-review-csv]");
  const exportFilteredPreviewReviewKind = exportFilteredPreviewReviewButton?.getAttribute?.("data-export-filtered-preview-result-review-csv");
  if (exportFilteredPreviewReviewKind === "arbs" || exportFilteredPreviewReviewKind === "spreads") {
    exportFilteredPreviewResultReviewCsv(exportFilteredPreviewReviewKind);
    return;
  }
  const exportSavedPreviewPairsButton = event.target?.closest?.("[data-export-saved-preview-result-pairs-json]");
  const exportSavedPreviewPairsKind = exportSavedPreviewPairsButton?.getAttribute?.("data-export-saved-preview-result-pairs-json");
  if (exportSavedPreviewPairsKind === "arbs" || exportSavedPreviewPairsKind === "spreads") {
    exportSavedPreviewResultPairsJson(exportSavedPreviewPairsKind);
    return;
  }
  const exportSavedSignalPreviewPairsButton = event.target?.closest?.("[data-export-saved-signal-preview-result-pairs-json]");
  const exportSavedSignalPreviewPairsKind = exportSavedSignalPreviewPairsButton?.getAttribute?.("data-export-saved-signal-preview-result-pairs-json");
  if (exportSavedSignalPreviewPairsKind === "arbs" || exportSavedSignalPreviewPairsKind === "spreads") {
    exportSavedPreviewResultPairsJson(exportSavedSignalPreviewPairsKind, true);
    return;
  }
  const refreshFilteredPreviewButton = event.target?.closest?.("[data-refresh-filtered-preview-result-pairs]");
  const refreshFilteredPreviewKind = refreshFilteredPreviewButton?.getAttribute?.("data-refresh-filtered-preview-result-pairs");
  if (refreshFilteredPreviewKind === "arbs" || refreshFilteredPreviewKind === "spreads") {
    refreshPreviewResultPairs(refreshFilteredPreviewKind, refreshFilteredPreviewButton, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Refresh filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const refreshPreviewButton = event.target?.closest?.("[data-refresh-preview-result-pairs]");
  const refreshPreviewKind = refreshPreviewButton?.getAttribute?.("data-refresh-preview-result-pairs");
  if (refreshPreviewKind === "arbs" || refreshPreviewKind === "spreads") {
    refreshPreviewResultPairs(refreshPreviewKind, refreshPreviewButton).catch((error) => {
      $("status").innerHTML = '<span class="warn">Refresh preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const retryFailedFilteredPreviewButton = event.target?.closest?.("[data-retry-failed-filtered-preview-result-pairs]");
  const retryFailedFilteredPreviewKind = retryFailedFilteredPreviewButton?.getAttribute?.("data-retry-failed-filtered-preview-result-pairs");
  if (retryFailedFilteredPreviewKind === "arbs" || retryFailedFilteredPreviewKind === "spreads") {
    retryFailedPreviewResultPairs(retryFailedFilteredPreviewKind, retryFailedFilteredPreviewButton, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Retry failed filtered preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const retryFailedPreviewButton = event.target?.closest?.("[data-retry-failed-preview-result-pairs]");
  const retryFailedPreviewKind = retryFailedPreviewButton?.getAttribute?.("data-retry-failed-preview-result-pairs");
  if (retryFailedPreviewKind === "arbs" || retryFailedPreviewKind === "spreads") {
    retryFailedPreviewResultPairs(retryFailedPreviewKind, retryFailedPreviewButton).catch((error) => {
      $("status").innerHTML = '<span class="warn">Retry failed preview result pairs failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const clearFilteredPreviewButton = event.target?.closest?.("[data-clear-filtered-preview-result-pairs]");
  const clearFilteredPreviewKind = clearFilteredPreviewButton?.getAttribute?.("data-clear-filtered-preview-result-pairs");
  if (clearFilteredPreviewKind === "arbs" || clearFilteredPreviewKind === "spreads") {
    clearFilteredPreviewResultPairs(clearFilteredPreviewKind);
    return;
  }
  const clearPreviewButton = event.target?.closest?.("[data-clear-preview-result-pairs]");
  const clearPreviewKind = clearPreviewButton?.getAttribute?.("data-clear-preview-result-pairs");
  if (clearPreviewKind === "arbs" || clearPreviewKind === "spreads") {
    clearPreviewResultPairs(clearPreviewKind);
    return;
  }
  const removePreviewRowButton = event.target?.closest?.("[data-remove-preview-result-row-index]");
  if (removePreviewRowButton) {
    removePreviewResultRow(
      removePreviewRowButton.getAttribute("data-remove-preview-result-row-kind"),
      removePreviewRowButton.getAttribute("data-remove-preview-result-row-index")
    );
    return;
  }
  const previewButton = event.target?.closest?.("[data-preview-config-pair]");
  const previewId = previewButton?.getAttribute?.("data-preview-config-pair");
  if (previewId !== null && previewId !== undefined) {
    previewConfiguredPair(previewId);
    return;
  }
  const addButton = event.target?.closest?.("[data-add-report-pair]");
  const addId = addButton?.getAttribute?.("data-add-report-pair");
  if (addId !== null && addId !== undefined) {
    addReportPair(addId, false, false).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add result pair failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addVerifiedButton = event.target?.closest?.("[data-add-verified-report-pair]");
  const addVerifiedId = addVerifiedButton?.getAttribute?.("data-add-verified-report-pair");
  if (addVerifiedId !== null && addVerifiedId !== undefined) {
    addReportPair(addVerifiedId, true, false).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add verified result pair failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addPriorityButton = event.target?.closest?.("[data-add-priority-report-pair]");
  const addPriorityId = addPriorityButton?.getAttribute?.("data-add-priority-report-pair");
  if (addPriorityId !== null && addPriorityId !== undefined) {
    addReportPair(addPriorityId, false, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add priority result pair failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const addVerifiedPriorityButton = event.target?.closest?.("[data-add-verified-priority-report-pair]");
  const addVerifiedPriorityId = addVerifiedPriorityButton?.getAttribute?.("data-add-verified-priority-report-pair");
  if (addVerifiedPriorityId !== null && addVerifiedPriorityId !== undefined) {
    addReportPair(addVerifiedPriorityId, true, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Add verified priority result pair failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const verifyButton = event.target?.closest?.("[data-toggle-verified-pair]");
  const verifyId = verifyButton?.getAttribute?.("data-toggle-verified-pair");
  if (verifyId !== null && verifyId !== undefined) {
    toggleConfiguredPairVerified(verifyId, verifyButton?.getAttribute?.("data-toggle-verified") === "true").catch((error) => {
      $("status").innerHTML = '<span class="warn">Verified toggle failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const priorityButton = event.target?.closest?.("[data-toggle-priority-pair]");
  const priorityId = priorityButton?.getAttribute?.("data-toggle-priority-pair");
  if (priorityId !== null && priorityId !== undefined) {
    toggleConfiguredPairPriority(priorityId, priorityButton?.getAttribute?.("data-toggle-priority") === "true").catch((error) => {
      $("status").innerHTML = '<span class="warn">Priority toggle failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const toggleButton = event.target?.closest?.("[data-toggle-pair]");
  const toggleId = toggleButton?.getAttribute?.("data-toggle-pair");
  if (toggleId !== null && toggleId !== undefined) {
    toggleConfiguredPair(toggleId, toggleButton?.getAttribute?.("data-toggle-enabled") === "true").catch((error) => {
      $("status").innerHTML = '<span class="warn">Toggle failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const noteButton = event.target?.closest?.("[data-edit-note-pair]");
  const noteId = noteButton?.getAttribute?.("data-edit-note-pair");
  if (noteId !== null && noteId !== undefined) {
    editConfiguredPairNote(noteId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Note save failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const clearNoteButton = event.target?.closest?.("[data-clear-note-pair]");
  const clearNoteId = clearNoteButton?.getAttribute?.("data-clear-note-pair");
  if (clearNoteId !== null && clearNoteId !== undefined) {
    clearConfiguredPairNote(clearNoteId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Note clear failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const scanButton = event.target?.closest?.("[data-scan-config-pair]");
  const scanId = scanButton?.getAttribute?.("data-scan-config-pair");
  if (scanId !== null && scanId !== undefined) {
    scanConfiguredPair(scanId, scanButton).catch((error) => {
      $("status").innerHTML = '<span class="warn">Single-pair scan failed: ' + html(error?.message || error) + '</span>';
    });
  }
}
$("arbs").addEventListener("click", handleResultActionClick);
$("spreads").addEventListener("click", handleResultActionClick);
$("arbResultPreview").addEventListener("click", handleResultActionClick);
$("spreadResultPreview").addEventListener("click", handleResultActionClick);
document.addEventListener("change", (event) => {
  const previewSort = event.target?.closest?.("[data-preview-result-sort]");
  if (previewSort) {
    setPreviewResultSort(previewSort.getAttribute("data-preview-result-sort"), previewSort.value);
    return;
  }
  const previewSearch = event.target?.closest?.("[data-preview-result-search]");
  if (previewSearch) {
    setPreviewResultSearch(previewSearch.getAttribute("data-preview-result-search"), previewSearch.value);
  }
});
document.addEventListener("click", (event) => {
  const arbVenueFilter = event.target?.closest?.("[data-arb-venue-filter]");
  if (arbVenueFilter) {
    setArbVenueFilter(arbVenueFilter.getAttribute("data-arb-venue-filter"));
    return;
  }
  const clearArbVenueFilter = event.target?.closest?.("[data-clear-arb-venue-filter]");
  if (clearArbVenueFilter) {
    setArbVenueFilter("");
    return;
  }
  const spreadSideFilter = event.target?.closest?.("[data-spread-side-filter]");
  if (spreadSideFilter) {
    setSpreadSideFilter(spreadSideFilter.getAttribute("data-spread-side-filter"));
    return;
  }
  const clearSpreadSideFilter = event.target?.closest?.("[data-clear-spread-side-filter]");
  if (clearSpreadSideFilter) {
    setSpreadSideFilter("");
    return;
  }
  const previewStatusFilter = event.target?.closest?.("[data-preview-status-filter]");
  if (previewStatusFilter) {
    setPreviewResultStatusFilter(
      previewStatusFilter.getAttribute("data-preview-status-filter-kind"),
      previewStatusFilter.getAttribute("data-preview-status-filter")
    );
    return;
  }
  const clearPreviewStatusFilter = event.target?.closest?.("[data-clear-preview-status-filter]");
  if (clearPreviewStatusFilter) {
    setPreviewResultStatusFilter(clearPreviewStatusFilter.getAttribute("data-clear-preview-status-filter"), "");
    return;
  }
  const clearPreviewResultFiltersButton = event.target?.closest?.("[data-clear-preview-result-filters]");
  if (clearPreviewResultFiltersButton) {
    clearPreviewResultFilters(clearPreviewResultFiltersButton.getAttribute("data-clear-preview-result-filters"));
    return;
  }
  const copyPairJsonControl = event.target?.closest?.("[data-copy-pair-json]");
  const copyPairJsonId = copyPairJsonControl?.getAttribute?.("data-copy-pair-json");
  if (copyPairJsonId !== null && copyPairJsonId !== undefined) {
    copyPairJson(copyPairJsonId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Copy pair JSON failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const copyPairSummaryControl = event.target?.closest?.("[data-copy-pair-summary]");
  const copyPairSummaryId = copyPairSummaryControl?.getAttribute?.("data-copy-pair-summary");
  if (copyPairSummaryId !== null && copyPairSummaryId !== undefined) {
    copyPairSummary(copyPairSummaryId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Copy pair summary failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const previewQuickView = event.target?.closest?.("[data-preview-quick-view]");
  if (previewQuickView) {
    applyPreviewQuickView(
      previewQuickView.getAttribute("data-preview-quick-view-kind"),
      previewQuickView.getAttribute("data-preview-quick-view")
    );
    return;
  }
  const previewPairStatusFilter = event.target?.closest?.("[data-preview-pair-status-filter]");
  if (previewPairStatusFilter) {
    setPreviewPairStatusFilter(
      previewPairStatusFilter.getAttribute("data-preview-pair-status-filter-kind"),
      previewPairStatusFilter.getAttribute("data-preview-pair-status-filter")
    );
    return;
  }
  const clearPreviewPairStatusFilter = event.target?.closest?.("[data-clear-preview-pair-status-filter]");
  if (clearPreviewPairStatusFilter) {
    setPreviewPairStatusFilter(clearPreviewPairStatusFilter.getAttribute("data-clear-preview-pair-status-filter"), "");
    return;
  }
  const previewLocalStateFilter = event.target?.closest?.("[data-preview-local-state-filter]");
  if (previewLocalStateFilter) {
    setPreviewLocalStateFilter(
      previewLocalStateFilter.getAttribute("data-preview-local-state-filter-kind"),
      previewLocalStateFilter.getAttribute("data-preview-local-state-filter")
    );
    return;
  }
  const clearPreviewLocalStateFilter = event.target?.closest?.("[data-clear-preview-local-state-filter]");
  if (clearPreviewLocalStateFilter) {
    setPreviewLocalStateFilter(clearPreviewLocalStateFilter.getAttribute("data-clear-preview-local-state-filter"), "");
    return;
  }
  const previewReviewFilter = event.target?.closest?.("[data-preview-review-filter]");
  if (previewReviewFilter) {
    setPreviewReviewFilter(
      previewReviewFilter.getAttribute("data-preview-review-filter-kind"),
      previewReviewFilter.getAttribute("data-preview-review-filter")
    );
    return;
  }
  const clearPreviewReviewFilter = event.target?.closest?.("[data-clear-preview-review-filter]");
  if (clearPreviewReviewFilter) {
    setPreviewReviewFilter(clearPreviewReviewFilter.getAttribute("data-clear-preview-review-filter"), "");
    return;
  }
  const previewProblemReasonFilter = event.target?.closest?.("[data-preview-problem-reason-filter]");
  if (previewProblemReasonFilter) {
    setPreviewProblemReasonFilter(
      previewProblemReasonFilter.getAttribute("data-preview-problem-reason-filter-kind"),
      previewProblemReasonFilter.getAttribute("data-preview-problem-reason-filter")
    );
    return;
  }
  const clearPreviewProblemReasonFilter = event.target?.closest?.("[data-clear-preview-problem-reason-filter]");
  if (clearPreviewProblemReasonFilter) {
    setPreviewProblemReasonFilter(clearPreviewProblemReasonFilter.getAttribute("data-clear-preview-problem-reason-filter"), "");
    return;
  }
  const resultPairStatusFilter = event.target?.closest?.("[data-result-pair-status-filter]");
  if (resultPairStatusFilter) {
    setResultPairStatusFilter(resultPairStatusFilter.getAttribute("data-result-pair-status-filter"));
    return;
  }
  const clearResultPairStatusFilter = event.target?.closest?.("[data-clear-result-pair-status-filter]");
  if (clearResultPairStatusFilter) {
    setResultPairStatusFilter("");
    return;
  }
  const resultLocalStateFilter = event.target?.closest?.("[data-result-local-state-filter]");
  if (resultLocalStateFilter) {
    setResultLocalStateFilter(resultLocalStateFilter.getAttribute("data-result-local-state-filter"));
    return;
  }
  const clearResultLocalStateFilter = event.target?.closest?.("[data-clear-result-local-state-filter]");
  if (clearResultLocalStateFilter) {
    setResultLocalStateFilter("");
    return;
  }
  const resultReviewFilter = event.target?.closest?.("[data-result-review-filter]");
  if (resultReviewFilter) {
    setResultReviewFilter(resultReviewFilter.getAttribute("data-result-review-filter"));
    return;
  }
  const clearResultReviewFilter = event.target?.closest?.("[data-clear-result-review-filter]");
  if (clearResultReviewFilter) {
    setResultReviewFilter("");
    return;
  }
  const nearStatusFilter = event.target?.closest?.("[data-near-status-filter]");
  if (nearStatusFilter) {
    setNearStatusFilter(nearStatusFilter.getAttribute("data-near-status-filter"));
    return;
  }
  const clearNearStatusFilter = event.target?.closest?.("[data-clear-near-status-filter]");
  if (clearNearStatusFilter) {
    setNearStatusFilter("");
    return;
  }
  const rejectionFilter = event.target?.closest?.("[data-rejection-filter]");
  if (rejectionFilter) {
    setRejectionReasonFilter(rejectionFilter.getAttribute("data-rejection-filter"));
    return;
  }
  const clearRejectionFilter = event.target?.closest?.("[data-clear-rejection-filter]");
  if (clearRejectionFilter) {
    setRejectionReasonFilter("");
    return;
  }
  const reviewWarningFilter = event.target?.closest?.("[data-review-warning-filter]");
  if (reviewWarningFilter) {
    setReviewWarningFilter(reviewWarningFilter.getAttribute("data-review-warning-filter"));
    return;
  }
  const clearReviewWarningFilter = event.target?.closest?.("[data-clear-review-warning-filter]");
  if (clearReviewWarningFilter) {
    setReviewWarningFilter("");
    return;
  }
  const header = event.target?.closest?.("th[data-sort-column]");
  if (header) {
    sortTableByHeader(header);
  }
});
document.querySelectorAll("[data-pair-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    setConfigPairFilter(button.getAttribute("data-pair-filter"));
  });
});
$("configPairs").addEventListener("click", (event) => {
  const target = event.target;
  const previewId = target?.getAttribute?.("data-preview-config-pair");
  if (previewId !== null && previewId !== undefined) {
    previewConfiguredPair(previewId);
    return;
  }
  const scanId = target?.getAttribute?.("data-scan-config-pair");
  if (scanId !== null && scanId !== undefined) {
    scanConfiguredPair(scanId, target).catch((error) => {
      $("status").innerHTML = '<span class="warn">Single-pair scan failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const noteId = target?.getAttribute?.("data-edit-note-pair");
  if (noteId !== null && noteId !== undefined) {
    editConfiguredPairNote(noteId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Note save failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const clearNoteId = target?.getAttribute?.("data-clear-note-pair");
  if (clearNoteId !== null && clearNoteId !== undefined) {
    clearConfiguredPairNote(clearNoteId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Note clear failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const priorityId = target?.getAttribute?.("data-toggle-priority-pair");
  if (priorityId !== null && priorityId !== undefined) {
    toggleConfiguredPairPriority(priorityId, target?.getAttribute?.("data-toggle-priority") === "true").catch((error) => {
      $("status").innerHTML = '<span class="warn">Priority toggle failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const verifiedId = target?.getAttribute?.("data-toggle-verified-pair");
  if (verifiedId !== null && verifiedId !== undefined) {
    toggleConfiguredPairVerified(verifiedId, target?.getAttribute?.("data-toggle-verified") === "true").catch((error) => {
      $("status").innerHTML = '<span class="warn">Verified toggle failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const toggleId = target?.getAttribute?.("data-toggle-pair");
  if (toggleId !== null && toggleId !== undefined) {
    toggleConfiguredPair(toggleId, target?.getAttribute?.("data-toggle-enabled") === "true").catch((error) => {
      $("status").innerHTML = '<span class="warn">Toggle failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const id = target?.getAttribute?.("data-delete-pair");
  if (id === null || id === undefined) return;
  deleteConfiguredPair(id).catch((error) => {
    $("status").innerHTML = '<span class="warn">Remove failed: ' + html(error?.message || error) + '</span>';
  });
});
$("configPairs").addEventListener("change", (event) => {
  const target = event.target;
  const id = target?.getAttribute?.("data-select-config-pair");
  if (id === null || id === undefined) return;
  setConfigPairSelected(id, Boolean(target.checked));
});
$("near").addEventListener("click", (event) => {
  const target = event.target;
  const previewKey = target?.getAttribute?.("data-preview-near-pair-key");
  if (previewKey !== null && previewKey !== undefined) {
    previewNearCandidatePair(previewKey).catch((error) => {
      $("status").innerHTML = '<span class="warn">Near preview failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const verifiedKey = target?.getAttribute?.("data-add-verified-pair-key");
  if (verifiedKey !== null && verifiedKey !== undefined) {
    addCandidatePair(verifiedKey, true).catch((error) => {
      $("status").innerHTML = '<span class="warn">Save verified failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const key = target?.getAttribute?.("data-add-pair-key");
  if (key === null || key === undefined) return;
  addCandidatePair(key, false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Save failed: ' + html(error?.message || error) + '</span>';
  });
});
$("discoveryReview").addEventListener("click", (event) => {
  const target = event.target;
  const previewId = target?.getAttribute?.("data-preview-review-candidate");
  if (previewId !== null && previewId !== undefined) {
    previewDiscoveryReviewCandidate(previewId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Discovery preview failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const saveId = target?.getAttribute?.("data-save-review-candidate");
  if (saveId !== null && saveId !== undefined) {
    saveDiscoveryReviewCandidate(saveId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Discovery save failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const markId = target?.getAttribute?.("data-mark-review-candidate");
  if (markId === null || markId === undefined) return;
  const status = target?.getAttribute?.("data-review-status") || "reviewed";
  markDiscoveryReviewCandidate(markId, status).catch((error) => {
    $("status").innerHTML = '<span class="warn">Discovery mark failed: ' + html(error?.message || error) + '</span>';
  });
});
$("simpleDiscoveryReview").addEventListener("click", (event) => {
  const target = event.target;
  const previewId = target?.getAttribute?.("data-preview-review-candidate");
  if (previewId !== null && previewId !== undefined) {
    previewDiscoveryReviewCandidate(previewId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Discovery preview failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const saveId = target?.getAttribute?.("data-save-review-candidate");
  if (saveId !== null && saveId !== undefined) {
    saveDiscoveryReviewCandidate(saveId).catch((error) => {
      $("status").innerHTML = '<span class="warn">Discovery save failed: ' + html(error?.message || error) + '</span>';
    });
    return;
  }
  const markId = target?.getAttribute?.("data-mark-review-candidate");
  if (markId === null || markId === undefined) return;
  const status = target?.getAttribute?.("data-review-status") || "reviewed";
  markDiscoveryReviewCandidate(markId, status).catch((error) => {
    $("status").innerHTML = '<span class="warn">Discovery mark failed: ' + html(error?.message || error) + '</span>';
  });
});
$("searchResults").addEventListener("click", (event) => {
  const target = event.target;
  const kalshiIndex = target?.getAttribute?.("data-use-kalshi");
  const polymarketIndex = target?.getAttribute?.("data-use-polymarket");
  if (kalshiIndex !== null && kalshiIndex !== undefined) {
    state.selectedKalshi = state.marketSearch.kalshi[Number(kalshiIndex)] || null;
    renderPairBuilder();
  }
  if (polymarketIndex !== null && polymarketIndex !== undefined) {
    state.selectedPolymarket = state.marketSearch.polymarket[Number(polymarketIndex)] || null;
    renderPairBuilder();
  }
});
$("pairSearchButton").addEventListener("click", searchMarkets);
$("pairSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchMarkets();
  }
});
$("previewManualPair").addEventListener("click", () => {
  previewSelectedPair();
});
$("saveManualPair").addEventListener("click", () => {
  saveManualPair(false).catch((error) => {
    $("status").innerHTML = '<span class="warn">Save failed: ' + html(error?.message || error) + '</span>';
  });
});
$("saveVerifiedManualPair").addEventListener("click", () => {
  saveManualPair(true).catch((error) => {
    $("status").innerHTML = '<span class="warn">Save verified failed: ' + html(error?.message || error) + '</span>';
  });
});
$("search").addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  $("simpleSearch").value = event.target.value;
  if (state.data) render(state.data);
  loadPairs().catch(() => {});
  if (state.discoveryReview) renderDiscoveryReview(state.discoveryReview);
});
$("simpleSearch").addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  $("search").value = event.target.value;
  if (state.data) render(state.data);
  loadPairs().catch(() => {});
  if (state.discoveryReview) renderDiscoveryReview(state.discoveryReview);
});
loadScanHistory();
loadDashboardSettings();
loadNotificationPreference();
bindDashboardSettingsPersistence();
renderScanHistory();
updateWatchControls();
loadLatest().catch((error) => {
  $("status").innerHTML = '<span class="warn">Load failed: ' + html(error?.message || error) + '</span>';
});
setInterval(() => {
  if (state.scanInFlight || state.watchTimer !== null) return;
  loadLatest().catch((error) => {
    $("status").innerHTML = '<span class="warn">Auto refresh failed: ' + html(error?.message || error) + '</span>';
  });
}, SIMPLE_AUTO_REFRESH_MS);
`;
}

function parseBooleanParam(value: string | null, fallback: boolean): boolean {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function parseOptionalNumberParam(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalListParam(value: string | null): string[] | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ];

  return parsed.length > 0 ? parsed : undefined;
}

function parseOptionalNumberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNullableNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBooleanValue(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
  }

  return undefined;
}

function optionalString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function requiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);

  if (!parsed) {
    throw new Error(`Missing required field: ${fieldName}`);
  }

  return parsed;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  startCrossVenueDashboardServer({
    log: console.log,
  });
}
