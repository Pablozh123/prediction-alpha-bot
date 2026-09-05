import {
  fetchNegRiskEvents,
  normalizeGammaMarket,
  type GammaRawEvent,
} from "../utils/gamma.js";
import {
  deriveExpectedResolutionAt,
  latestKnownResolutionAt,
} from "../utils/marketTime.js";

export const DEFAULT_NEG_RISK_SUM_THRESHOLD = 1.03;

export type NegRiskBracketLeg = {
  marketId: string;
  slug: string;
  question: string;
  yesTokenId: string | null;
  noTokenId: string;
  yesPrice: number | null;
  expectedResolutionAt?: number | null;
  sideToPaperTrade: "NO";
};

export type NegRiskBracketOpportunity = {
  eventSlug: string;
  sumYes: number | null;
  threshold: number;
  expectedEdge: number;
  expectedResolutionAt?: number | null;
  /**
   * The venue's own word on mutual exclusion. `true`/`false` come from the
   * Gamma event (or, failing that, from every market of the event); `null`
   * means the flag was never read, which is the case for baskets rebuilt
   * from orderbook snapshots. Only `false` fails gate 1 on its own.
   */
  negRisk?: boolean | null;
  /** Whether Polymarket augmented the event with an implicit Other leg. */
  negRiskAugmented?: boolean | null;
  marketCount?: number;
  reason:
    | "needs_orderbook_depth_check"
    | "snapshot_no_basket_positive_edge_limited_coverage";
  legs: NegRiskBracketLeg[];
};

export type ScanNegRiskBracketOptions = {
  threshold?: number;
  warn?: (message: string) => void;
};

export async function scanNegRiskBracketOpportunities(
  options: {
    limit?: number;
    threshold?: number;
    warn?: (message: string) => void;
  } = {},
): Promise<NegRiskBracketOpportunity[]> {
  const events = await fetchNegRiskEvents(options.limit);

  return scanNegRiskBracketEvents(events, {
    threshold: options.threshold,
    warn: options.warn,
  });
}

export async function scanNegRiskBracketArbs(
  options: {
    limit?: number;
    threshold?: number;
    warn?: (message: string) => void;
  } = {},
): Promise<NegRiskBracketOpportunity[]> {
  return scanNegRiskBracketOpportunities(options);
}

export function scanNegRiskBracketEvents(
  events: GammaRawEvent[],
  options: ScanNegRiskBracketOptions = {},
): NegRiskBracketOpportunity[] {
  const threshold = options.threshold ?? DEFAULT_NEG_RISK_SUM_THRESHOLD;
  const warn = options.warn ?? console.warn;
  const opportunities: NegRiskBracketOpportunity[] = [];

  for (const event of events) {
    const eventSlug = getOptionalString(event.slug);
    const eventResolutionAt = deriveExpectedResolutionAt(event);
    const markets = Array.isArray(event.markets) ? event.markets : [];

    if (!eventSlug) {
      warn("Skipping NEG_RISK event: missing event slug.");
      continue;
    }

    if (markets.length < 3) {
      warn(
        `Skipping NEG_RISK event "${eventSlug}": expected at least 3 markets, got ${markets.length}.`,
      );
      continue;
    }

    const legs: NegRiskBracketLeg[] = [];
    let eventIsValid = true;

    for (const rawMarket of markets) {
      try {
        const market = normalizeGammaMarket(rawMarket);
        const leg = normalizeBracketLeg(market, eventResolutionAt);
        legs.push(leg);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        warn(`Skipping NEG_RISK event "${eventSlug}": ${detail}`);
        eventIsValid = false;
        break;
      }
    }

    if (!eventIsValid) {
      continue;
    }

    const sumYes = roundPrice(
      legs.reduce((sum, leg) => sum + (leg.yesPrice ?? 0), 0),
    );

    if (sumYes > threshold) {
      const expectedResolutionAt = latestKnownResolutionAt(
        legs.map((leg) => leg.expectedResolutionAt),
      );

      opportunities.push({
        eventSlug,
        sumYes,
        threshold,
        expectedEdge: roundPrice(sumYes - threshold),
        ...(expectedResolutionAt ? { expectedResolutionAt } : {}),
        negRisk: eventNegRiskFlag(event, markets),
        negRiskAugmented: optionalTriStateBoolean(event.negRiskAugmented),
        marketCount: markets.length,
        reason: "needs_orderbook_depth_check",
        legs,
      });
    }
  }

  return opportunities;
}

/**
 * The venue flag for mutual exclusion, read from the event first and from
 * the markets second. Missing everywhere means unknown, never false: the
 * flag can only fail a basket when the venue actually said no.
 */
export function eventNegRiskFlag(
  event: GammaRawEvent,
  markets: unknown[],
): boolean | null {
  const eventFlag = optionalTriStateBoolean(event.negRisk ?? event.neg_risk);

  if (eventFlag !== null) {
    return eventFlag;
  }

  const marketFlags = markets
    .map((market) =>
      market && typeof market === "object"
        ? optionalTriStateBoolean((market as Record<string, unknown>).negRisk)
        : null,
    )
    .filter((flag): flag is boolean => flag !== null);

  if (marketFlags.length === 0) {
    return null;
  }

  return marketFlags.every((flag) => flag);
}

function optionalTriStateBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return null;
}

type NormalizedMarketForBracket = {
  id: string;
  slug: string;
  question: string;
  clobTokenIds: string[];
  outcomePrices: string[];
  expectedResolutionAt?: number | null;
};

function normalizeBracketLeg(
  market: NormalizedMarketForBracket,
  eventResolutionAt: number | null,
): NegRiskBracketLeg {
  if (!market.id) {
    throw new Error("market missing id.");
  }

  if (!market.slug) {
    throw new Error(`market "${market.id}" missing slug.`);
  }

  if (!market.question) {
    throw new Error(`market "${market.id}" missing question.`);
  }

  const [yesTokenId, noTokenId] = market.clobTokenIds;

  if (!yesTokenId || !noTokenId) {
    throw new Error(`market "${market.id}" missing YES/NO token ids.`);
  }

  const yesPrice = Number(market.outcomePrices[0]);

  if (!isPlausiblePrice(yesPrice)) {
    throw new Error(`market "${market.id}" has implausible YES price.`);
  }

  return {
    marketId: market.id,
    slug: market.slug,
    question: market.question,
    yesTokenId,
    noTokenId,
    yesPrice,
    ...((market.expectedResolutionAt ?? eventResolutionAt)
      ? { expectedResolutionAt: market.expectedResolutionAt ?? eventResolutionAt }
      : {}),
    sideToPaperTrade: "NO",
  };
}

function getOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isPlausiblePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
