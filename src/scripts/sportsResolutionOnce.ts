import "dotenv/config";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "../execution/db.js";
import { runSportsResolutionCycle } from "../scanner/sportsResolutionScanner.js";

export async function runSportsResolutionOnce(argv = process.argv.slice(2)) {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const paperFireEnabled = argv.includes("--paper-fire");

  initDb(dbArg?.slice("--db=".length) ?? process.env.DATABASE_PATH);

  try {
    const result = await runSportsResolutionCycle({ paperFireEnabled });

    console.log(
      JSON.stringify(
        {
          ...result,
          paperFireEnabled,
          safety: "paper-only; no live orders",
        },
        null,
        2,
      ),
    );

    return result;
  } finally {
    closeDb();
  }
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runSportsResolutionOnce().catch((error: unknown) => {
    console.error(
      `sports resolution cycle failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
