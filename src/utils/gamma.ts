import axios from "axios";
import { deriveExpectedResolutionAt } from "./marketTime.js";
import { retryWithBackoff, withTimeout } from "./reliability.js";

const GAMMA_EVENTS_URL = "https://gamma-api.polymarket.com/events";
const GAMMA_PUBLIC_SEARCH_URL = "https://gamma-api.polymarket.com/public-search";
const GAMMA_TIMEOUT_MS = 10_000;
const GAMMA_EVENT_PAGE_LIMIT = 100;

export type GammaRawMarket = Record<string, unknown>;

export type GammaRawEvent = {
  markets?: GammaRawMarket[];
  [key: string]: unknown;
};

type GammaPublicSearchResponse = {
  events?: GammaRawEvent[];
};

export type NormalizedGammaMarket = {
  id: string;
  slug: string;
  question: string;
  description?: string;
  resolutionSource?: string;
  negRisk: boolean;
  clobTokenIds: string[];
  outcomes: string[];
  outcomePrices: string[];
  expectedResolutionAt?: number | null;
};

export async function fetchNegRiskEvents(
  limit = 200
): Promise<GammaRawEvent[]> {
  const response = await retryWithBackoff(
    () =>
      withTimeout(
        axios.get<GammaRawEvent[]>(GAMMA_EVENTS_URL, {
          params: {
            negRisk: true,
            active: true,
            closed: false,
            limit
          },
          timeout: GAMMA_TIMEOUT_MS
        }),
        GAMMA_TIMEOUT_MS + 1_000,
        "Gamma NEG_RISK events request timed out."
      ),
    { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 }
  );

  return response.data;
}

export async function fetchActiveEvents(limit = 200): Promise<GammaRawEvent[]> {
  const targetLimit = Math.max(0, Math.floor(limit));
  const events: GammaRawEvent[] = [];

  for (
    let offset = 0;
    events.length < targetLimit;
    offset += GAMMA_EVENT_PAGE_LIMIT
  ) {
    const pageLimit = Math.min(GAMMA_EVENT_PAGE_LIMIT, targetLimit - events.length);
    const response = await retryWithBackoff(
      () =>
        withTimeout(
          axios.get<GammaRawEvent[]>(GAMMA_EVENTS_URL, {
            params: {
              active: true,
              closed: false,
              limit: pageLimit,
              offset
            },
            timeout: GAMMA_TIMEOUT_MS
          }),
          GAMMA_TIMEOUT_MS + 1_000,
          "Gamma active events request timed out."
        ),
      { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 }
    );
    const page = response.data;

    events.push(...page);

    if (page.length < pageLimit) {
      break;
    }
  }

  return events.slice(0, targetLimit);
}

export async function fetchPublicSearchEvents(
  query: string,
  limit = 20
): Promise<GammaRawEvent[]> {
  const cleanedQuery = query.trim();
  const targetLimit = Math.max(0, Math.floor(limit));

  if (!cleanedQuery || targetLimit === 0) {
    return [];
  }

  const response = await retryWithBackoff(
    () =>
      withTimeout(
        axios.get<GammaPublicSearchResponse>(GAMMA_PUBLIC_SEARCH_URL, {
          params: {
            q: cleanedQuery,
            limit: targetLimit,
            events_status: "active"
          },
          timeout: GAMMA_TIMEOUT_MS
        }),
        GAMMA_TIMEOUT_MS + 1_000,
        "Gamma public search request timed out."
      ),
    { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 }
  );

  return Array.isArray(response.data.events)
    ? response.data.events.slice(0, targetLimit)
    : [];
}

export function parseJsonArrayField<T>(value: string | T[]): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a JSON array string or an already parsed array.");
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      throw new Error("Parsed value is not an array.");
    }

    return parsed as T[];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON array field: ${detail}`, { cause: error });
  }
}

export function normalizeGammaMarket(
  market: GammaRawMarket
): NormalizedGammaMarket {
  const expectedResolutionAt = deriveExpectedResolutionAt(market);

  return {
    id: optionalString(market.id),
    slug: optionalString(market.slug),
    question: optionalString(market.question),
    ...(optionalString(market.description)
      ? { description: optionalString(market.description) }
      : {}),
    ...(optionalString(market.resolutionSource ?? market.resolution_source)
      ? {
          resolutionSource: optionalString(
            market.resolutionSource ?? market.resolution_source
          )
        }
      : {}),
    negRisk: optionalBoolean(market.negRisk),
    clobTokenIds: optionalArrayField<string>(
      market.clobTokenIds,
      "clobTokenIds"
    ),
    outcomes: optionalArrayField<string>(market.outcomes, "outcomes"),
    outcomePrices: optionalArrayField<string>(
      market.outcomePrices,
      "outcomePrices"
    ),
    ...(expectedResolutionAt ? { expectedResolutionAt } : {})
  };
}

function optionalString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function optionalBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}

function optionalArrayField<T>(value: unknown, fieldName: string): T[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (typeof value !== "string" && !Array.isArray(value)) {
    throw new Error(
      `Invalid Gamma market field "${fieldName}": expected JSON array string or array.`
    );
  }

  try {
    return parseJsonArrayField<T>(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Gamma market field "${fieldName}": ${detail}`, {
      cause: error
    });
  }
}
