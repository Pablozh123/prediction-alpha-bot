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
  status: string;
  reason: string | null;
  token_ids: string | null;
  timestamp: number;
};

type OpportunityStatusRow = {
  status: string;
  count: number;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const dbPath = resolve("logs", "trades.db");

if (!existsSync(dbPath)) {
  console.log(`Database: ${dbPath}`);
  console.log("Status: not found");
  console.log("paper_trades: 0");
  console.log("live_trades: 0");
  console.log("opportunities: 0");
  console.log("opportunities_by_status: {}");
  console.log("last 10 paper_trades: []");
  console.log("last 10 rejected opportunities: []");
  console.log("dedupe_key present: false");
  console.log("inflation_flagged present: false");
  console.log("exit_stamping_suspect present: false");
  console.log("opportunities table present: false");
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

try {
  const paperTrades = countRows(db, "paper_trades");
  const liveTrades = countRows(db, "live_trades");
  const opportunities = countRows(db, "opportunities");
  const paperTradeColumns = getColumns(db, "paper_trades");
  const liveTradeColumns = getColumns(db, "live_trades");
  const dedupeColumns = getColumns(db, "paper_fire_dedup");
  const opportunityColumns = getColumns(db, "opportunities");
  const recentPaperTrades = db
    .prepare<PaperTradeRow>(
      `
      SELECT
        id,
        strategy,
        slug,
        side,
        size_usd,
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

  console.log(`Database: ${dbPath}`);
  console.log(`paper_trades: ${paperTrades}`);
  console.log(`live_trades: ${liveTrades}`);
  console.log(`opportunities: ${opportunities}`);
  console.log(
    `opportunities_by_status: ${JSON.stringify(countOpportunitiesByStatus(db))}`
  );
  console.log(
    `dedupe_key present: ${dedupeColumns.includes("dedupe_key")}`
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
  console.log("last 10 paper_trades:");
  console.log(JSON.stringify(recentPaperTrades, null, 2));
  console.log("last 10 rejected opportunities:");
  console.log(JSON.stringify(recentRejectedOpportunities, null, 2));
} finally {
  db.close();
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
