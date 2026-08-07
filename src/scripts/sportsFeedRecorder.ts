import "dotenv/config";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "../execution/db.js";
import { startSportsFeedRecorder } from "../utils/polymarketSports.js";

function start(): void {
  initDb(process.env.DATABASE_PATH);

  const recorder = startSportsFeedRecorder({
    onError(message) {
      console.warn(`sports feed warning: ${message}`);
    },
    onTick(tick) {
      console.log(
        JSON.stringify({
          slug: tick.slug,
          status: tick.status,
          ended: tick.ended,
          score:
            tick.awayScore === null || tick.homeScore === null
              ? null
              : `${tick.awayScore}-${tick.homeScore}`,
          receivedAt: tick.receivedAt,
        }),
      );
    },
  });

  const stop = (): void => {
    recorder.close();
    closeDb();
    console.log("sports feed recorder stopped");
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("sports feed recorder started; paper-only, read-only websocket");
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  try {
    start();
  } catch (error) {
    console.error(
      `sports feed recorder failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    closeDb();
    process.exitCode = 1;
  }
}
