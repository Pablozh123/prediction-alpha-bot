import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { calculateNegRiskBasketSizing } from "../scanner/basketSizing.js";
import {
  walkBidsForShares,
  type OrderBook,
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

export type BasketReplayMode = "linked" | "unlinked" | "both";

export type BasketReplaySnapshot = {
  id: string;
  tokenId: string;
  marketSlug: string | null;
  eventSlug: string | null;
  marketId: string | null;
  side: "YES" | "NO" | null;
  opportunityId: string | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  capturedAt: number;
};

export type BasketReplayOpportunity = {
  id: string;
  strategy: string;
  slug: string | null;
  timestamp: number;
};

export type BasketReplayLeg = {
  opportunityId: string;
  slug: string | null;
  tokenId: string;
  legIndex: number;
};

export type BasketReplayRow = {
  mode: "linked" | "unlinked";
  status: "replayed" | "skipped";
  reason: string;
  opportunityId: string | null;
  eventSlug: string | null;
  legCount: number;
  entryCapturedAt: number | null;
  latestExitCapturedAt: number | null;
  basketSizeShares: number | null;
  basketCostUsd: number | null;
  basketPayoutUsd: number | null;
  basketProfitUsd: number | null;
  edgeBps: number | null;
  roiBps: number | null;
  maxPositiveBasketShares: number | null;
  maxPositiveBasketCostUsd: number | null;
  latestBidExitUsd: number | null;
  latestMarkToBidPnlUsd: number | null;
  latestMarkToBidRoiBps: number | null;
};

export type BasketForwardReplayReport = {
  generatedAt: string;
  dbPath: string;
  mode: BasketReplayMode;
  maxSnapshotStalenessMs: number;
  rows: BasketReplayRow[];
  summary: {
    total: number;
    replayed: number;
    skipped: number;
    linked: number;
    unlinked: number;
  };
};

type RunOptions = {
  dbPath?: string;
  mode?: BasketReplayMode;
  reportDate?: string;
  maxSnapshotStalenessMs?: number;
};

type SnapshotRow = {
  id: string;
  token_id: string;
  market_slug: string | null;
  event_slug: string | null;
  market_id: string | null;
  side: "YES" | "NO" | null;
  opportunity_id: string | null;
  bids_json: string;
  asks_json: string;
  captured_at: number;
};

type OpportunityRow = {
  id: string;
  strategy: string;
  slug: string | null;
  timestamp: number;
};

type LegRow = {
  opportunity_id: string;
  slug: string | null;
  token_id: string;
  leg_index: number;
};

type ColumnRow = {
  name: string;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const NEG_RISK_BRACKET_STRATEGY = "neg_risk_bracket_arb";
const DEFAULT_MAX_STALENESS_MS = 600_000;

export function buildBasketForwardReplayReport(input: {
  dbPath: string;
  generatedAt: string;
  mode: BasketReplayMode;
  maxSnapshotStalenessMs?: number;
  opportunities: BasketReplayOpportunity[];
  legs: BasketReplayLeg[];
  snapshots: BasketReplaySnapshot[];
}): BasketForwardReplayReport {
  const maxSnapshotStalenessMs =
    input.maxSnapshotStalenessMs ?? DEFAULT_MAX_STALENESS_MS;
  const rows: BasketReplayRow[] = [];

  if (input.mode === "linked" || input.mode === "both") {
    rows.push(
      ...buildLinkedReplayRows({
        maxSnapshotStalenessMs,
        opportunities: input.opportunities,
        legs: input.legs,
        snapshots: input.snapshots
      })
    );
  }

  if (input.mode === "unlinked" || input.mode === "both") {
    rows.push(
      ...buildUnlinkedReplayRows({
        maxSnapshotStalenessMs,
        snapshots: input.snapshots
      })
    );
  }

  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    mode: input.mode,
    maxSnapshotStalenessMs,
    rows,
    summary: {
      total: rows.length,
      replayed: rows.filter((row) => row.status === "replayed").length,
      skipped: rows.filter((row) => row.status === "skipped").length,
      linked: rows.filter((row) => row.mode === "linked").length,
      unlinked: rows.filter((row) => row.mode === "unlinked").length
    }
  };
}

export function runBasketForwardReplayReport(
  options: RunOptions = {}
): BasketForwardReplayReport {
  const dbPath = resolve(options.dbPath ?? "logs/trades.db");
  const reportDate = options.reportDate ?? formatDate(new Date());
  const generatedAt = new Date().toISOString();
  const mode = options.mode ?? "linked";

  if (!existsSync(dbPath)) {
    const report = buildBasketForwardReplayReport({
      dbPath,
      generatedAt,
      mode,
      maxSnapshotStalenessMs: options.maxSnapshotStalenessMs,
      opportunities: [],
      legs: [],
      snapshots: []
    });

    writeReports(reportDate, report);
    return report;
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const opportunities = loadOpportunities(db);
    const linkedLegs =
      mode === "linked" || mode === "both"
        ? loadLegs(
            db,
            opportunities.map((opportunity) => opportunity.id)
          )
        : [];
    const snapshots = loadSnapshotsForMode(db, {
      mode,
      opportunityIds: opportunities.map((opportunity) => opportunity.id),
      tokenIds: linkedLegs.map((leg) => leg.tokenId)
    });

    const report = buildBasketForwardReplayReport({
      dbPath,
      generatedAt,
      mode,
      maxSnapshotStalenessMs: options.maxSnapshotStalenessMs,
      opportunities,
      legs: linkedLegs,
      snapshots
    });

    writeReports(reportDate, report);
    return report;
  } finally {
    db.close();
  }
}

function buildLinkedReplayRows(input: {
  opportunities: BasketReplayOpportunity[];
  legs: BasketReplayLeg[];
  snapshots: BasketReplaySnapshot[];
  maxSnapshotStalenessMs: number;
}): BasketReplayRow[] {
  return input.opportunities.map((opportunity) => {
    const legs = input.legs.filter((leg) => leg.opportunityId === opportunity.id);
    const opportunitySnapshots = input.snapshots.filter(
      (snapshot) => snapshot.opportunityId === opportunity.id
    );

    return replayBasket({
      mode: "linked",
      opportunityId: opportunity.id,
      eventSlug: opportunity.slug,
      legs: legs.map((leg) => ({
        tokenId: leg.tokenId,
        slug: leg.slug ?? opportunity.slug ?? "unknown"
      })),
      entrySnapshots: opportunitySnapshots,
      allSnapshots: input.snapshots,
      maxSnapshotStalenessMs: input.maxSnapshotStalenessMs,
      skippedReasonPrefix: ""
    });
  });
}

function buildUnlinkedReplayRows(input: {
  snapshots: BasketReplaySnapshot[];
  maxSnapshotStalenessMs: number;
}): BasketReplayRow[] {
  const groups = new Map<string, BasketReplaySnapshot[]>();

  for (const snapshot of input.snapshots) {
    if (!snapshot.eventSlug || snapshot.side !== "NO") {
      continue;
    }

    const existing = groups.get(snapshot.eventSlug) ?? [];

    existing.push(snapshot);
    groups.set(snapshot.eventSlug, existing);
  }

  return [...groups.entries()].flatMap(([eventSlug, snapshots]) => {
    const latestByToken = new Map<string, BasketReplaySnapshot>();

    for (const snapshot of snapshots) {
      const current = latestByToken.get(snapshot.tokenId);

      if (!current || snapshot.capturedAt > current.capturedAt) {
        latestByToken.set(snapshot.tokenId, snapshot);
      }
    }

    const legs = [...latestByToken.values()].map((snapshot) => ({
      tokenId: snapshot.tokenId,
      slug: snapshot.marketSlug ?? eventSlug
    }));

    if (legs.length < 3) {
      return [];
    }

    return [
      replayBasket({
        mode: "unlinked",
        opportunityId: null,
        eventSlug,
        legs,
        entrySnapshots: [...latestByToken.values()],
        allSnapshots: input.snapshots,
        maxSnapshotStalenessMs: input.maxSnapshotStalenessMs,
        skippedReasonPrefix: "experimental_unlinked_"
      })
    ];
  });
}

function replayBasket(input: {
  mode: "linked" | "unlinked";
  opportunityId: string | null;
  eventSlug: string | null;
  legs: Array<{ tokenId: string; slug: string }>;
  entrySnapshots: BasketReplaySnapshot[];
  allSnapshots: BasketReplaySnapshot[];
  maxSnapshotStalenessMs: number;
  skippedReasonPrefix: string;
}): BasketReplayRow {
  if (input.legs.length === 0) {
    return skippedRow(input, "missing_legs", 0);
  }

  const entrySnapshots = input.legs.map((leg) =>
    selectEntrySnapshot(leg.tokenId, input.entrySnapshots)
  );

  if (entrySnapshots.some((snapshot) => snapshot === undefined)) {
    return skippedRow(input, `${input.skippedReasonPrefix}missing_leg_snapshot`);
  }

  const concreteEntrySnapshots = entrySnapshots.filter(
    (snapshot): snapshot is BasketReplaySnapshot => snapshot !== undefined
  );

  if (snapshotWindowMs(concreteEntrySnapshots) > input.maxSnapshotStalenessMs) {
    return skippedRow(input, `${input.skippedReasonPrefix}stale_leg_snapshot`);
  }

  const sizing = calculateNegRiskBasketSizing(
    input.legs.map((leg) => {
      const snapshot = concreteEntrySnapshots.find(
        (candidate) => candidate.tokenId === leg.tokenId
      );

      return {
        tokenId: leg.tokenId,
        slug: leg.slug,
        orderbook: snapshot ? snapshotToOrderBook(snapshot) : undefined
      };
    })
  );

  if (!sizing) {
    return skippedRow(input, `${input.skippedReasonPrefix}non_positive_basket_edge`);
  }

  const entryCapturedAt = Math.max(
    ...concreteEntrySnapshots.map((snapshot) => snapshot.capturedAt)
  );
  const latestExit = latestCommonExit({
    allSnapshots: input.allSnapshots,
    afterCapturedAt: entryCapturedAt,
    maxSnapshotStalenessMs: input.maxSnapshotStalenessMs,
    shares: sizing.basketSizeShares,
    tokenIds: input.legs.map((leg) => leg.tokenId)
  });

  return {
    mode: input.mode,
    status: "replayed",
    reason:
      input.mode === "unlinked"
        ? "experimental_unlinked_limited_coverage"
        : "linked_replay",
    opportunityId: input.opportunityId,
    eventSlug: input.eventSlug,
    legCount: input.legs.length,
    entryCapturedAt,
    latestExitCapturedAt: latestExit?.capturedAt ?? null,
    basketSizeShares: sizing.basketSizeShares,
    basketCostUsd: sizing.basketCostUsd,
    basketPayoutUsd: sizing.basketPayoutUsd,
    basketProfitUsd: sizing.basketProfitUsd,
    edgeBps: sizing.edgeBps,
    roiBps: sizing.roiBps,
    maxPositiveBasketShares: sizing.maxPositiveBasketShares,
    maxPositiveBasketCostUsd: sizing.maxPositiveBasketCostUsd,
    latestBidExitUsd: latestExit?.exitUsd ?? null,
    latestMarkToBidPnlUsd:
      latestExit === null ? null : roundUsd(latestExit.exitUsd - sizing.basketCostUsd),
    latestMarkToBidRoiBps:
      latestExit === null
        ? null
        : roundBps(((latestExit.exitUsd - sizing.basketCostUsd) / sizing.basketCostUsd) * 10_000)
  };
}

function latestCommonExit(input: {
  allSnapshots: BasketReplaySnapshot[];
  afterCapturedAt: number;
  tokenIds: string[];
  shares: number;
  maxSnapshotStalenessMs: number;
}): { capturedAt: number; exitUsd: number } | null {
  const snapshots = input.tokenIds.map((tokenId) =>
    input.allSnapshots
      .filter(
        (snapshot) =>
          snapshot.tokenId === tokenId &&
          snapshot.capturedAt > input.afterCapturedAt
      )
      .sort((left, right) => right.capturedAt - left.capturedAt)[0]
  );

  if (snapshots.some((snapshot) => snapshot === undefined)) {
    return null;
  }

  const concrete = snapshots.filter(
    (snapshot): snapshot is BasketReplaySnapshot => snapshot !== undefined
  );

  if (snapshotWindowMs(concrete) > input.maxSnapshotStalenessMs) {
    return null;
  }

  let exitUsd = 0;

  for (const snapshot of concrete) {
    const walk = walkBidsForShares(snapshotToOrderBook(snapshot), input.shares);

    if (!walk.fillable) {
      return null;
    }

    exitUsd += walk.proceedsUsd;
  }

  return {
    capturedAt: Math.max(...concrete.map((snapshot) => snapshot.capturedAt)),
    exitUsd: roundUsd(exitUsd)
  };
}

function skippedRow(
  input: {
    mode: "linked" | "unlinked";
    opportunityId: string | null;
    eventSlug: string | null;
    legs: Array<{ tokenId: string; slug: string }>;
  },
  reason: string,
  legCount = input.legs.length
): BasketReplayRow {
  return {
    mode: input.mode,
    status: "skipped",
    reason,
    opportunityId: input.opportunityId,
    eventSlug: input.eventSlug,
    legCount,
    entryCapturedAt: null,
    latestExitCapturedAt: null,
    basketSizeShares: null,
    basketCostUsd: null,
    basketPayoutUsd: null,
    basketProfitUsd: null,
    edgeBps: null,
    roiBps: null,
    maxPositiveBasketShares: null,
    maxPositiveBasketCostUsd: null,
    latestBidExitUsd: null,
    latestMarkToBidPnlUsd: null,
    latestMarkToBidRoiBps: null
  };
}

function selectEntrySnapshot(
  tokenId: string,
  snapshots: BasketReplaySnapshot[]
): BasketReplaySnapshot | undefined {
  return snapshots
    .filter((snapshot) => snapshot.tokenId === tokenId)
    .sort((left, right) => left.capturedAt - right.capturedAt)[0];
}

function snapshotWindowMs(snapshots: BasketReplaySnapshot[]): number {
  const timestamps = snapshots.map((snapshot) => snapshot.capturedAt);

  return Math.max(...timestamps) - Math.min(...timestamps);
}

function snapshotToOrderBook(snapshot: BasketReplaySnapshot): OrderBook {
  return {
    tokenId: snapshot.tokenId,
    bids: snapshot.bids,
    asks: snapshot.asks
  };
}

function loadOpportunities(db: SqliteDatabase): BasketReplayOpportunity[] {
  if (!tableExists(db, "opportunities")) {
    return [];
  }

  return db
    .prepare<OpportunityRow>(
      `
      SELECT id, strategy, slug, timestamp
      FROM opportunities
      WHERE strategy = ?
        AND status = 'paper_fired'
      ORDER BY timestamp ASC
      `
    )
    .all(NEG_RISK_BRACKET_STRATEGY)
    .map((row) => ({
      id: row.id,
      strategy: row.strategy,
      slug: row.slug,
      timestamp: row.timestamp
    }));
}

function loadLegs(
  db: SqliteDatabase,
  opportunityIds?: string[]
): BasketReplayLeg[] {
  if (!tableExists(db, "opportunity_legs")) {
    return [];
  }

  if (opportunityIds !== undefined && opportunityIds.length === 0) {
    return [];
  }

  const whereClause =
    opportunityIds === undefined
      ? ""
      : `WHERE opportunity_id IN (${placeholders(opportunityIds.length)})`;

  return db
    .prepare<LegRow>(
      `
      SELECT opportunity_id, slug, token_id, leg_index
      FROM opportunity_legs
      ${whereClause}
      ORDER BY opportunity_id ASC, leg_index ASC
      `
    )
    .all(...(opportunityIds ?? []))
    .map((row) => ({
      opportunityId: row.opportunity_id,
      slug: row.slug,
      tokenId: row.token_id,
      legIndex: row.leg_index
    }));
}

function loadSnapshotsForMode(
  db: SqliteDatabase,
  input: {
    mode: BasketReplayMode;
    opportunityIds: string[];
    tokenIds: string[];
  }
): BasketReplaySnapshot[] {
  if (input.mode === "linked") {
    return loadLinkedSnapshots(db, input);
  }

  return loadSnapshots(db);
}

function loadLinkedSnapshots(
  db: SqliteDatabase,
  input: {
    opportunityIds: string[];
    tokenIds: string[];
  }
): BasketReplaySnapshot[] {
  if (!tableExists(db, "orderbook_snapshots")) {
    return [];
  }

  const uniqueOpportunityIds = [...new Set(input.opportunityIds)];
  const uniqueTokenIds = [...new Set(input.tokenIds)];

  if (uniqueOpportunityIds.length === 0 || uniqueTokenIds.length === 0) {
    return [];
  }

  if (!columnExists(db, "orderbook_snapshots", "opportunity_id")) {
    return loadSnapshots(
      db,
      `WHERE token_id IN (${placeholders(uniqueTokenIds.length)})`,
      uniqueTokenIds
    );
  }

  return loadSnapshots(
    db,
    `WHERE opportunity_id IN (${placeholders(uniqueOpportunityIds.length)})
      OR token_id IN (${placeholders(uniqueTokenIds.length)})`,
    [...uniqueOpportunityIds, ...uniqueTokenIds]
  );
}

function loadSnapshots(
  db: SqliteDatabase,
  whereClause = "",
  params: unknown[] = []
): BasketReplaySnapshot[] {
  if (!tableExists(db, "orderbook_snapshots")) {
    return [];
  }

  return db
    .prepare<SnapshotRow>(
      `
      SELECT
        id,
        token_id,
        market_slug,
        ${selectColumn(db, "orderbook_snapshots", "event_slug", "NULL")},
        ${selectColumn(db, "orderbook_snapshots", "market_id", "NULL")},
        ${selectColumn(db, "orderbook_snapshots", "side", "NULL")},
        ${selectColumn(db, "orderbook_snapshots", "opportunity_id", "NULL")},
        bids_json,
        asks_json,
        captured_at
      FROM orderbook_snapshots
      ${whereClause}
      ORDER BY captured_at ASC
      `
    )
    .all(...params)
    .map((row) => ({
      id: row.id,
      tokenId: row.token_id,
      marketSlug: row.market_slug,
      eventSlug: row.event_slug,
      marketId: row.market_id,
      side: row.side,
      opportunityId: row.opportunity_id,
      bids: parseLevels(row.bids_json),
      asks: parseLevels(row.asks_json),
      capturedAt: row.captured_at
    }));
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  return (
    db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(tableName) !== undefined
  );
}

function columnExists(
  db: SqliteDatabase,
  tableName: string,
  columnName: string
): boolean {
  if (!tableExists(db, tableName)) {
    return false;
  }

  return db
    .prepare<ColumnRow>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function selectColumn(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  fallbackSql: string
): string {
  return columnExists(db, tableName, columnName)
    ? columnName
    : `${fallbackSql} AS ${columnName}`;
}

function writeReports(reportDate: string, report: BasketForwardReplayReport): void {
  const basePath = resolve("docs", "reports", `basket-forward-replay-${reportDate}`);

  mkdirSync(dirname(basePath), { recursive: true });
  writeFileSync(`${basePath}.md`, renderBasketForwardReplayMarkdown(report), "utf8");
  writeFileSync(`${basePath}.json`, JSON.stringify(report, null, 2), "utf8");
  console.log(renderBasketForwardReplayMarkdown(report));
  console.log(`Report written to: ${basePath}.md`);
  console.log(`Report written to: ${basePath}.json`);
}

export function renderBasketForwardReplayMarkdown(
  report: BasketForwardReplayReport
): string {
  return [
    `# Basket Forward Replay - ${report.generatedAt.slice(0, 10)}`,
    "",
    `Database: \`${report.dbPath}\``,
    `Mode: ${report.mode}`,
    `Max snapshot staleness: ${report.maxSnapshotStalenessMs} ms`,
    "",
    "## Summary",
    "",
    `- Rows: ${report.summary.total}`,
    `- Replayed: ${report.summary.replayed}`,
    `- Skipped: ${report.summary.skipped}`,
    `- Linked rows: ${report.summary.linked}`,
    `- Unlinked experimental rows: ${report.summary.unlinked}`,
    "",
    "## Basket Replay Rows",
    "",
    renderReplayTable(report.rows),
    "",
    "## Interpretation",
    "",
    "- Formation metrics are calculated from ask-side basket construction.",
    "- Liquidation metrics are calculated from later bid-side exits.",
    "- Unlinked rows are experimental and may have incomplete basket coverage.",
    "- This report does not infer market resolution, win rate, or final PnL.",
    "",
    "## Safety Notes",
    "",
    "- Read-only local SQLite replay.",
    "- No live trading, no orders, no private keys, no secrets.",
    ""
  ].join("\n");
}

function renderReplayTable(rows: BasketReplayRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Mode | Status | Event/Slug | Legs | Entry | Edge bps | ROI bps | Cost | Profit | Max Positive Shares | Max Positive Cost | Latest Bid Exit | Latest Bid PnL | Reason |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map(
      (row) =>
        `| ${row.mode} | ${row.status} | ${escapeCell(row.eventSlug ?? row.opportunityId ?? "")} | ${row.legCount} | ${formatTimestamp(row.entryCapturedAt)} | ${formatNumber(row.edgeBps)} | ${formatNumber(row.roiBps)} | ${formatNumber(row.basketCostUsd)} | ${formatNumber(row.basketProfitUsd)} | ${formatNumber(row.maxPositiveBasketShares)} | ${formatNumber(row.maxPositiveBasketCostUsd)} | ${formatNumber(row.latestBidExitUsd)} | ${formatNumber(row.latestMarkToBidPnlUsd)} | ${escapeCell(row.reason)} |`
    )
  ].join("\n");
}

function parseLevels(value: string): OrderBookLevel[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((level): OrderBookLevel[] => {
      if (typeof level !== "object" || level === null || Array.isArray(level)) {
        return [];
      }

      const price = Number("price" in level ? level.price : Number.NaN);
      const size = Number("size" in level ? level.size : Number.NaN);

      return Number.isFinite(price) &&
        price > 0 &&
        price < 1 &&
        Number.isFinite(size) &&
        size > 0
        ? [{ price, size }]
        : [];
    });
  } catch {
    return [];
  }
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function roundBps(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(6);
}

function formatTimestamp(value: number | null): string {
  return value === null ? "n/a" : new Date(value).toISOString();
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): RunOptions {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const stalenessArg = argv.find((arg) => arg.startsWith("--staleness-ms="));
  const mode = modeArg?.slice("--mode=".length) as BasketReplayMode | undefined;
  const maxSnapshotStalenessMs =
    stalenessArg === undefined
      ? undefined
      : Number(stalenessArg.slice("--staleness-ms=".length));

  if (mode !== undefined && !["linked", "unlinked", "both"].includes(mode)) {
    throw new Error("--mode must be linked, unlinked, or both.");
  }

  if (
    maxSnapshotStalenessMs !== undefined &&
    (!Number.isFinite(maxSnapshotStalenessMs) || maxSnapshotStalenessMs <= 0)
  ) {
    throw new Error("--staleness-ms must be a positive number.");
  }

  return {
    dbPath: dbArg?.slice("--db=".length),
    mode,
    maxSnapshotStalenessMs
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
    runBasketForwardReplayReport(parseArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`basket forward replay failed: ${message}`);
    process.exitCode = 1;
  }
}
