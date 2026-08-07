import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

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

type DbRow = {
  name: string;
};

type RejectedEventRow = {
  slug: string | null;
  rejection_count: number;
  avg_raw_edge: number | null;
  avg_executable_edge: number | null;
  avg_executable_sum: number | null;
  avg_fillable_usd: number | null;
  min_leg_depth_usd: number | null;
};

type OpportunityRow = {
  id: string;
  slug: string | null;
  raw_edge: number | null;
  executable_edge: number | null;
  executable_sum: number | null;
  fillable_usd: number | null;
  min_leg_depth_usd: number | null;
  reason: string | null;
  timestamp: number;
};

type OpportunityLegRow = {
  slug: string | null;
  question: string | null;
  token_id: string;
  side: string;
  raw_yes_price: number | null;
  average_fill_price: number | null;
  max_fillable_usd: number | null;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  fillable: number;
  reason: string | null;
  leg_index: number;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const dbPath = resolve("logs", "trades.db");
const reportDate = new Date().toISOString().slice(0, 10);
const reportPath = resolve(
  "docs",
  "reports",
  `neg-risk-diagnostics-${reportDate}.md`
);

if (!existsSync(dbPath)) {
  writeReport([
    `# NEG_RISK Diagnostics - ${reportDate}`,
    "",
    `Database: \`${dbPath}\``,
    "",
    "Status: database not found.",
    ""
  ]);
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

try {
  const report = renderDiagnostics(db);
  writeReport(report);
} finally {
  db.close();
}

function renderDiagnostics(db: SqliteDatabase): string[] {
  if (!tableExists(db, "opportunities")) {
    return [
      `# NEG_RISK Diagnostics - ${reportDate}`,
      "",
      `Database: \`${dbPath}\``,
      "",
      "Status: opportunities table not found.",
      ""
    ];
  }

  const events = db
    .prepare<RejectedEventRow>(
      `
      SELECT
        slug,
        COUNT(*) AS rejection_count,
        AVG(raw_edge) AS avg_raw_edge,
        AVG(executable_edge) AS avg_executable_edge,
        AVG(executable_sum) AS avg_executable_sum,
        AVG(fillable_usd) AS avg_fillable_usd,
        MIN(min_leg_depth_usd) AS min_leg_depth_usd
      FROM opportunities
      WHERE strategy = 'neg_risk_bracket_arb'
        AND status = 'rejected'
      GROUP BY slug
      ORDER BY rejection_count DESC, avg_executable_edge ASC
      LIMIT 20
      `
    )
    .all();

  const lines = [
    `# NEG_RISK Diagnostics - ${reportDate}`,
    "",
    `Database: \`${dbPath}\``,
    "",
    "## Top Rejected Events",
    "",
    renderEventTable(events),
    "",
    "## Event Details",
    ""
  ];

  if (events.length === 0) {
    lines.push("_No rejected NEG_RISK opportunities found._", "");
    return lines;
  }

  for (const event of events.slice(0, 10)) {
    const latest = getLatestRejectedOpportunity(db, event.slug);

    lines.push(`### ${event.slug ?? "unknown"}`, "");

    if (!latest) {
      lines.push("_No latest opportunity row found._", "");
      continue;
    }

    const legs = getLegs(db, latest.id);
    const rawYesSum = sumNullable(legs.map((leg) => leg.raw_yes_price));
    const noAskSum = sumNullable(legs.map((leg) => leg.average_fill_price));

    lines.push(
      `- Rejection reason: ${latest.reason ?? "unknown"}`,
      `- Raw YES sum: ${formatNumber(rawYesSum)}`,
      `- Executable NO ask sum: ${formatNumber(noAskSum)}`,
      `- Raw edge: ${formatNumber(latest.raw_edge)}`,
      `- Executable edge: ${formatNumber(latest.executable_edge)}`,
      `- Fillable USD: ${formatNumber(latest.fillable_usd)}`,
      `- Min leg depth USD: ${formatNumber(latest.min_leg_depth_usd)}`,
      ""
    );

    if (legs.length === 0) {
      lines.push(
        "_No leg telemetry recorded for this event yet. Run a clean forward scan after M15 to populate leg-level diagnostics._",
        ""
      );
      continue;
    }

    lines.push(renderLegTable(worstLegs(legs)), "");
  }

  lines.push(
    "## Notes",
    "",
    "- This report is read-only and does not place orders.",
    "- No PnL, win rate, or graduation decision is inferred.",
    "- Missing leg telemetry means the row was collected before the M15 schema upgrade.",
    ""
  );

  return lines;
}

function getLatestRejectedOpportunity(
  db: SqliteDatabase,
  slug: string | null
): OpportunityRow | undefined {
  return db
    .prepare<OpportunityRow>(
      `
      SELECT
        id,
        slug,
        raw_edge,
        executable_edge,
        executable_sum,
        fillable_usd,
        min_leg_depth_usd,
        reason,
        timestamp
      FROM opportunities
      WHERE strategy = 'neg_risk_bracket_arb'
        AND status = 'rejected'
        AND (${slug === null ? "slug IS NULL" : "slug = ?"})
      ORDER BY timestamp DESC
      LIMIT 1
      `
    )
    .get(...(slug === null ? [] : [slug]));
}

function getLegs(
  db: SqliteDatabase,
  opportunityId: string
): OpportunityLegRow[] {
  if (!tableExists(db, "opportunity_legs")) {
    return [];
  }

  return db
    .prepare<OpportunityLegRow>(
      `
      SELECT
        slug,
        question,
        token_id,
        side,
        raw_yes_price,
        average_fill_price,
        max_fillable_usd,
        best_bid,
        best_ask,
        spread,
        fillable,
        reason,
        leg_index
      FROM opportunity_legs
      WHERE opportunity_id = ?
      ORDER BY leg_index ASC
      `
    )
    .all(opportunityId);
}

function worstLegs(legs: OpportunityLegRow[]): OpportunityLegRow[] {
  return [...legs]
    .sort(
      (a, b) =>
        a.fillable - b.fillable ||
        (b.spread ?? Number.NEGATIVE_INFINITY) -
          (a.spread ?? Number.NEGATIVE_INFINITY) ||
        (a.max_fillable_usd ?? Number.POSITIVE_INFINITY) -
          (b.max_fillable_usd ?? Number.POSITIVE_INFINITY)
    )
    .slice(0, 8);
}

function renderEventTable(rows: RejectedEventRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Event | Rejections | Avg Raw Edge | Avg Executable Edge | Avg NO Ask Sum | Avg Fillable USD | Min Leg Depth USD |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.slug ?? "unknown")} | ${row.rejection_count} | ${formatNumber(row.avg_raw_edge)} | ${formatNumber(row.avg_executable_edge)} | ${formatNumber(row.avg_executable_sum)} | ${formatNumber(row.avg_fillable_usd)} | ${formatNumber(row.min_leg_depth_usd)} |`
    )
  ].join("\n");
}

function renderLegTable(rows: OpportunityLegRow[]): string {
  return [
    "| Leg | Side | Raw YES Price | Avg Fill Price | Best Bid | Best Ask | Spread | Max Fillable USD | Fillable | Reason |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.slug ?? row.token_id)} | ${escapeCell(row.side)} | ${formatNumber(row.raw_yes_price)} | ${formatNumber(row.average_fill_price)} | ${formatNumber(row.best_bid)} | ${formatNumber(row.best_ask)} | ${formatNumber(row.spread)} | ${formatNumber(row.max_fillable_usd)} | ${row.fillable === 1 ? "yes" : "no"} | ${escapeCell(row.reason ?? "")} |`
    )
  ].join("\n");
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  return (
    db
      .prepare<DbRow>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(tableName) !== undefined
  );
}

function sumNullable(values: Array<number | null>): number | null {
  const finite = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (finite.length === 0) {
    return null;
  }

  return round(finite.reduce((total, value) => total + value, 0));
}

function writeReport(lines: string[]): void {
  const report = lines.join("\n");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, "utf8");
  console.log(report);
  console.log(`Report written to: ${reportPath}`);
}

function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(6);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}
