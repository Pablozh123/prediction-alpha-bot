import "dotenv/config";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "../execution/db.js";
import { runSportsResolutionCycle } from "../scanner/sportsResolutionScanner.js";
import { startSportsFeedRecorder } from "../utils/polymarketSports.js";

const DEFAULT_SPORTS_RESOLUTION_INTERVAL_MS = 30_000;

export type SportsWatchConfig = {
  dbPath?: string;
  paperFireEnabled: boolean;
  resolutionIntervalMs: number;
};

export function loadSportsWatchConfig(
  env: NodeJS.ProcessEnv = process.env,
): SportsWatchConfig {
  return {
    dbPath: env.DATABASE_PATH?.trim() || undefined,
    paperFireEnabled: parseBoolean(env.SPORTS_PAPER_FIRE_ENABLED, false),
    resolutionIntervalMs: parsePositiveInteger(
      env.SPORTS_RESOLUTION_INTERVAL_MS,
      DEFAULT_SPORTS_RESOLUTION_INTERVAL_MS,
      "SPORTS_RESOLUTION_INTERVAL_MS",
    ),
  };
}

export function startSportsWatch(
  config: SportsWatchConfig = loadSportsWatchConfig(),
): { stop(): void } {
  initDb(config.dbPath);

  const recorder = startSportsFeedRecorder({
    onError(message) {
      console.warn(`sports feed warning: ${message}`);
    },
    onTick(tick) {
      console.log(
        JSON.stringify({
          event: "sports_tick_recorded",
          slug: tick.slug,
          status: tick.status,
          ended: tick.ended,
          receivedAt: tick.receivedAt,
        }),
      );
    },
  });

  let scanInFlight = false;
  const scan = (): void => {
    if (scanInFlight) {
      console.warn("sports resolution scan skipped: previous scan still running");
      return;
    }

    scanInFlight = true;
    void runSportsResolutionCycle({
      paperFireEnabled: config.paperFireEnabled,
    })
      .then((result) => {
        console.log(
          JSON.stringify({
            event: "sports_resolution_scan",
            ...result,
            paperFireEnabled: config.paperFireEnabled,
          }),
        );
      })
      .catch((error: unknown) => {
        console.error(
          `sports resolution scan failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      })
      .finally(() => {
        scanInFlight = false;
      });
  };
  const interval = setInterval(scan, config.resolutionIntervalMs);

  scan();

  const stop = (): void => {
    clearInterval(interval);
    recorder.close();
    closeDb();
    console.log("sports watch stopped");
  };

  return { stop };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  const handle = startSportsWatch();

  const stop = (): void => {
    handle.stop();
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("sports watch started; paper-only, read-only websocket");
}
