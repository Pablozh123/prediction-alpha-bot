import axios from "axios";

const GAMMA_EVENTS_URL = "https://gamma-api.polymarket.com/events";
const GAMMA_TIMEOUT_MS = 10_000;

export type GammaRawMarket = Record<string, unknown>;

export type GammaRawEvent = {
  markets?: GammaRawMarket[];
  [key: string]: unknown;
};

export type NormalizedGammaMarket = {
  id: string;
  slug: string;
  question: string;
  negRisk: boolean;
  clobTokenIds: string[];
  outcomes: string[];
  outcomePrices: string[];
};

export async function fetchNegRiskEvents(
  limit = 200
): Promise<GammaRawEvent[]> {
  const response = await axios.get<GammaRawEvent[]>(GAMMA_EVENTS_URL, {
    params: {
      negRisk: true,
      active: true,
      closed: false,
      limit
    },
    timeout: GAMMA_TIMEOUT_MS
  });

  return response.data;
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
  return {
    id: optionalString(market.id),
    slug: optionalString(market.slug),
    question: optionalString(market.question),
    negRisk: optionalBoolean(market.negRisk),
    clobTokenIds: optionalArrayField<string>(
      market.clobTokenIds,
      "clobTokenIds"
    ),
    outcomes: optionalArrayField<string>(market.outcomes, "outcomes"),
    outcomePrices: optionalArrayField<string>(
      market.outcomePrices,
      "outcomePrices"
    )
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
