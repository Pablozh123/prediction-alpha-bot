import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

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

type ColumnRow = {
  name: string;
};

type PaperTradeRow = {
  id: string;
  strategy: string;
  slug: string | null;
  side: string;
  size_usd: number;
  size_shares: number | null;
  entry_price: number;
  resolved: number;
  inflation_flagged: number;
  arb_class: string | null;
  timestamp: number;
};

type OpportunityRow = {
  id: string;
  strategy: string;
  slug: string | null;
  raw_edge: number | null;
  executable_edge: number | null;
  expected_resolution_at: number | null;
  duration_hours: number | null;
  capital_lock_class: string | null;
  status: string;
  reason: string | null;
  token_ids: string | null;
  timestamp: number;
};

type OpportunityStatusRow = {
  status: string;
  count: number;
};

type PaperDedupeSkipRow = {
  id: string;
  dedupe_key: string;
  strategy: string;
  slug: string | null;
  threshold: number | null;
  token_ids: string;
  previous_fire_at: number;
  skipped_at: number;
  cooldown_ms: number;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const dbPath = resolve(parseDbPath(process.argv.slice(2)) ?? process.env.DATABASE_PATH ?? "logs/trades.db");

if (!existsSync(dbPath)) {
  console.log(`Database: ${dbPath}`);
  console.log("Status: not found");
  console.log("paper_trades: 0");
  console.log("live_trades: 0");
  console.log("opportunities: 0");
  console.log("opportunity_legs: 0");
  console.log("orderbook_snapshots: 0");
  console.log("orderbook_token_blocks: 0");
  console.log("paper_dedupe_skips: 0");
  console.log("active_orderbook_token_blocks: 0");
  console.log("scanner_runs: 0");
  console.log("sports_ticks: 0");
  console.log("sports_slug_mappings: 0");
  console.log("sports_resolution_watch: 0");
  console.log("opportunities_by_status: {}");
  console.log("last 10 paper_trades: []");
  console.log("last 10 rejected opportunities: []");
  console.log("dedupe_key present: false");
  console.log("inflation_flagged present: false");
  console.log("exit_stamping_suspect present: false");
  console.log("opportunities table present: false");
  console.log("depth telemetry present: false");
  console.log("duration telemetry present: false");
  console.log("snapshot metadata present: false");
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

try {
  const paperTrades = countRows(db, "paper_trades");
  const liveTrades = countRows(db, "live_trades");
  const opportunities = countRows(db, "opportunities");
  const opportunityLegs = countRows(db, "opportunity_legs");
  const orderbookSnapshots = countRows(db, "orderbook_snapshots");
  const orderbookTokenBlocks = countRows(db, "orderbook_token_blocks");
  const paperDedupeSkips = countRows(db, "paper_dedupe_skips");
  const activeOrderbookTokenBlocks = countActiveOrderbookTokenBlocks(db);
  const scannerRuns = countRows(db, "scanner_runs");
  const sportsTicks = countRows(db, "sports_ticks");
  const sportsSlugMappings = countRows(db, "sports_slug_mappings");
  const sportsResolutionWatch = countRows(db, "sports_resolution_watch");
  const paperTradeColumns = getColumns(db, "paper_trades");
  const liveTradeColumns = getColumns(db, "live_trades");
  const dedupeColumns = getColumns(db, "paper_fire_dedup");
  const dedupeSkipColumns = getColumns(db, "paper_dedupe_skips");
  const opportunityColumns = getColumns(db, "opportunities");
  const snapshotColumns = getColumns(db, "orderbook_snapshots");
  const recentPaperTrades = db
    .prepare<PaperTradeRow>(
      `
      SELECT
        id,
        strategy,
        slug,
        side,
        size_usd,
        size_shares,
        entry_price,
        resolved,
        inflation_flagged,
        arb_class,
        timestamp
      FROM paper_trades
      ORDER BY timestamp DESC
      LIMIT 10
      `
    )
    .all();
  const recentRejectedOpportunities = tableExists(db, "opportunities")
    ? db
        .prepare<OpportunityRow>(
          `
          SELECT
            id,
            strategy,
            slug,
            raw_edge,
            executable_edge,
            expected_resolution_at,
            duration_hours,
            capital_lock_class,
            status,
            reason,
            token_ids,
            timestamp
          FROM opportunities
          WHERE status = 'rejected'
          ORDER BY timestamp DESC
          LIMIT 10
          `
        )
        .all()
    : [];
  const recentDedupeSkips = tableExists(db, "paper_dedupe_skips")
    ? db
        .prepare<PaperDedupeSkipRow>(
          `
          SELECT
            id,
            dedupe_key,
            strategy,
            slug,
            threshold,
            token_ids,
            previous_fire_at,
            skipped_at,
            cooldown_ms
          FROM paper_dedupe_skips
          ORDER BY skipped_at DESC
          LIMIT 10
          `
        )
        .all()
    : [];

  console.log(`Database: ${dbPath}`);
  console.log(`paper_trades: ${paperTrades}`);
  console.log(`live_trades: ${liveTrades}`);
  console.log(`opportunities: ${opportunities}`);
  console.log(`opportunity_legs: ${opportunityLegs}`);
  console.log(`orderbook_snapshots: ${orderbookSnapshots}`);
  console.log(`orderbook_token_blocks: ${orderbookTokenBlocks}`);
  console.log(`paper_dedupe_skips: ${paperDedupeSkips}`);
  console.log(`active_orderbook_token_blocks: ${activeOrderbookTokenBlocks}`);
  console.log(`scanner_runs: ${scannerRuns}`);
  console.log(`sports_ticks: ${sportsTicks}`);
  console.log(`sports_slug_mappings: ${sportsSlugMappings}`);
  console.log(`sports_resolution_watch: ${sportsResolutionWatch}`);
  console.log(
    `opportunities_by_status: ${JSON.stringify(countOpportunitiesByStatus(db))}`
  );
  console.log(
    `dedupe_key present: ${dedupeColumns.includes("dedupe_key")}`
  );
  console.log(
    `paper_dedupe_skips.dedupe_key present: ${dedupeSkipColumns.includes("dedupe_key")}`
  );
  console.log(
    `inflation_flagged present: ${paperTradeColumns.includes("inflation_flagged")}`
  );
  console.log(
    `exit_stamping_suspect present: ${liveTradeColumns.includes("exit_stamping_suspect")}`
  );
  console.log(
    `opportunities table present: ${opportunityColumns.includes("status")}`
  );
  console.log(
    `depth telemetry present: ${[
      "fillable_usd",
      "min_leg_depth_usd",
      "leg_count",
      "executable_sum",
      "fee_adjusted_edge"
    ].every((column) => opportunityColumns.includes(column))}`
  );
  console.log(
    `basket telemetry present: ${[
      "basket_size_shares",
      "basket_cost_usd",
      "basket_payout_usd",
      "basket_profit_usd",
      "edge_bps",
      "roi_bps",
      "max_positive_basket_shares",
      "max_positive_basket_cost_usd"
    ].every((column) => opportunityColumns.includes(column))}`
  );
  console.log(
    `duration telemetry present: ${[
      "expected_resolution_at",
      "duration_hours",
      "capital_lock_class"
    ].every((column) => opportunityColumns.includes(column))}`
  );
  console.log(`paper size_shares present: ${paperTradeColumns.includes("size_shares")}`);
  console.log(
    `snapshot metadata present: ${[
      "event_slug",
      "market_id",
      "side",
      "strategy_source"
    ].every((column) => snapshotColumns.includes(column))}`
  );
  console.log("last 10 paper_trades:");
  console.log(JSON.stringify(recentPaperTrades, null, 2));
  console.log("last 10 rejected opportunities:");
  console.log(JSON.stringify(recentRejectedOpportunities, null, 2));
  console.log("last 10 paper_dedupe_skips:");
  console.log(JSON.stringify(recentDedupeSkips, null, 2));
} finally {
  db.close();
}

function countActiveOrderbookTokenBlocks(db: SqliteDatabase): number {
  if (!tableExists(db, "orderbook_token_blocks")) {
    return 0;
  }

  return (
    db
      .prepare<CountRow>(
        "SELECT COUNT(*) AS count FROM orderbook_token_blocks WHERE skip_until > ?"
      )
      .get(Date.now())?.count ?? 0
  );
}

function countRows(db: SqliteDatabase, tableName: string): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return db.prepare<CountRow>(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
    ?.count ?? 0;
}

function getColumns(db: SqliteDatabase, tableName: string): string[] {
  if (!tableExists(db, tableName)) {
    return [];
  }

  return db
    .prepare<ColumnRow>(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  const row = db
    .prepare<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .get(tableName);

  return row !== undefined;
}

function countOpportunitiesByStatus(db: SqliteDatabase): Record<string, number> {
  if (!tableExists(db, "opportunities")) {
    return {};
  }

  return Object.fromEntries(
    db
      .prepare<OpportunityStatusRow>(
        `
        SELECT status, COUNT(*) AS count
        FROM opportunities
        GROUP BY status
        ORDER BY status
        `
      )
      .all()
      .map((row) => [row.status, row.count])
  );
}

function parseDbPath(argv: string[]): string | undefined {
  return argv
    .find((arg) => arg.startsWith("--db="))
    ?.slice("--db=".length);
}
