import {
  executeOrPaper,
  type ExecuteOrPaperResult,
} from "../execution/executeOrPaper.js";
import {
  fetchActiveEvents,
  gammaCategory,
  normalizeGammaMarket,
  type GammaRawEvent,
} from "../utils/gamma.js";
import { getDb } from "../execution/db.js";
import {
  deriveExpectedResolutionAt,
  latestKnownResolutionAt,
} from "../utils/marketTime.js";
import type { OrderBookLevel } from "../utils/orderbook.js";

export const DEFAULT_WITHIN_MARKET_ARB_THRESHOLD = 0.98;
export const DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD = 1.01;
export const WITHIN_MARKET_ARB_STRATEGY = "within_market_yes_no_arb";
export const WITHIN_MARKET_FAST_ARB_STRATEGY = "within_market_fast_arb";

export type WithinMarketArbMarket = {
  slug: string;
  question: string;
  askYes: number;
  askNo: number;
  tokenIds: {
    yes: string;
    no: string;
  };
  category?: string | null;
  expectedResolutionAt?: number | null;
};

export type WithinMarketArbOpportunity = {
  slug: string;
  question: string;
  askYes: number;
  askNo: number;
  totalCost: number;
  expectedEdge: number;
  tokenIds: {
    yes: string;
    no: string;
  };
  category?: string | null;
  expectedResolutionAt?: number | null;
  reason: "yes_no_ask_sum_below_threshold";
};

export type ScanWithinMarketArbOptions = {
  threshold?: number;
  warn?: (message: string) => void;
};

export type ScanWithinMarketArbOpportunitiesOptions =
  ScanWithinMarketArbOptions & {
    limit?: number;
  };

export type PaperWithinMarketArbOptions = {
  execute?: typeof executeOrPaper;
  /** Journal id of the candidate; every paper trade must be traceable to one. */
  opportunityId: string;
  paperSizeUsd?: number;
};

const DEFAULT_PAPER_SIZE_USD = 1;
const DEFAULT_WITHIN_MARKET_SCAN_LIMIT = 200;
export const MAX_SNAPSHOT_STALENESS_MS = 600_000;

export type WithinMarketSnapshotRow = {
  tokenId: string;
  marketSlug: string | null;
  marketId: string | null;
  side: "YES" | "NO" | null;
  asks: OrderBookLevel[];
  bestAsk: number | null;
  expectedResolutionAt?: number | null;
  capturedAt: number;
};

export async function scanWithinMarketArbOpportunities(
  options: ScanWithinMarketArbOpportunitiesOptions = {},
): Promise<WithinMarketArbOpportunity[]> {
  const events = await fetchActiveEvents(
    options.limit ?? DEFAULT_WITHIN_MARKET_SCAN_LIMIT,
  );

  return scanWithinMarketGammaEvents(events, options);
}

export async function scanWithinMarketCombinedOpportunities(
  options: ScanWithinMarketArbOpportunitiesOptions = {},
): Promise<WithinMarketArbOpportunity[]> {
  const [gamma, snapshots] = await Promise.all([
    scanWithinMarketArbOpportunities(options),
    Promise.resolve(scanWithinMarketSnapshotOpportunities(options)),
  ]);
  const seen = new Set<string>();
  const combined: WithinMarketArbOpportunity[] = [];

  for (const opportunity of [...snapshots, ...gamma]) {
    const key = `${opportunity.slug}|${opportunity.tokenIds.yes}|${opportunity.tokenIds.no}`;

    if (!seen.has(key)) {
      seen.add(key);
      combined.push(opportunity);
    }
  }

  return combined;
}

export function scanWithinMarketSnapshotOpportunities(
  options: ScanWithinMarketArbOptions & {
    maxStalenessMs?: number;
    snapshots?: WithinMarketSnapshotRow[];
  } = {},
): WithinMarketArbOpportunity[] {
  const snapshots = options.snapshots ?? loadRecentWithinMarketSnapshots();

  return scanWithinMarketArbs(
    buildMarketsFromSnapshots(snapshots, {
      maxStalenessMs: options.maxStalenessMs ?? MAX_SNAPSHOT_STALENESS_MS,
    }),
    options,
  );
}

export function scanWithinMarketGammaEvents(
  events: GammaRawEvent[],
  options: ScanWithinMarketArbOptions = {},
): WithinMarketArbOpportunity[] {
  const warn = options.warn ?? console.warn;
  const markets: WithinMarketArbMarket[] = [];

  for (const event of events) {
    const eventResolutionAt = deriveExpectedResolutionAt(event);
    const eventCategory = gammaCategory(event);
    const rawMarkets = Array.isArray(event.markets) ? event.markets : [];

    for (const rawMarket of rawMarkets) {
      try {
        const market = normalizeGammaMarket(rawMarket);
        const [yesTokenId, noTokenId] = market.clobTokenIds;
        const askYes = Number(market.outcomePrices[0]);
        const askNo = Number(market.outcomePrices[1]);

        if (
          !market.slug ||
          !market.question ||
          !yesTokenId ||
          !noTokenId ||
          !isPlausibleAsk(askYes) ||
          !isPlausibleAsk(askNo)
        ) {
          continue;
        }

        markets.push({
          slug: market.slug,
          question: market.question,
          askYes,
          askNo,
          tokenIds: {
            yes: yesTokenId ?? "",
            no: noTokenId ?? "",
          },
          ...((market.category || eventCategory)
            ? { category: market.category || eventCategory }
            : {}),
          ...((market.expectedResolutionAt ?? eventResolutionAt)
            ? { expectedResolutionAt: market.expectedResolutionAt ?? eventResolutionAt }
            : {}),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        warn(`Skipping within-market candidate: ${detail}`);
      }
    }
  }

  return scanWithinMarketArbs(markets, options);
}

export function scanWithinMarketArbs(
  markets: WithinMarketArbMarket[],
  options: ScanWithinMarketArbOptions = {},
): WithinMarketArbOpportunity[] {
  const threshold = options.threshold ?? DEFAULT_WITHIN_MARKET_ARB_THRESHOLD;
  const warn = options.warn ?? console.warn;
  const opportunities: WithinMarketArbOpportunity[] = [];

  for (const market of markets) {
    if (!isValidMarket(market)) {
      warn(
        `Skipping within-market arb candidate "${market.slug}": invalid market fields.`,
      );
      continue;
    }

    const totalCost = roundPrice(market.askYes + market.askNo);

    if (totalCost < threshold) {
      opportunities.push({
        slug: market.slug,
        question: market.question,
        askYes: market.askYes,
        askNo: market.askNo,
        totalCost,
        expectedEdge: roundPrice(1 - totalCost),
        tokenIds: market.tokenIds,
        ...(market.category ? { category: market.category } : {}),
        ...(market.expectedResolutionAt
          ? { expectedResolutionAt: market.expectedResolutionAt }
          : {}),
        reason: "yes_no_ask_sum_below_threshold",
      });
    }
  }

  return opportunities.sort(
    (left, right) =>
      right.expectedEdge - left.expectedEdge ||
      left.slug.localeCompare(right.slug),
  );
}

export function paperWithinMarketArbOpportunity(
  opportunity: WithinMarketArbOpportunity,
  options: PaperWithinMarketArbOptions,
): ExecuteOrPaperResult[] {
  const execute = options.execute ?? executeOrPaper;
  const paperSizeUsd = options.paperSizeUsd ?? DEFAULT_PAPER_SIZE_USD;

  return [
    execute({
      strategy: WITHIN_MARKET_ARB_STRATEGY,
      slug: opportunity.slug,
      question: opportunity.question,
      tokenId: opportunity.tokenIds.yes,
      opportunityId: options.opportunityId,
      side: "YES",
      entryPrice: opportunity.askYes,
      paperSizeUsd,
      arbClass: WITHIN_MARKET_ARB_STRATEGY,
    }),
    execute({
      strategy: WITHIN_MARKET_ARB_STRATEGY,
      slug: opportunity.slug,
      question: opportunity.question,
      tokenId: opportunity.tokenIds.no,
      opportunityId: options.opportunityId,
      side: "NO",
      entryPrice: opportunity.askNo,
      paperSizeUsd,
      arbClass: WITHIN_MARKET_ARB_STRATEGY,
    }),
  ];
}

function isValidMarket(market: WithinMarketArbMarket): boolean {
  return (
    market.slug.trim().length > 0 &&
    market.question.trim().length > 0 &&
    market.tokenIds.yes.trim().length > 0 &&
    market.tokenIds.no.trim().length > 0 &&
    isPlausibleAsk(market.askYes) &&
    isPlausibleAsk(market.askNo)
  );
}

function buildMarketsFromSnapshots(
  snapshots: WithinMarketSnapshotRow[],
  options: { maxStalenessMs: number },
): WithinMarketArbMarket[] {
  const grouped = new Map<string, WithinMarketSnapshotRow[]>();

  for (const snapshot of snapshots) {
    const marketKey = snapshot.marketId ?? snapshot.marketSlug;

    if (!marketKey || !snapshot.side) {
      continue;
    }

    const existing = grouped.get(marketKey) ?? [];

    existing.push(snapshot);
    grouped.set(marketKey, existing);
  }

  const markets: WithinMarketArbMarket[] = [];

  for (const group of grouped.values()) {
    const yes = latestBySide(group, "YES");
    const no = latestBySide(group, "NO");

    if (!yes || !no) {
      continue;
    }

    if (Math.abs(yes.capturedAt - no.capturedAt) > options.maxStalenessMs) {
      continue;
    }

    const askYes = snapshotBestAsk(yes);
    const askNo = snapshotBestAsk(no);
    const slug = yes.marketSlug ?? no.marketSlug ?? yes.marketId ?? no.marketId;

    if (!slug || !isPlausibleAsk(askYes) || !isPlausibleAsk(askNo)) {
      continue;
    }

    markets.push({
      slug,
      question: slug,
      askYes,
      askNo,
      tokenIds: {
        yes: yes.tokenId,
        no: no.tokenId,
      },
      ...(latestKnownResolutionAt([
        yes.expectedResolutionAt,
        no.expectedResolutionAt,
      ])
        ? {
            expectedResolutionAt: latestKnownResolutionAt([
              yes.expectedResolutionAt,
              no.expectedResolutionAt,
            ]),
          }
        : {}),
    });
  }

  return markets;
}

function latestBySide(
  snapshots: WithinMarketSnapshotRow[],
  side: "YES" | "NO",
): WithinMarketSnapshotRow | undefined {
  const sideSnapshots = snapshots
    .filter((snapshot) => snapshot.side === side)
    .sort((left, right) => right.capturedAt - left.capturedAt);
  const latest = sideSnapshots[0];

  if (!latest) {
    return undefined;
  }

  const expectedResolutionAt = latestKnownResolutionAt(
    sideSnapshots.map((snapshot) => snapshot.expectedResolutionAt),
  );

  return expectedResolutionAt ? { ...latest, expectedResolutionAt } : latest;
}

function snapshotBestAsk(snapshot: WithinMarketSnapshotRow): number {
  if (snapshot.bestAsk !== null && Number.isFinite(snapshot.bestAsk)) {
    return snapshot.bestAsk;
  }

  const asks = snapshot.asks.filter(
    (level) =>
      Number.isFinite(level.price) &&
      level.price > 0 &&
      level.price < 1 &&
      Number.isFinite(level.size) &&
      level.size > 0,
  );

  return asks.length === 0
    ? Number.NaN
    : Math.min(...asks.map((level) => level.price));
}

function loadRecentWithinMarketSnapshots(): WithinMarketSnapshotRow[] {
  type SnapshotRow = {
    token_id: string;
    market_slug: string | null;
    market_id: string | null;
    side: "YES" | "NO" | null;
    asks_json: string;
    best_ask: number | null;
    expected_resolution_at: number | null;
    captured_at: number;
  };

  return getDb()
    .prepare<SnapshotRow>(
      `
      SELECT
        token_id,
        market_slug,
        market_id,
        side,
        asks_json,
        best_ask,
        ${selectExpectedResolutionColumn()},
        captured_at
      FROM orderbook_snapshots
      WHERE side IN ('YES', 'NO')
      ORDER BY captured_at DESC
      LIMIT 2000
      `,
    )
    .all()
    .map((row) => ({
      tokenId: row.token_id,
      marketSlug: row.market_slug,
      marketId: row.market_id,
      side: row.side,
      asks: parseLevels(row.asks_json),
      bestAsk: row.best_ask,
      expectedResolutionAt: row.expected_resolution_at,
      capturedAt: row.captured_at,
    }));
}

function selectExpectedResolutionColumn(): string {
  const hasColumn = getDb()
    .prepare<{ name: string }>("PRAGMA table_info(orderbook_snapshots)")
    .all()
    .some((column) => column.name === "expected_resolution_at");

  return hasColumn
    ? "expected_resolution_at"
    : "NULL AS expected_resolution_at";
}

function parseLevels(value: string): OrderBookLevel[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((level): OrderBookLevel[] => {
      if (typeof level !== "object" || level === null || Array.isArray(level)) {
        return [];
      }

      const price = Number("price" in level ? level.price : Number.NaN);
      const size = Number("size" in level ? level.size : Number.NaN);

      return Number.isFinite(price) && Number.isFinite(size)
        ? [{ price, size }]
        : [];
    });
  } catch {
    return [];
  }
}

function isPlausibleAsk(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
