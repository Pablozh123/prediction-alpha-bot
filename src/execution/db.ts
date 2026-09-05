import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);

export type SqliteRunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

export type SqliteStatement<T = unknown> = {
  run(params?: Record<string, unknown>): SqliteRunResult;
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
};

export type SqliteDatabase = {
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): SqliteStatement<T>;
  close(): void;
};

type DatabaseConstructor = new (filename: string) => SqliteDatabase;

const Database = require("better-sqlite3") as DatabaseConstructor;

export const DEFAULT_DB_PATH = resolve(join("logs", "trades.db"));

let db: SqliteDatabase | undefined;
let activeDbPath: string | undefined;

const schema = `
CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  slug TEXT,
  question TEXT,
  token_id TEXT,
  opportunity_id TEXT,
  side TEXT NOT NULL,
  size_usd REAL NOT NULL,
  size_shares REAL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  resolved INTEGER DEFAULT 0,
  pnl REAL,
  inflation_flagged INTEGER DEFAULT 0,
  resolution_reason TEXT,
  arb_class TEXT,
  link_status TEXT,
  timestamp INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution_checked_at INTEGER
);

CREATE TABLE IF NOT EXISTS live_trades (
  id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  slug TEXT,
  question TEXT,
  token_id TEXT,
  side TEXT NOT NULL,
  size_usd REAL NOT NULL,
  entry_price REAL NOT NULL,
  actual_fill_price REAL,
  fill_status TEXT,
  exit_price REAL,
  resolved INTEGER DEFAULT 0,
  pnl REAL,
  exit_stamping_suspect INTEGER DEFAULT 0,
  arb_class TEXT,
  leg_group_id TEXT,
  leg_index INTEGER,
  timestamp INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS paper_fire_dedup (
  dedupe_key TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  event_slug TEXT NOT NULL,
  fired_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_fire_dedup_fired_at
ON paper_fire_dedup(fired_at);

CREATE TABLE IF NOT EXISTS paper_dedupe_skips (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL,
  strategy TEXT NOT NULL,
  slug TEXT,
  threshold REAL,
  token_ids TEXT NOT NULL,
  previous_fire_at INTEGER NOT NULL,
  skipped_at INTEGER NOT NULL,
  cooldown_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_dedupe_skips_strategy_skipped
ON paper_dedupe_skips(strategy, skipped_at);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  slug TEXT,
  raw_edge REAL,
  executable_edge REAL,
  fillable_usd REAL,
  min_leg_depth_usd REAL,
  leg_count INTEGER,
  executable_sum REAL,
  fee_adjusted_edge REAL,
  basket_size_shares REAL,
  basket_cost_usd REAL,
  basket_payout_usd REAL,
  basket_profit_usd REAL,
  edge_bps REAL,
  roi_bps REAL,
  max_positive_basket_shares REAL,
  max_positive_basket_cost_usd REAL,
  expected_resolution_at INTEGER,
  duration_hours REAL,
  capital_lock_class TEXT,
  opportunity_key TEXT,
  title TEXT,
  venues TEXT,
  category TEXT,
  gross_edge_bps REAL,
  net_edge_bps REAL,
  fee_usd REAL,
  capital_usd REAL,
  depth_usd REAL,
  days_to_resolution REAL,
  annualized_pct REAL,
  rule_match TEXT,
  rule_screen TEXT,
  rule_review TEXT,
  gate_failed INTEGER,
  net_profit_usd REAL,
  resolution_at_kalshi INTEGER,
  resolution_at_polymarket INTEGER,
  status TEXT NOT NULL,
  reason TEXT,
  token_ids TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status_timestamp
ON opportunities(status, timestamp);

CREATE TABLE IF NOT EXISTS cross_venue_pairs (
  pair_id TEXT PRIMARY KEY,
  title TEXT,
  kalshi_ticker TEXT NOT NULL,
  polymarket_slug TEXT NOT NULL,
  kalshi_title TEXT,
  polymarket_question TEXT,
  category TEXT,
  source TEXT NOT NULL,
  resolution_at_kalshi INTEGER,
  resolution_at_polymarket INTEGER,
  rule_screen TEXT,
  rule_screen_detail TEXT,
  rule_review TEXT,
  review_json TEXT,
  kalshi_rules_excerpt TEXT,
  polymarket_rules_excerpt TEXT,
  last_gross_cents REAL,
  last_net_cents REAL,
  last_annualized_pct REAL,
  last_executable_size REAL,
  last_status TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cross_venue_pairs_last_seen
ON cross_venue_pairs(last_seen_at);

CREATE TABLE IF NOT EXISTS opportunity_legs (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  slug TEXT,
  market_id TEXT,
  question TEXT,
  token_id TEXT NOT NULL,
  side TEXT NOT NULL,
  raw_yes_price REAL,
  average_fill_price REAL,
  max_fillable_usd REAL,
  best_bid REAL,
  best_ask REAL,
  spread REAL,
  fillable INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  venue TEXT,
  role TEXT,
  shares REAL,
  size_usd REAL,
  fee_usd REAL,
  leg_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunity_legs_opportunity_id
ON opportunity_legs(opportunity_id);

CREATE TABLE IF NOT EXISTS scan_cycles (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  success INTEGER NOT NULL,
  opportunities INTEGER NOT NULL,
  paper_trades INTEGER NOT NULL,
  skipped_duplicates INTEGER NOT NULL,
  rejected_opportunities INTEGER NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_cycles_timestamp
ON scan_cycles(timestamp);

CREATE TABLE IF NOT EXISTS scanner_runs (
  id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  raw_opportunities INTEGER NOT NULL,
  near_miss_opportunities INTEGER NOT NULL DEFAULT 0,
  validated_opportunities INTEGER NOT NULL DEFAULT 0,
  candidate_opportunities INTEGER NOT NULL DEFAULT 0,
  rejected_opportunities INTEGER NOT NULL DEFAULT 0,
  dedupe_skips INTEGER NOT NULL DEFAULT 0,
  paper_trades INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_scanner_runs_strategy_timestamp
ON scanner_runs(strategy, timestamp);

CREATE TABLE IF NOT EXISTS orderbook_snapshots (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  market_slug TEXT,
  event_slug TEXT,
  market_id TEXT,
  side TEXT,
  strategy_source TEXT,
  expected_resolution_at INTEGER,
  opportunity_id TEXT,
  source TEXT NOT NULL,
  bids_json TEXT NOT NULL,
  asks_json TEXT NOT NULL,
  best_bid REAL,
  best_ask REAL,
  checksum TEXT,
  captured_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orderbook_snapshots_token_captured
ON orderbook_snapshots(token_id, captured_at);

CREATE INDEX IF NOT EXISTS idx_orderbook_snapshots_opportunity
ON orderbook_snapshots(opportunity_id);

CREATE TABLE IF NOT EXISTS orderbook_token_blocks (
  token_id TEXT PRIMARY KEY,
  market_slug TEXT,
  reason TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 1,
  first_failed_at INTEGER NOT NULL,
  last_failed_at INTEGER NOT NULL,
  skip_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orderbook_token_blocks_skip_until
ON orderbook_token_blocks(skip_until);

CREATE TABLE IF NOT EXISTS sports_ticks (
  id TEXT PRIMARY KEY,
  sport TEXT,
  league TEXT,
  game_id TEXT,
  slug TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  home_score REAL,
  away_score REAL,
  status TEXT,
  ended INTEGER NOT NULL DEFAULT 0,
  finished_timestamp INTEGER,
  raw_json TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sports_ticks_slug_received
ON sports_ticks(slug, received_at);

CREATE TABLE IF NOT EXISTS sports_slug_mappings (
  id TEXT PRIMARY KEY,
  sports_slug TEXT NOT NULL,
  market_slug TEXT,
  event_slug TEXT,
  sport TEXT,
  home_team TEXT,
  away_team TEXT,
  away_outcome_index INTEGER,
  home_outcome_index INTEGER,
  away_token_id TEXT,
  home_token_id TEXT,
  mapping_status TEXT NOT NULL,
  reason TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sports_slug_mappings_slug
ON sports_slug_mappings(sports_slug, updated_at);

CREATE TABLE IF NOT EXISTS sports_resolution_watch (
  id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  sports_slug TEXT NOT NULL,
  market_slug TEXT,
  event_slug TEXT,
  winning_side TEXT,
  winning_team TEXT,
  winning_token_id TEXT,
  losing_token_id TEXT,
  home_team TEXT,
  away_team TEXT,
  final_score TEXT,
  market_price REAL,
  best_ask REAL,
  expected_edge REAL,
  validation_status TEXT NOT NULL,
  reason TEXT,
  opportunity_id TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sports_resolution_watch_timestamp
ON sports_resolution_watch(timestamp);
`;

export function initDb(databasePath = DEFAULT_DB_PATH): SqliteDatabase {
  const resolvedPath = resolve(databasePath);

  if (db && activeDbPath === resolvedPath) {
    return db;
  }

  if (db) {
    closeDb();
  }

  mkdirSync(dirname(resolvedPath), { recursive: true });

  db = new Database(resolvedPath);
  activeDbPath = resolvedPath;
  db.exec(schema);
  ensureColumn("paper_trades", "opportunity_id", "TEXT");
  ensureColumn("paper_trades", "size_shares", "REAL");
  ensureColumn("paper_trades", "resolution_reason", "TEXT");
  ensureColumn("paper_trades", "link_status", "TEXT");
  ensureColumn("paper_trades", "resolution_checked_at", "INTEGER");
  ensureColumn("opportunities", "fillable_usd", "REAL");
  ensureColumn("opportunities", "min_leg_depth_usd", "REAL");
  ensureColumn("opportunities", "leg_count", "INTEGER");
  ensureColumn("opportunities", "executable_sum", "REAL");
  ensureColumn("opportunities", "fee_adjusted_edge", "REAL");
  ensureColumn("opportunities", "basket_size_shares", "REAL");
  ensureColumn("opportunities", "basket_cost_usd", "REAL");
  ensureColumn("opportunities", "basket_payout_usd", "REAL");
  ensureColumn("opportunities", "basket_profit_usd", "REAL");
  ensureColumn("opportunities", "edge_bps", "REAL");
  ensureColumn("opportunities", "roi_bps", "REAL");
  ensureColumn("opportunities", "max_positive_basket_shares", "REAL");
  ensureColumn("opportunities", "max_positive_basket_cost_usd", "REAL");
  ensureColumn("opportunities", "expected_resolution_at", "INTEGER");
  ensureColumn("opportunities", "duration_hours", "REAL");
  ensureColumn("opportunities", "capital_lock_class", "TEXT");
  ensureColumn("opportunities", "opportunity_key", "TEXT");
  ensureColumn("opportunities", "title", "TEXT");
  ensureColumn("opportunities", "venues", "TEXT");
  ensureColumn("opportunities", "category", "TEXT");
  ensureColumn("opportunities", "gross_edge_bps", "REAL");
  ensureColumn("opportunities", "net_edge_bps", "REAL");
  ensureColumn("opportunities", "fee_usd", "REAL");
  ensureColumn("opportunities", "capital_usd", "REAL");
  ensureColumn("opportunities", "depth_usd", "REAL");
  ensureColumn("opportunities", "days_to_resolution", "REAL");
  ensureColumn("opportunities", "annualized_pct", "REAL");
  ensureColumn("opportunities", "rule_match", "TEXT");
  // Taxonomy columns of 2026-09-05 (docs/ARB_TAXONOMY.md): the two rule
  // fields that replace the single rule_match, the gate a rejection failed,
  // the dollar profit at the executable size and both venues' resolution
  // times for cross-venue rows.
  ensureColumn("opportunities", "rule_screen", "TEXT");
  ensureColumn("opportunities", "rule_review", "TEXT");
  ensureColumn("opportunities", "gate_failed", "INTEGER");
  ensureColumn("opportunities", "net_profit_usd", "REAL");
  ensureColumn("opportunities", "resolution_at_kalshi", "INTEGER");
  ensureColumn("opportunities", "resolution_at_polymarket", "INTEGER");
  // Created here, not in the base schema: on a database from before
  // 2026-09-04 the column only exists once ensureColumn has added it.
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_opportunities_key_timestamp ON opportunities(opportunity_key, timestamp)",
  );
  ensureColumn("opportunity_legs", "venue", "TEXT");
  ensureColumn("opportunity_legs", "role", "TEXT");
  ensureColumn("opportunity_legs", "shares", "REAL");
  ensureColumn("opportunity_legs", "size_usd", "REAL");
  ensureColumn("opportunity_legs", "fee_usd", "REAL");
  ensureColumn("scanner_runs", "dedupe_skips", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("scanner_runs", "near_miss_opportunities", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("scanner_runs", "candidate_opportunities", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("orderbook_snapshots", "event_slug", "TEXT");
  ensureColumn("orderbook_snapshots", "market_id", "TEXT");
  ensureColumn("orderbook_snapshots", "side", "TEXT");
  ensureColumn("orderbook_snapshots", "strategy_source", "TEXT");
  ensureColumn("orderbook_snapshots", "expected_resolution_at", "INTEGER");
  ensureColumn("sports_ticks", "league", "TEXT");
  ensureColumn("sports_resolution_watch", "opportunity_id", "TEXT");

  return db;
}

export function getDb(): SqliteDatabase {
  return db ?? initDb();
}

export function closeDb(): void {
  if (!db) {
    return;
  }

  db.close();
  db = undefined;
  activeDbPath = undefined;
}

function ensureColumn(
  tableName: string,
  columnName: string,
  columnDefinition: string
): void {
  if (!db) {
    return;
  }

  const hasColumn = db
    .prepare<{ name: string }>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}
