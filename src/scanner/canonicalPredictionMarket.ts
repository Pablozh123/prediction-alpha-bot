export type CanonicalVenue = "kalshi" | "polymarket";

export type CanonicalOutcomeSide = "YES" | "NO";

export type CanonicalVenueOutcomeRef = {
  venue: CanonicalVenue;
  eventId: string;
  marketId: string;
  outcomeId: string;
  outcomeKey: string;
  label: string;
  side: CanonicalOutcomeSide;
  title: string;
  subtitle?: string;
  ticker?: string;
  slug?: string;
  yesTokenId?: string;
  noTokenId?: string;
  expectedResolutionAt: number | null;
  rulesText?: string;
  resolutionSource?: string;
  liquidityDollars?: number | null;
  volume24h?: number | null;
};

export type CanonicalOutcome = {
  id: string;
  eventId: string;
  outcomeKey: string;
  label: string;
  side: CanonicalOutcomeSide;
  expectedResolutionAt: number | null;
  rulesText?: string;
  resolutionSource?: string;
  venueRefs: CanonicalVenueOutcomeRef[];
};

export type CanonicalEvent = {
  id: string;
  eventKey: string;
  title: string;
  category?: string;
  expectedResolutionAt: number | null;
  rulesText?: string;
  resolutionSource?: string;
  outcomes: CanonicalOutcome[];
};

export type CanonicalKalshiMarketInput = {
  ticker: string;
  eventTicker?: string;
  title: string;
  subtitle?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  rulesPrimary?: string;
  rulesSecondary?: string;
  expectedExpirationTime?: number | null;
  closeTime?: number | null;
  liquidityDollars?: number | null;
  volume24h?: number | null;
};

export type CanonicalPolymarketBinaryMarketInput = {
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  category?: string;
  expectedResolutionAt?: number | null;
  rulesText?: string;
  resolutionSource?: string;
  liquidityDollars?: number | null;
  volume24h?: number | null;
};

export type CanonicalCrossVenueInput = {
  kalshi: CanonicalKalshiMarketInput;
  polymarket: CanonicalPolymarketBinaryMarketInput;
  title?: string;
  outcomeLabel?: string;
  category?: string;
  expectedResolutionAt?: number | null;
};

export function canonicalizeKalshiMarket(
  kalshi: CanonicalKalshiMarketInput,
): CanonicalEvent {
  const expectedResolutionAt = kalshiResolutionAt(kalshi);
  const title = firstNonEmpty([kalshi.title, kalshi.eventTicker, kalshi.ticker]);
  const outcomeLabel = firstNonEmpty([kalshi.yesSubTitle, "YES"]);
  const eventKey = canonicalEventKey(title, expectedResolutionAt);
  const eventId = `event:kalshi:${slugKey(kalshi.eventTicker || kalshi.ticker)}`;
  const outcome = buildCanonicalOutcome({
    eventId,
    eventKey,
    expectedResolutionAt,
    label: outcomeLabel,
    refs: [buildKalshiRef(kalshi, outcomeLabel, expectedResolutionAt)],
    rulesText: kalshiRulesText(kalshi),
  });

  return {
    id: eventId,
    eventKey,
    title,
    expectedResolutionAt,
    ...(outcome.rulesText ? { rulesText: outcome.rulesText } : {}),
    outcomes: [outcome],
  };
}

export function canonicalizePolymarketBinaryMarket(
  polymarket: CanonicalPolymarketBinaryMarketInput,
): CanonicalEvent {
  const expectedResolutionAt = normalizeNullableNumber(
    polymarket.expectedResolutionAt,
  );
  const title = firstNonEmpty([polymarket.question, polymarket.slug]);
  const eventKey = canonicalEventKey(title, expectedResolutionAt);
  const eventId = `event:polymarket:${slugKey(polymarket.slug)}`;
  const outcome = buildCanonicalOutcome({
    eventId,
    eventKey,
    expectedResolutionAt,
    label: "YES",
    refs: [buildPolymarketRef(polymarket, "YES", expectedResolutionAt)],
    rulesText: optionalString(polymarket.rulesText),
    resolutionSource: optionalString(polymarket.resolutionSource),
  });

  return {
    id: eventId,
    eventKey,
    title,
    ...(polymarket.category ? { category: polymarket.category } : {}),
    expectedResolutionAt,
    ...(outcome.rulesText ? { rulesText: outcome.rulesText } : {}),
    ...(outcome.resolutionSource
      ? { resolutionSource: outcome.resolutionSource }
      : {}),
    outcomes: [outcome],
  };
}

export function buildCrossVenueCanonicalEvent(
  input: CanonicalCrossVenueInput,
): { event: CanonicalEvent; outcome: CanonicalOutcome } {
  const expectedResolutionAt =
    normalizeNullableNumber(input.expectedResolutionAt) ??
    latestKnownNumber([
      kalshiResolutionAt(input.kalshi),
      input.polymarket.expectedResolutionAt,
    ]);
  const title = firstNonEmpty([
    input.title,
    input.kalshi.title,
    input.polymarket.question,
  ]);
  const outcomeLabel = firstNonEmpty([
    input.outcomeLabel,
    input.kalshi.yesSubTitle,
    "YES",
  ]);
  const eventKey = canonicalEventKey(title, expectedResolutionAt);
  const eventId = `event:${eventKey}`;
  const rulesText = combineUniqueText([
    kalshiRulesText(input.kalshi),
    input.polymarket.rulesText,
  ]);
  const resolutionSource = optionalString(input.polymarket.resolutionSource);
  const outcome = buildCanonicalOutcome({
    eventId,
    eventKey,
    expectedResolutionAt,
    label: outcomeLabel,
    refs: [
      buildKalshiRef(input.kalshi, outcomeLabel, expectedResolutionAt),
      buildPolymarketRef(input.polymarket, outcomeLabel, expectedResolutionAt),
    ],
    rulesText,
    resolutionSource,
  });
  const event: CanonicalEvent = {
    id: eventId,
    eventKey,
    title,
    ...(input.category ? { category: input.category } : {}),
    expectedResolutionAt,
    ...(rulesText ? { rulesText } : {}),
    ...(resolutionSource ? { resolutionSource } : {}),
    outcomes: [outcome],
  };

  return { event, outcome };
}

export function canonicalOutcomeKey(label: string): string {
  return slugKey(label) || "yes";
}

export function canonicalEventKey(
  title: string,
  expectedResolutionAt?: number | null,
): string {
  const titleKey = slugKey(title) || "event";
  const dateKey = expectedResolutionAt
    ? new Date(expectedResolutionAt).toISOString().slice(0, 10)
    : "";

  return dateKey ? `${titleKey}-${dateKey}` : titleKey;
}

function buildCanonicalOutcome(input: {
  eventId: string;
  eventKey: string;
  label: string;
  expectedResolutionAt: number | null;
  refs: CanonicalVenueOutcomeRef[];
  rulesText?: string;
  resolutionSource?: string;
}): CanonicalOutcome {
  const outcomeKey = canonicalOutcomeKey(input.label);

  return {
    id: `outcome:${input.eventKey}:${outcomeKey}`,
    eventId: input.eventId,
    outcomeKey,
    label: input.label,
    side: "YES",
    expectedResolutionAt: input.expectedResolutionAt,
    ...(input.rulesText ? { rulesText: input.rulesText } : {}),
    ...(input.resolutionSource
      ? { resolutionSource: input.resolutionSource }
      : {}),
    venueRefs: input.refs.map((ref) => ({ ...ref, outcomeKey })),
  };
}

function buildKalshiRef(
  kalshi: CanonicalKalshiMarketInput,
  label: string,
  expectedResolutionAt: number | null,
): CanonicalVenueOutcomeRef {
  const eventId = firstNonEmpty([kalshi.eventTicker, kalshi.ticker]);
  const rulesText = kalshiRulesText(kalshi);

  return {
    venue: "kalshi",
    eventId,
    marketId: kalshi.ticker,
    outcomeId: `${kalshi.ticker}:YES`,
    outcomeKey: canonicalOutcomeKey(label),
    label,
    side: "YES",
    title: firstNonEmpty([kalshi.title, kalshi.ticker]),
    ...(kalshi.subtitle ? { subtitle: kalshi.subtitle } : {}),
    ticker: kalshi.ticker,
    expectedResolutionAt,
    ...(rulesText ? { rulesText } : {}),
    ...(kalshi.liquidityDollars !== undefined
      ? { liquidityDollars: normalizeNullableNumber(kalshi.liquidityDollars) }
      : {}),
    ...(kalshi.volume24h !== undefined
      ? { volume24h: normalizeNullableNumber(kalshi.volume24h) }
      : {}),
  };
}

function buildPolymarketRef(
  polymarket: CanonicalPolymarketBinaryMarketInput,
  label: string,
  expectedResolutionAt: number | null,
): CanonicalVenueOutcomeRef {
  const rulesText = optionalString(polymarket.rulesText);
  const resolutionSource = optionalString(polymarket.resolutionSource);

  return {
    venue: "polymarket",
    eventId: polymarket.slug,
    marketId: polymarket.slug,
    outcomeId: polymarket.yesTokenId,
    outcomeKey: canonicalOutcomeKey(label),
    label,
    side: "YES",
    title: firstNonEmpty([polymarket.question, polymarket.slug]),
    slug: polymarket.slug,
    yesTokenId: polymarket.yesTokenId,
    noTokenId: polymarket.noTokenId,
    expectedResolutionAt,
    ...(rulesText ? { rulesText } : {}),
    ...(resolutionSource ? { resolutionSource } : {}),
    ...(polymarket.liquidityDollars !== undefined
      ? {
          liquidityDollars: normalizeNullableNumber(
            polymarket.liquidityDollars,
          ),
        }
      : {}),
    ...(polymarket.volume24h !== undefined
      ? { volume24h: normalizeNullableNumber(polymarket.volume24h) }
      : {}),
  };
}

function kalshiResolutionAt(kalshi: CanonicalKalshiMarketInput): number | null {
  return (
    normalizeNullableNumber(kalshi.closeTime) ??
    normalizeNullableNumber(kalshi.expectedExpirationTime)
  );
}

function kalshiRulesText(kalshi: CanonicalKalshiMarketInput): string {
  return combineUniqueText([kalshi.rulesPrimary, kalshi.rulesSecondary]);
}

function latestKnownNumber(values: Array<number | null | undefined>): number | null {
  const parsed = values.filter((value): value is number => Number.isFinite(value));

  return parsed.length === 0 ? null : Math.max(...parsed);
}

function combineUniqueText(values: unknown[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const value of values) {
    const text = optionalString(value);

    if (!text || seen.has(text)) {
      continue;
    }

    seen.add(text);
    parts.push(text);
  }

  return parts.join("\n\n");
}

function firstNonEmpty(values: unknown[]): string {
  return values.map(optionalString).find((value) => value.length > 0) ?? "";
}

function slugKey(value: unknown): string {
  return optionalString(value)
    .toLowerCase()
    .replace(/%/gu, " percent ")
    .replace(/\$/gu, " dollar ")
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
}

function normalizeNullableNumber(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function optionalString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}
