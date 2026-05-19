import { pathToFileURL } from "node:url";
import { getDb } from "./db.js";
import {
  fetchActivity,
  fetchPositions,
  type PolymarketActivity,
  type PolymarketPosition
} from "../utils/polymarketDataApi.js";
import { logInfo } from "../utils/logger.js";

export type ReconciliationLogger = {
  info(message: string): void;
};

export type ReconciliationResult = {
  skipped: boolean;
  positionsProcessed: number;
  activityProcessed: number;
  suspectLiveTradesMarked: number;
};

export type ReconciliationOptions = {
  fetchPositions?: typeof fetchPositions;
  fetchActivity?: typeof fetchActivity;
  logger?: ReconciliationLogger;
};

const defaultLogger: ReconciliationLogger = {
  info: logInfo
};

export async function reconcileLivePnl(
  address?: string,
  options: ReconciliationOptions = {}
): Promise<ReconciliationResult> {
  const logger = options.logger ?? defaultLogger;
  const trimmedAddress = address?.trim();

  if (!trimmedAddress) {
    logger.info("reconciliation skipped: no address");

    return {
      skipped: true,
      positionsProcessed: 0,
      activityProcessed: 0,
      suspectLiveTradesMarked: 0
    };
  }

  const fetchPositionsFn = options.fetchPositions ?? fetchPositions;
  const fetchActivityFn = options.fetchActivity ?? fetchActivity;
  const [positions, activity] = await Promise.all([
    fetchPositionsFn(trimmedAddress),
    fetchActivityFn(trimmedAddress)
  ]);
  const suspectLiveTradesMarked = markMissingFillPricesSuspect();

  logger.info(
    `reconciliation processed positions=${positions.length} activity=${activity.length} suspect_live_trades=${suspectLiveTradesMarked}`
  );

  return {
    skipped: false,
    positionsProcessed: positions.length,
    activityProcessed: activity.length,
    suspectLiveTradesMarked
  };
}

function markMissingFillPricesSuspect(): number {
  return getDb()
    .prepare(
      `
      UPDATE live_trades
      SET exit_stamping_suspect = 1
      WHERE actual_fill_price IS NULL
      `
    )
    .run().changes;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  await reconcileLivePnl(process.env.POLYMARKET_ADDRESS);
}

export type { PolymarketActivity, PolymarketPosition };
