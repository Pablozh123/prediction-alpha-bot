import "dotenv/config";
import { pathToFileURL } from "node:url";
import { closeDb, getDb, initDb } from "../execution/db.js";
import { setPaperTradeLink } from "../execution/tradeJournal.js";

/**
 * Join paper trades to the candidate that caused them, after the fact.
 *
 * 147 of the 167 trades from the May 2026 runs carry no opportunity_id. Where a
 * journaled candidate of the same strategy names the trade's token and was
 * written within the join window, the link is restored and marked
 * `backfilled`. Where none exists - the first trades predate the opportunity
 * journal by hours - the row is marked `legacy_unlinked` so it is excluded
 * from every resolved-sample figure instead of being silently counted.
 */

export const DEFAULT_LINK_WINDOW_MS = 10 * 60 * 1000;

export type BackfillPaperTradeLinksResult = {
  checked: number;
  backfilled: number;
  legacyUnlinked: number;
  alreadyLinked: number;
};

type UnlinkedRow = {
  id: string;
  strategy: string;
  token_id: string | null;
  timestamp: number;
  link_status: string | null;
};

type CandidateRow = {
  id: string;
  status: string;
  distance: number;
};

export function backfillPaperTradeLinks(
  options: { windowMs?: number } = {},
): BackfillPaperTradeLinksResult {
  const windowMs = options.windowMs ?? DEFAULT_LINK_WINDOW_MS;
  const db = getDb();
  const unlinked = db
    .prepare<UnlinkedRow>(
      `
      SELECT id, strategy, token_id, timestamp, link_status
      FROM paper_trades
      WHERE opportunity_id IS NULL OR TRIM(opportunity_id) = ''
      ORDER BY timestamp ASC
      `,
    )
    .all();
  const alreadyLinked =
    db
      .prepare<{ count: number }>(
        `
        SELECT COUNT(*) AS count
        FROM paper_trades
        WHERE opportunity_id IS NOT NULL AND TRIM(opportunity_id) != ''
          AND link_status IS NULL
        `,
      )
      .get()?.count ?? 0;

  // Rows written with a link before link_status existed are `linked`.
  db.exec(
    "UPDATE paper_trades SET link_status = 'linked' WHERE opportunity_id IS NOT NULL AND TRIM(opportunity_id) != '' AND link_status IS NULL",
  );

  const findCandidate = db.prepare<CandidateRow>(
    `
    SELECT id, status, ABS(timestamp - @timestamp) AS distance
    FROM opportunities
    WHERE strategy = @strategy
      AND ABS(timestamp - @timestamp) <= @windowMs
      AND token_ids LIKE @tokenPattern
    ORDER BY
      CASE status WHEN 'paper_fired' THEN 0 WHEN 'validated' THEN 1 ELSE 2 END,
      distance ASC
    LIMIT 1
    `,
  );

  let backfilled = 0;
  let legacyUnlinked = 0;

  for (const row of unlinked) {
    const candidate = row.token_id
      ? (findCandidate.get({
          strategy: row.strategy,
          timestamp: row.timestamp,
          windowMs,
          tokenPattern: `%"${row.token_id}"%`,
        }) as CandidateRow | undefined)
      : undefined;

    if (candidate) {
      setPaperTradeLink(row.id, candidate.id, "backfilled");
      backfilled += 1;
    } else {
      setPaperTradeLink(row.id, null, "legacy_unlinked");
      legacyUnlinked += 1;
    }
  }

  return {
    checked: unlinked.length,
    backfilled,
    legacyUnlinked,
    alreadyLinked,
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const dbArg = args.find((arg) => arg.startsWith("--db="));
  const dbPath = dbArg?.slice("--db=".length) ?? process.env.DATABASE_PATH;

  initDb(dbPath);

  try {
    const result = backfillPaperTradeLinks();

    console.log(JSON.stringify(result, null, 2));
  } finally {
    closeDb();
  }
}
