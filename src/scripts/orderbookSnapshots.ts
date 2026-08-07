import "dotenv/config";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "../execution/db.js";
import { runOrderBookSnapshotCycle } from "../scanner/orderbookSnapshotCycle.js";

type Options = {
  dbPath?: string;
  gammaEventLimit?: number;
  maxTokensPerMarket?: number;
  tokenLimit?: number;
};

export async function runOrderBookSnapshotsOnce(
  options: Options = {}
): Promise<void> {
  initDb(options.dbPath ?? process.env.DATABASE_PATH);

  try {
    const result = await runOrderBookSnapshotCycle({
      gammaEventLimit:
        options.gammaEventLimit ??
        parseOptionalPositiveInteger(
          process.env.ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT
        ),
      maxTokensPerMarket:
        options.maxTokensPerMarket ??
        parseOptionalPositiveInteger(
          process.env.ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET
        ),
      tokenLimit:
        options.tokenLimit ??
        parseOptionalPositiveInteger(process.env.ORDERBOOK_SNAPSHOT_TOKEN_LIMIT)
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    closeDb();
  }
}

function parseOptions(argv: string[]): Options {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const gammaLimitArg = argv.find((arg) => arg.startsWith("--gamma-limit="));
  const maxPerMarketArg = argv.find((arg) =>
    arg.startsWith("--max-per-market=")
  );

  return {
    dbPath: dbArg?.slice("--db=".length),
    gammaEventLimit:
      gammaLimitArg === undefined
        ? undefined
        : parseOptionalPositiveInteger(
            gammaLimitArg.slice("--gamma-limit=".length)
          ),
    maxTokensPerMarket:
      maxPerMarketArg === undefined
        ? undefined
        : parseOptionalPositiveInteger(
            maxPerMarketArg.slice("--max-per-market=".length)
          ),
    tokenLimit:
      limitArg === undefined
        ? undefined
        : parseOptionalPositiveInteger(limitArg.slice("--limit=".length))
  };
}

function parseOptionalPositiveInteger(
  value: string | undefined
): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, got "${value}".`);
  }

  return parsed;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runOrderBookSnapshotsOnce(parseOptions(process.argv.slice(2))).catch(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`orderbook snapshot cycle failed: ${message}`);
      process.exitCode = 1;
    }
  );
}
