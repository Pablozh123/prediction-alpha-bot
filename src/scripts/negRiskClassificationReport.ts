import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyNegRiskOpportunityRecord,
  type NegRiskBasketClass,
  type NegRiskBasketClassification,
} from "../scanner/negRiskBasketClassifier.js";

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
  options?: { fileMustExist?: boolean; readonly?: boolean },
) => SqliteDatabase;

type OpportunityRow = {
  id: string;
  slug: string | null;
  status: string;
  reason: string | null;
  edge_bps: number | null;
  roi_bps: number | null;
  max_positive_basket_cost_usd: number | null;
  expected_resolution_at: number | null;
  duration_hours: number | null;
  capital_lock_class: string | null;
  timestamp: number;
};

type LegRow = {
  opportunity_id: string;
  question: string | null;
  slug: string | null;
};

type PaperTradeCountRow = {
  count: number;
  opportunity_id: string | null;
};

type ClassifiedOpportunity = OpportunityRow & {
  classification: NegRiskBasketClassification;
  linkedPaperTrades: number;
};

export type RunNegRiskClassificationReportOptions = {
  dbPath?: string;
  reportDate?: string;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const NEG_RISK_STRATEGY = "neg_risk_bracket_arb";

export function runNegRiskClassificationReport(
  options: RunNegRiskClassificationReportOptions = {},
): string {
  const reportDate = options.reportDate ?? formatDate(new Date());
  const dbPath = resolve(
    options.dbPath ??
      process.env.DATABASE_PATH ??
      `logs/forward-clean-${reportDate}.db`,
  );
  const reportPath = resolve(
    "docs",
    "reports",
    `neg-risk-classification-${reportDate}.md`,
  );

  if (!existsSync(dbPath)) {
    const report = [
      `# NEG_RISK Basket Classification - ${reportDate}`,
      "",
      `Database: \`${dbPath}\``,
      "",
      "Status: database not found.",
      "",
    ].join("\n");

    writeReport(report, reportPath);
    return report;
  }

  const db = new Database(dbPath, { fileMustExist: true, readonly: true });

  try {
    const opportunities = loadClassifiedOpportunities(db);
    const paperFires = opportunities.filter((row) => row.status === "paper_fired");
    const riskyPaperFires = paperFires.filter(
      (row) => row.classification.basketClass !== "clean_arb",
    );
    const report = renderReport({
      dbPath,
      opportunities,
      paperFires,
      reportDate,
      riskyPaperFires,
    });

    writeReport(report, reportPath);
    return report;
  } finally {
    db.close();
  }
}

function loadClassifiedOpportunities(db: SqliteDatabase): ClassifiedOpportunity[] {
  if (!tableExists(db, "opportunities")) {
    return [];
  }

  const opportunities = db
    .prepare<OpportunityRow>(
      `
      SELECT
        id,
        slug,
        status,
        reason,
        ${selectColumn(db, "opportunities", "edge_bps", "NULL")},
        ${selectColumn(db, "opportunities", "roi_bps", "NULL")},
        ${selectColumn(db, "opportunities", "max_positive_basket_cost_usd", "NULL")},
        ${selectColumn(db, "opportunities", "expected_resolution_at", "NULL")},
        ${selectColumn(db, "opportunities", "duration_hours", "NULL")},
        ${selectColumn(db, "opportunities", "capital_lock_class", "NULL")},
        timestamp
      FROM opportunities
      WHERE strategy = ?
      ORDER BY timestamp ASC
      `,
    )
    .all(NEG_RISK_STRATEGY);
  const legsByOpportunity = loadLegsByOpportunity(db);
  const paperTradeCounts = loadPaperTradeCounts(db);

  return opportunities.map((opportunity) => ({
    ...opportunity,
    classification: classifyNegRiskOpportunityRecord({
      eventSlug: opportunity.slug,
      expectedResolutionAt: opportunity.expected_resolution_at,
      legs: legsByOpportunity.get(opportunity.id) ?? [],
      nowMs: opportunity.timestamp,
      reason:
        opportunity.reason === "paper_trade_recorded"
          ? null
          : opportunity.reason,
    }),
    linkedPaperTrades: paperTradeCounts.get(opportunity.id) ?? 0,
  }));
}

function loadLegsByOpportunity(db: SqliteDatabase): Map<string, LegRow[]> {
  const rows = tableExists(db, "opportunity_legs")
    ? db
        .prepare<LegRow>(
          `
          SELECT opportunity_id, slug, question
          FROM opportunity_legs
          WHERE strategy = ?
          ORDER BY opportunity_id ASC, leg_index ASC
          `,
        )
        .all(NEG_RISK_STRATEGY)
    : [];
  const map = new Map<string, LegRow[]>();

  for (const row of rows) {
    const current = map.get(row.opportunity_id) ?? [];

    current.push(row);
    map.set(row.opportunity_id, current);
  }

  return map;
}

function loadPaperTradeCounts(db: SqliteDatabase): Map<string, number> {
  const rows =
    tableExists(db, "paper_trades") &&
    columnExists(db, "paper_trades", "opportunity_id")
      ? db
          .prepare<PaperTradeCountRow>(
            `
            SELECT opportunity_id, COUNT(*) AS count
            FROM paper_trades
            WHERE strategy = ?
              AND opportunity_id IS NOT NULL
            GROUP BY opportunity_id
            `,
          )
          .all(NEG_RISK_STRATEGY)
      : [];
  const map = new Map<string, number>();

  for (const row of rows) {
    if (row.opportunity_id) {
      map.set(row.opportunity_id, row.count);
    }
  }

  return map;
}

function renderReport(input: {
  dbPath: string;
  opportunities: ClassifiedOpportunity[];
  paperFires: ClassifiedOpportunity[];
  reportDate: string;
  riskyPaperFires: ClassifiedOpportunity[];
}): string {
  const classCounts = countByClass(input.opportunities);
  const paperClassCounts = countByClass(input.paperFires);
  const lines = [
    `# NEG_RISK Basket Classification - ${input.reportDate}`,
    "",
    `Database: \`${input.dbPath}\``,
    "",
    "## Summary",
    "",
    `- NEG_RISK opportunities: ${input.opportunities.length}`,
    `- NEG_RISK paper-fired baskets: ${input.paperFires.length}`,
    `- Risky legacy paper-fired baskets: ${input.riskyPaperFires.length}`,
    `- Linked NEG_RISK paper trades: ${sum(input.paperFires.map((row) => row.linkedPaperTrades))}`,
    `- Live trading used: no`,
    "",
    "## Classes",
    "",
    renderClassCountTable(classCounts),
    "",
    "## Paper-Fired Classes",
    "",
    renderClassCountTable(paperClassCounts),
    "",
    "## Risky Legacy Paper Fires",
    "",
    renderOpportunityTable(input.riskyPaperFires.slice(0, 40)),
    "",
    "## All NEG_RISK Baskets",
    "",
    renderOpportunityTable(input.opportunities.slice(-80).reverse()),
    "",
    "## Interpretation",
    "",
    "- `clean_arb`: one-winner or clear bucket structure with short-duration timing.",
    "- `duration_risk`: payoff can look clean, but capital lock is unknown or too long.",
    "- `directional_bucket`: nested dates, qualifiers, or multi-winner wording create residual directional risk.",
    "- `invalid_or_ambiguous`: structure, edge, capacity, spread, or metadata is not strong enough.",
    "- This report does not infer PnL, win rate, or resolution truth.",
    "",
    "## Safety",
    "",
    "- Read-only SQLite analysis.",
    "- No orders, no CLOB client, no wallet, no private keys.",
    "",
  ];

  return lines.join("\n");
}

function renderClassCountTable(rows: Map<NegRiskBasketClass, number>): string {
  const ordered: NegRiskBasketClass[] = [
    "clean_arb",
    "duration_risk",
    "directional_bucket",
    "invalid_or_ambiguous",
  ];

  return [
    "| Class | Count |",
    "| --- | ---: |",
    ...ordered.map((basketClass) => `| ${basketClass} | ${rows.get(basketClass) ?? 0} |`),
  ].join("\n");
}

function renderOpportunityTable(rows: ClassifiedOpportunity[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Class | Status | Slug | Reason | Why | Edge bps | ROI bps | Max Cost | Paper Legs | Timestamp |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) =>
      [
        row.classification.basketClass,
        row.status,
        row.slug ?? "",
        row.classification.reason,
        row.classification.explanation,
        formatNumber(row.edge_bps),
        formatNumber(row.roi_bps),
        formatNumber(row.max_positive_basket_cost_usd),
        String(row.linkedPaperTrades),
        String(row.timestamp),
      ]
        .map(escapeCell)
        .join(" | "),
    ).map((line) => `| ${line} |`),
  ].join("\n");
}

function countByClass(
  rows: ClassifiedOpportunity[],
): Map<NegRiskBasketClass, number> {
  const counts = new Map<NegRiskBasketClass, number>();

  for (const row of rows) {
    const basketClass = row.classification.basketClass;

    counts.set(basketClass, (counts.get(basketClass) ?? 0) + 1);
  }

  return counts;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function writeReport(report: string, reportPath: string): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, "utf8");
  console.log(report);
  console.log(`Report written to: ${reportPath}`);
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  return (
    db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(tableName) !== undefined
  );
}

function columnExists(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
): boolean {
  if (!tableExists(db, tableName)) {
    return false;
  }

  return db
    .prepare<{ name: string }>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function selectColumn(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  fallbackSql: string,
): string {
  return columnExists(db, tableName, columnName)
    ? columnName
    : `${fallbackSql} AS ${columnName}`;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(2);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): RunNegRiskClassificationReportOptions {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const dateArg = argv.find((arg) => arg.startsWith("--date="));
  const reportDate = dateArg?.slice("--date=".length);

  return {
    dbPath: dbArg?.slice("--db=".length) ??
      (reportDate ? `logs/forward-clean-${reportDate}.db` : undefined),
    reportDate,
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runNegRiskClassificationReport(parseArgs(process.argv.slice(2)));
}
