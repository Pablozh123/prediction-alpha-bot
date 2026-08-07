import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getBestBidAsk,
  walkAsksForSize,
  type OrderBookLevel
} from "../utils/orderbook.js";

const require = createRequire(import.meta.url);

type SqliteDatabase = {
  prepare<T = unknown>(sql: string): {
    all(...params: unknown[]): T[];
    get(...params: unknown[]): T | undefined;
  };
  close(): void;
};

type DatabaseConstructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }
) => SqliteDatabase;

type CountRow = {
  count: number;
};

export type SnapshotReplayRow = {
  id: string;
  tokenId: string;
  marketSlug: string | null;
  opportunityId: string | null;
  source: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  checksum: string | null;
  capturedAt: number;
};

export type TokenReplayMetrics = {
  tokenId: string;
  marketSlug: string | null;
  snapshots: number;
  firstCapturedAt: number;
  lastCapturedAt: number;
  durationMinutes: number;
  firstBestBid: number | null;
  firstBestAsk: number | null;
  firstAverageEntryAsk: number | null;
  lastBestBid: number | null;
  lastBestAsk: number | null;
  minBestAsk: number | null;
  maxBestBid: number | null;
  averageSpread: number | null;
  averageMaxFillableUsd: number;
  minMaxFillableUsd: number;
  fillableSnapshots: number;
  fillableRate: number;
  latestMarkToBidMove: number | null;
  latestMarkToMidMove: number | null;
  bestMarkToBidMove: number | null;
};

export type ForwardReplayReport = {
  generatedAt: string;
  dbPath: string;
  targetSizeUsd: number;
  snapshotCount: number;
  uniqueTokens: number;
  uniqueMarkets: number;
  firstCapturedAt: number | null;
  lastCapturedAt: number | null;
  collectionDurationMinutes: number | null;
  duplicateChecksums: number;
  tokensFillableAtTarget: number;
  tokensWithPositiveLatestBidMove: number;
  tokensWithNegativeLatestBidMove: number;
  tokensWithPositiveBestBidMove: number;
  averageLatestMarkToBidMove: number | null;
  averageBestMarkToBidMove: number | null;
  tokens: TokenReplayMetrics[];
};

type RunOptions = {
  dbPath?: string;
  reportDate?: string;
  targetSizeUsd?: number;
};

type SnapshotRow = {
  id: string;
  token_id: string;
  market_slug: string | null;
  opportunity_id: string | null;
  source: string;
  bids_json: string;
  asks_json: string;
  best_bid: number | null;
  best_ask: number | null;
  checksum: string | null;
  captured_at: number;
};

const Database = require("better-sqlite3") as DatabaseConstructor;

export function buildForwardReplayReport(input: {
  dbPath: string;
  generatedAt: string;
  snapshots: SnapshotReplayRow[];
  targetSizeUsd: number;
}): ForwardReplayReport {
  const sortedSnapshots = normalizeSnapshotBestBidAsk(input.snapshots).sort(
    (left, right) => left.capturedAt - right.capturedAt
  );
  const tokens = [...groupByToken(sortedSnapshots).entries()]
    .map(([tokenId, snapshots]) =>
      buildTokenReplayMetrics(tokenId, snapshots, input.targetSizeUsd)
    )
    .sort(compareTokenReplayMetrics);
  const latestMoves = tokens
    .map((token) => token.latestMarkToBidMove)
    .filter(isFiniteNumber);
  const bestMoves = tokens
    .map((token) => token.bestMarkToBidMove)
    .filter(isFiniteNumber);
  const firstCapturedAt = sortedSnapshots.at(0)?.capturedAt ?? null;
  const lastCapturedAt = sortedSnapshots.at(-1)?.capturedAt ?? null;

  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    targetSizeUsd: input.targetSizeUsd,
    snapshotCount: sortedSnapshots.length,
    uniqueTokens: tokens.length,
    uniqueMarkets: new Set(
      sortedSnapshots
        .map((snapshot) => snapshot.marketSlug)
        .filter((slug): slug is string => typeof slug === "string")
    ).size,
    firstCapturedAt,
    lastCapturedAt,
    collectionDurationMinutes:
      firstCapturedAt === null || lastCapturedAt === null
        ? null
        : roundMinutes((lastCapturedAt - firstCapturedAt) / 60_000),
    duplicateChecksums: countDuplicateChecksums(sortedSnapshots),
    tokensFillableAtTarget: tokens.filter(
      (token) => token.firstAverageEntryAsk !== null
    ).length,
    tokensWithPositiveLatestBidMove: latestMoves.filter((move) => move > 0)
      .length,
    tokensWithNegativeLatestBidMove: latestMoves.filter((move) => move < 0)
      .length,
    tokensWithPositiveBestBidMove: bestMoves.filter((move) => move > 0).length,
    averageLatestMarkToBidMove: average(latestMoves),
    averageBestMarkToBidMove: average(bestMoves),
    tokens
  };
}

export function renderForwardReplayMarkdown(
  report: ForwardReplayReport
): string {
  return [
    `# Forward Orderbook Replay - ${report.generatedAt.slice(0, 10)}`,
    "",
    `Database: \`${report.dbPath}\``,
    `Target paper size: ${formatUsd(report.targetSizeUsd)}`,
    "",
    "## Summary",
    "",
    `- Snapshots: ${report.snapshotCount}`,
    `- Unique tokens: ${report.uniqueTokens}`,
    `- Unique markets: ${report.uniqueMarkets}`,
    `- First snapshot: ${formatTimestamp(report.firstCapturedAt)}`,
    `- Last snapshot: ${formatTimestamp(report.lastCapturedAt)}`,
    `- Collection window: ${formatNullableNumber(report.collectionDurationMinutes)} minutes`,
    `- Duplicate checksums: ${report.duplicateChecksums}`,
    `- Tokens fillable at target size: ${report.tokensFillableAtTarget}`,
    `- Tokens with positive latest mark-to-bid move: ${report.tokensWithPositiveLatestBidMove}`,
    `- Tokens with negative latest mark-to-bid move: ${report.tokensWithNegativeLatestBidMove}`,
    `- Tokens with positive best mark-to-bid move during window: ${report.tokensWithPositiveBestBidMove}`,
    `- Average latest mark-to-bid move: ${formatBps(report.averageLatestMarkToBidMove)}`,
    `- Average best mark-to-bid move: ${formatBps(report.averageBestMarkToBidMove)}`,
    "",
    "## Top Replay Windows",
    "",
    renderTokenTable(report.tokens.slice(0, 20)),
    "",
    "## Interpretation",
    "",
    "- This is a forward replay over locally captured orderbook snapshots only.",
    "- `firstAverageEntryAsk` is the simulated paper entry cost for the configured target size from the first stored snapshot per token.",
    "- `latestMarkToBidMove` and `bestMarkToBidMove` are quote movements versus that entry ask; they are not realized PnL and not a strategy verdict.",
    "- Resolution, fees, slippage beyond stored depth, queue position, and actual fills are not inferred.",
    "- Tokens without enough ask depth at the target size are treated as unfillable for replay entry.",
    "",
    "## Safety Notes",
    "",
    "- Read-only local SQLite report.",
    "- No live trading, no orders, no private keys, no secrets.",
    "- No unresolved paper trade is converted into a win rate or PnL claim.",
    ""
  ].join("\n");
}

export function runForwardReplayReport(
  options: RunOptions = {}
): ForwardReplayReport {
  const dbPath = resolve(options.dbPath ?? "logs/trades.db");
  const reportDate = options.reportDate ?? formatDate(new Date());
  const targetSizeUsd = options.targetSizeUsd ?? 1;
  const generatedAt = new Date().toISOString();

  if (!existsSync(dbPath)) {
    const report = buildForwardReplayReport({
      dbPath,
      generatedAt,
      snapshots: [],
      targetSizeUsd
    });

    writeReports(reportDate, report);
    return report;
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const snapshots = tableExists(db, "orderbook_snapshots")
      ? loadSnapshots(db)
      : [];
    const report = buildForwardReplayReport({
      dbPath,
      generatedAt,
      snapshots,
      targetSizeUsd
    });

    writeReports(reportDate, report);
    return report;
  } finally {
    db.close();
  }
}

function buildTokenReplayMetrics(
  tokenId: string,
  snapshots: SnapshotReplayRow[],
  targetSizeUsd: number
): TokenReplayMetrics {
  const sorted = [...snapshots].sort(
    (left, right) => left.capturedAt - right.capturedAt
  );
  const first = sorted[0];
  const last = sorted.at(-1) ?? first;
  const walkResults = sorted.map((snapshot) =>
    walkAsksForSize(
      {
        tokenId,
        bids: snapshot.bids,
        asks: snapshot.asks
      },
      targetSizeUsd
    )
  );
  const firstWalk = walkResults[0];
  const firstAverageEntryAsk =
    firstWalk?.fillable === true ? firstWalk.averageFillPrice : null;
  const bestBidValues = sorted.map((snapshot) => snapshot.bestBid).filter(isFiniteNumber);
  const bestAskValues = sorted.map((snapshot) => snapshot.bestAsk).filter(isFiniteNumber);
  const spreads = sorted
    .map((snapshot) =>
      snapshot.bestBid !== null && snapshot.bestAsk !== null
        ? snapshot.bestAsk - snapshot.bestBid
        : null
    )
    .filter(isFiniteNumber);
  const maxFillableUsdValues = walkResults.map((result) => result.maxFillableUsd);
  const latestMid =
    last.bestBid === null || last.bestAsk === null
      ? null
      : (last.bestBid + last.bestAsk) / 2;
  const latestMarkToBidMove =
    firstAverageEntryAsk === null || last.bestBid === null
      ? null
      : roundPrice(last.bestBid - firstAverageEntryAsk);
  const latestMarkToMidMove =
    firstAverageEntryAsk === null || latestMid === null
      ? null
      : roundPrice(latestMid - firstAverageEntryAsk);
  const maxBestBid = maxOrNull(bestBidValues);
  const bestMarkToBidMove =
    firstAverageEntryAsk === null || maxBestBid === null
      ? null
      : roundPrice(maxBestBid - firstAverageEntryAsk);

  return {
    tokenId,
    marketSlug: first.marketSlug,
    snapshots: sorted.length,
    firstCapturedAt: first.capturedAt,
    lastCapturedAt: last.capturedAt,
    durationMinutes: roundMinutes((last.capturedAt - first.capturedAt) / 60_000),
    firstBestBid: first.bestBid,
    firstBestAsk: first.bestAsk,
    firstAverageEntryAsk,
    lastBestBid: last.bestBid,
    lastBestAsk: last.bestAsk,
    minBestAsk: minOrNull(bestAskValues),
    maxBestBid,
    averageSpread: average(spreads),
    averageMaxFillableUsd: average(maxFillableUsdValues) ?? 0,
    minMaxFillableUsd: minOrNull(maxFillableUsdValues) ?? 0,
    fillableSnapshots: walkResults.filter((result) => result.fillable).length,
    fillableRate:
      walkResults.length === 0
        ? 0
        : roundRatio(
            walkResults.filter((result) => result.fillable).length /
              walkResults.length
          ),
    latestMarkToBidMove,
    latestMarkToMidMove,
    bestMarkToBidMove
  };
}

function loadSnapshots(db: SqliteDatabase): SnapshotReplayRow[] {
  return db
    .prepare<SnapshotRow>(
      `
      SELECT
        id,
        token_id,
        market_slug,
        opportunity_id,
        source,
        bids_json,
        asks_json,
        best_bid,
        best_ask,
        checksum,
        captured_at
      FROM orderbook_snapshots
      ORDER BY captured_at ASC
      `
    )
    .all()
    .map(mapSnapshotRow);
}

function mapSnapshotRow(row: SnapshotRow): SnapshotReplayRow {
  return {
    id: row.id,
    tokenId: row.token_id,
    marketSlug: row.market_slug,
    opportunityId: row.opportunity_id,
    source: row.source,
    bids: parseLevels(row.bids_json),
    asks: parseLevels(row.asks_json),
    bestBid: row.best_bid,
    bestAsk: row.best_ask,
    checksum: row.checksum,
    capturedAt: row.captured_at
  };
}

function parseLevels(value: string): OrderBookLevel[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((level): OrderBookLevel[] => {
      if (
        typeof level === "object" &&
        level !== null &&
        "price" in level &&
        "size" in level
      ) {
        const price = Number(level.price);
        const size = Number(level.size);

        if (
          Number.isFinite(price) &&
          price > 0 &&
          price < 1 &&
          Number.isFinite(size) &&
          size > 0
        ) {
          return [
            {
              price,
              size
            }
          ];
        }
      }

      return [];
    });
  } catch {
    return [];
  }
}

function groupByToken(
  snapshots: SnapshotReplayRow[]
): Map<string, SnapshotReplayRow[]> {
  const groups = new Map<string, SnapshotReplayRow[]>();

  for (const snapshot of snapshots) {
    const existing = groups.get(snapshot.tokenId) ?? [];

    existing.push(snapshot);
    groups.set(snapshot.tokenId, existing);
  }

  return groups;
}

function compareTokenReplayMetrics(
  left: TokenReplayMetrics,
  right: TokenReplayMetrics
): number {
  const leftMove = left.bestMarkToBidMove ?? Number.NEGATIVE_INFINITY;
  const rightMove = right.bestMarkToBidMove ?? Number.NEGATIVE_INFINITY;

  if (leftMove !== rightMove) {
    return rightMove - leftMove;
  }

  return right.snapshots - left.snapshots;
}

function countDuplicateChecksums(snapshots: SnapshotReplayRow[]): number {
  const counts = new Map<string, number>();

  for (const snapshot of snapshots) {
    if (snapshot.checksum) {
      counts.set(snapshot.checksum, (counts.get(snapshot.checksum) ?? 0) + 1);
    }
  }

  return [...counts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );
}

function writeReports(reportDate: string, report: ForwardReplayReport): void {
  const reportBasePath = resolve("docs", "reports", `forward-replay-${reportDate}`);

  mkdirSync(dirname(reportBasePath), { recursive: true });
  writeFileSync(
    `${reportBasePath}.md`,
    renderForwardReplayMarkdown(report),
    "utf8"
  );
  writeFileSync(`${reportBasePath}.json`, JSON.stringify(report, null, 2), "utf8");
  console.log(renderForwardReplayMarkdown(report));
  console.log(`Report written to: ${reportBasePath}.md`);
  console.log(`Report written to: ${reportBasePath}.json`);
}

function renderTokenTable(rows: TokenReplayMetrics[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Market | Token | Snapshots | Window Min | Entry Ask | Last Bid | Last Ask | Latest Bid Move | Best Bid Move | Fillable Rate | Avg Depth USD | Min Depth USD | Avg Spread |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.marketSlug ?? "")} | ${shortToken(row.tokenId)} | ${row.snapshots} | ${formatNumber(row.durationMinutes)} | ${formatNumber(row.firstAverageEntryAsk)} | ${formatNumber(row.lastBestBid)} | ${formatNumber(row.lastBestAsk)} | ${formatBps(row.latestMarkToBidMove)} | ${formatBps(row.bestMarkToBidMove)} | ${formatPercent(row.fillableRate)} | ${formatNumber(row.averageMaxFillableUsd)} | ${formatNumber(row.minMaxFillableUsd)} | ${formatBps(row.averageSpread)} |`
    )
  ].join("\n");
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  return (
    db
      .prepare<CountRow>(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(tableName)?.count === 1
  );
}

function getSnapshotBestBidAsk(snapshot: SnapshotReplayRow): {
  bestBid: number | null;
  bestAsk: number | null;
} {
  if (snapshot.bestBid !== null || snapshot.bestAsk !== null) {
    return {
      bestBid: snapshot.bestBid,
      bestAsk: snapshot.bestAsk
    };
  }

  return getBestBidAsk({
    tokenId: snapshot.tokenId,
    bids: snapshot.bids,
    asks: snapshot.asks
  });
}

function normalizeSnapshotBestBidAsk(
  snapshots: SnapshotReplayRow[]
): SnapshotReplayRow[] {
  return snapshots.map((snapshot) => {
    const best = getSnapshotBestBidAsk(snapshot);

    return {
      ...snapshot,
      bestBid: best.bestBid,
      bestAsk: best.bestAsk
    };
  });
}

function average(values: number[]): number | null {
  const finite = values.filter(isFiniteNumber);

  if (finite.length === 0) {
    return null;
  }

  return roundPrice(finite.reduce((sum, value) => sum + value, 0) / finite.length);
}

function minOrNull(values: number[]): number | null {
  const finite = values.filter(isFiniteNumber);

  return finite.length === 0 ? null : roundPrice(Math.min(...finite));
}

function maxOrNull(values: number[]): number | null {
  const finite = values.filter(isFiniteNumber);

  return finite.length === 0 ? null : roundPrice(Math.max(...finite));
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMinutes(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function formatTimestamp(value: number | null): string {
  return value === null ? "n/a" : new Date(value).toISOString();
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "n/a" : formatNumber(value);
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(6);
}

function formatBps(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${(value * 10_000).toFixed(2)} bps`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function shortToken(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): RunOptions {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const sizeArg = argv.find((arg) => arg.startsWith("--size-usd="));
  const targetSizeUsd =
    sizeArg === undefined ? undefined : Number(sizeArg.slice("--size-usd=".length));

  if (
    targetSizeUsd !== undefined &&
    (!Number.isFinite(targetSizeUsd) || targetSizeUsd <= 0)
  ) {
    throw new Error("--size-usd must be a positive number.");
  }

  return {
    dbPath: dbArg?.slice("--db=".length),
    targetSizeUsd
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  try {
    runForwardReplayReport(parseArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`forward replay report failed: ${message}`);
    process.exitCode = 1;
  }
}
