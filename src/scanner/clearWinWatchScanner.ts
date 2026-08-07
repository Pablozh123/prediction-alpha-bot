import {
  fetchActiveEvents,
  normalizeGammaMarket,
  type GammaRawEvent,
} from "../utils/gamma.js";
import {
  classifyCapitalLock,
  deriveExpectedResolutionAt,
} from "../utils/marketTime.js";

export const CLEAR_WIN_WATCH_STRATEGY = "clear_win_watch";
export const CLEAR_WIN_WATCH_REASON = "near_resolution_watch";
export const DEFAULT_CLEAR_WIN_WATCH_LIMIT = 200;
export const DEFAULT_CLEAR_WIN_WATCH_PAST_HOURS = 24;
export const DEFAULT_CLEAR_WIN_WATCH_FUTURE_HOURS = 24;
export const DEFAULT_CLEAR_WIN_WATCH_MIN_PRICE = 0.85;
export const DEFAULT_CLEAR_WIN_WATCH_MAX_PRICE = 0.995;

export type ClearWinWatchOpportunity = {
  slug: string;
  question: string;
  tokenId: string;
  side: "YES" | "NO";
  impliedPrice: number;
  expectedResolutionAt: number | null;
  durationHours: number | null;
  capitalLockClass: "short" | "medium" | "long" | "unknown";
  reason: typeof CLEAR_WIN_WATCH_REASON;
};

export type ScanClearWinWatchOptions = {
  futureHours?: number;
  limit?: number;
  maxPrice?: number;
  minPrice?: number;
  nowMs?: number;
  pastHours?: number;
  warn?: (message: string) => void;
};

export async function scanClearWinWatchOpportunities(
  options: ScanClearWinWatchOptions = {},
): Promise<ClearWinWatchOpportunity[]> {
  const events = await fetchActiveEvents(options.limit ?? DEFAULT_CLEAR_WIN_WATCH_LIMIT);

  return scanClearWinWatchEvents(events, options);
}

export function scanClearWinWatchEvents(
  events: GammaRawEvent[],
  options: ScanClearWinWatchOptions = {},
): ClearWinWatchOpportunity[] {
  const nowMs = options.nowMs ?? Date.now();
  const warn = options.warn ?? console.warn;
  const minPrice = options.minPrice ?? DEFAULT_CLEAR_WIN_WATCH_MIN_PRICE;
  const maxPrice = options.maxPrice ?? DEFAULT_CLEAR_WIN_WATCH_MAX_PRICE;
  const pastMs = (options.pastHours ?? DEFAULT_CLEAR_WIN_WATCH_PAST_HOURS) * 60 * 60 * 1000;
  const futureMs =
    (options.futureHours ?? DEFAULT_CLEAR_WIN_WATCH_FUTURE_HOURS) * 60 * 60 * 1000;
  const opportunities: ClearWinWatchOpportunity[] = [];

  for (const event of events) {
    const eventResolutionAt = deriveExpectedResolutionAt(event);
    const markets = Array.isArray(event.markets) ? event.markets : [];

    for (const rawMarket of markets) {
      try {
        const market = normalizeGammaMarket(rawMarket);
        const expectedResolutionAt =
          market.expectedResolutionAt ?? eventResolutionAt;

        if (
          !expectedResolutionAt ||
          expectedResolutionAt < nowMs - pastMs ||
          expectedResolutionAt > nowMs + futureMs
        ) {
          continue;
        }

        const [yesTokenId, noTokenId] = market.clobTokenIds;
        const yesPrice = Number(market.outcomePrices[0]);
        const noPrice = Number(market.outcomePrices[1]);

        addWatchCandidate({
          opportunities,
          expectedResolutionAt,
          impliedPrice: yesPrice,
          maxPrice,
          minPrice,
          nowMs,
          question: market.question,
          side: "YES",
          slug: market.slug,
          tokenId: yesTokenId,
        });
        addWatchCandidate({
          opportunities,
          expectedResolutionAt,
          impliedPrice: noPrice,
          maxPrice,
          minPrice,
          nowMs,
          question: market.question,
          side: "NO",
          slug: market.slug,
          tokenId: noTokenId,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        warn(`Skipping clear-win-watch candidate: ${detail}`);
      }
    }
  }

  return opportunities.sort(
    (left, right) =>
      right.impliedPrice - left.impliedPrice || left.slug.localeCompare(right.slug),
  );
}

function addWatchCandidate(input: {
  opportunities: ClearWinWatchOpportunity[];
  expectedResolutionAt: number;
  impliedPrice: number;
  maxPrice: number;
  minPrice: number;
  nowMs: number;
  question: string;
  side: "YES" | "NO";
  slug: string;
  tokenId: string | undefined;
}): void {
  if (
    !input.slug ||
    !input.question ||
    !input.tokenId ||
    !Number.isFinite(input.impliedPrice) ||
    input.impliedPrice < input.minPrice ||
    input.impliedPrice > input.maxPrice
  ) {
    return;
  }

  const capitalLock = classifyCapitalLock(input.expectedResolutionAt, input.nowMs);

  input.opportunities.push({
    slug: input.slug,
    question: input.question,
    tokenId: input.tokenId,
    side: input.side,
    impliedPrice: input.impliedPrice,
    expectedResolutionAt: capitalLock.expectedResolutionAt,
    durationHours: capitalLock.durationHours,
    capitalLockClass: capitalLock.capitalLockClass,
    reason: CLEAR_WIN_WATCH_REASON,
  });
}
