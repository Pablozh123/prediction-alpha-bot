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
  entry_price REAL NOT NULL,
  exit_price REAL,
  resolved INTEGER DEFAULT 0,
  pnl REAL,
  inflation_flagged INTEGER DEFAULT 0,
  arb_class TEXT,
  timestamp INTEGER NOT NULL,
  resolved_at INTEGER
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

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  slug TEXT,
  raw_edge REAL,
  executable_edge REAL,
  status TEXT NOT NULL,
  reason TEXT,
  token_ids TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status_timestamp
ON opportunities(status, timestamp);

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
