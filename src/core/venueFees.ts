/**
 * Venue fee curves for Polymarket and Kalshi.
 *
 * Both venues price the taker fee on the variance of a binary outcome:
 *
 *     fee_usd = shares * rate * p * (1 - p)
 *
 * so the fee peaks at p = 0.50 and vanishes toward 0 and 1. What differs is
 * the rate (Polymarket sets it per category, Kalshi uses one rate), the
 * rounding (Kalshi rounds the order fee up to the next cent, Polymarket does
 * not), and who pays (Polymarket charges takers only; Kalshi charges takers
 * and, on selected markets, makers at roughly a quarter rate).
 *
 * The table is the one the sibling research project recorded from the venue
 * documentation on 2026-07-30 (see FEE_SOURCES). Polymarket was fee-free when
 * this scanner's May 2026 runs were measured; since the 2026 fee rollout every
 * quoted gap has to clear both curves before it is an edge at all.
 *
 * Arithmetic only. No network, no order path, no credentials.
 */

export const FEE_MODEL_VERSION = "2026-07-30";

export const FEE_SOURCES = {
  polymarket: "docs.polymarket.com/trading/fees (retrieved 2026-07-30)",
  kalshi:
    "help.kalshi.com Fees + kalshi.com/docs/kalshi-fee-schedule.pdf (retrieved 2026-07-30)",
} as const;

export type FeeVenue = "kalshi" | "polymarket";
export type LegRole = "maker" | "taker";
export type ExecutionRoleMode = "taker" | "maker_first";

/** Polymarket taker rate per category: fee_usd = shares * rate * p * (1 - p). */
export const POLYMARKET_TAKER_RATES: Readonly<Record<string, number>> = {
  crypto: 0.07,
  sports: 0.05,
  economics: 0.05,
  culture: 0.05,
  weather: 0.05,
  other: 0.05,
  finance: 0.04,
  politics: 0.04,
  mentions: 0.04,
  tech: 0.04,
  geopolitics: 0,
};

export const POLYMARKET_DEFAULT_CATEGORY = "other";

/**
 * The general Polymarket taker rate is not settled: the venue documentation
 * says 5 percent, secondary sources from the same period say 3 percent. This
 * module uses the documented (higher) rate, which is the conservative choice
 * for an edge scanner; the note is carried so no output presents it as exact.
 */
export const POLYMARKET_RATE_DISPUTE_NOTE =
  "General Polymarket taker rate documented at 5%; secondary sources say 3%. The documented rate is used.";

/** Makers pay nothing on Polymarket. The rebate is not credited here. */
export const POLYMARKET_MAKER_RATE = 0;

/** Kalshi: one taker rate, order fee rounded UP to the next cent. */
export const KALSHI_TAKER_RATE = 0.07;
/** Kalshi maker fee on the markets that charge one; assumed charged. */
export const KALSHI_MAKER_RATE = 0.0175;

const KALSHI_TO_POLYMARKET_CATEGORY: Readonly<Record<string, string>> = {
  elections: "politics",
  politics: "politics",
  economics: "economics",
  financials: "finance",
  companies: "finance",
  crypto: "crypto",
  "climate and weather": "weather",
  weather: "weather",
  sports: "sports",
  entertainment: "culture",
  mentions: "mentions",
  world: "geopolitics",
  "science and technology": "tech",
};

export type FeeLegInput = {
  venue: FeeVenue;
  role: LegRole;
  price: number;
  shares: number;
  category?: string | null;
};

export function normalizeFeeCategory(category: string | null | undefined): string {
  const key = (category ?? "").trim().toLowerCase();

  if (!key) {
    return POLYMARKET_DEFAULT_CATEGORY;
  }

  if (key in POLYMARKET_TAKER_RATES) {
    return key;
  }

  if (key in KALSHI_TO_POLYMARKET_CATEGORY) {
    return KALSHI_TO_POLYMARKET_CATEGORY[key] ?? POLYMARKET_DEFAULT_CATEGORY;
  }

  if (/crypto|bitcoin|ethereum|solana|token/u.test(key)) {
    return "crypto";
  }

  if (/politic|election|senate|president|congress|governor/u.test(key)) {
    return "politics";
  }

  if (/geopolit|war|ukraine|israel|iran|nato/u.test(key)) {
    return "geopolitics";
  }

  if (/sport|nba|nfl|mlb|nhl|soccer|tennis|ufc/u.test(key)) {
    return "sports";
  }

  if (/econ|fed|inflation|gdp|rates?/u.test(key)) {
    return "economics";
  }

  if (/financ|stock|earnings|company|companies/u.test(key)) {
    return "finance";
  }

  if (/mention/u.test(key)) {
    return "mentions";
  }

  if (/tech|ai|openai|apple|google/u.test(key)) {
    return "tech";
  }

  if (/weather|climate|hurricane|temperature/u.test(key)) {
    return "weather";
  }

  if (/culture|entertain|music|movie|tv|award/u.test(key)) {
    return "culture";
  }

  return POLYMARKET_DEFAULT_CATEGORY;
}

export function polymarketTakerRate(category: string | null | undefined): number {
  const normalized = normalizeFeeCategory(category);

  return (
    POLYMARKET_TAKER_RATES[normalized] ??
    POLYMARKET_TAKER_RATES[POLYMARKET_DEFAULT_CATEGORY] ??
    0.05
  );
}

/** p * (1 - p), clamped so prices outside (0, 1) cannot produce a credit. */
export function binaryVariance(price: number): number {
  const p = Math.max(0, Math.min(1, Number.isFinite(price) ? price : 0));

  return p * (1 - p);
}

export function polymarketFeeUsd(input: {
  role: LegRole;
  price: number;
  shares: number;
  category?: string | null;
}): number {
  if (input.role === "maker") {
    return roundUsd(Math.max(0, input.shares) * POLYMARKET_MAKER_RATE * binaryVariance(input.price));
  }

  const rate = polymarketTakerRate(input.category);

  return roundUsd(Math.max(0, input.shares) * rate * binaryVariance(input.price));
}

/**
 * Kalshi rounds the whole order fee up to the next cent, not each contract, so
 * a one-contract order pays the same cent as a small block. That rounding is a
 * real cost at the clip sizes a cross-venue basket usually gets filled in.
 */
export function kalshiFeeUsd(input: {
  role: LegRole;
  price: number;
  shares: number;
}): number {
  const rate = input.role === "maker" ? KALSHI_MAKER_RATE : KALSHI_TAKER_RATE;
  const raw = Math.max(0, input.shares) * rate * binaryVariance(input.price);

  if (raw <= 0) {
    return 0;
  }

  // Round the float remainder away before ceiling: 0.07 * 100 * 0.25 is
  // 1.7500000000000002 in JS and would otherwise become 1.76.
  return Math.ceil(Math.round(raw * 100 * 1e9) / 1e9) / 100;
}

/**
 * Fee rate of one leg (fee per share = rate * p * (1 - p)), without Kalshi's
 * per-order cent rounding. Ladder walks use this per level; the rounded total
 * is applied once on the executable size by `legFeeUsd`.
 */
export function legFeeRate(input: {
  venue: FeeVenue;
  role: LegRole;
  category?: string | null;
}): number {
  if (input.venue === "kalshi") {
    return input.role === "maker" ? KALSHI_MAKER_RATE : KALSHI_TAKER_RATE;
  }

  return input.role === "maker"
    ? POLYMARKET_MAKER_RATE
    : polymarketTakerRate(input.category);
}

export function legFeeUsd(leg: FeeLegInput): number {
  if (!Number.isFinite(leg.shares) || leg.shares <= 0) {
    return 0;
  }

  return leg.venue === "kalshi"
    ? kalshiFeeUsd(leg)
    : polymarketFeeUsd(leg);
}

/** Fee in cents per share, for threshold displays. */
export function legFeeCentsPerShare(leg: FeeLegInput): number {
  if (!Number.isFinite(leg.shares) || leg.shares <= 0) {
    return 0;
  }

  return roundCents((legFeeUsd(leg) / leg.shares) * 100);
}

/**
 * Assign maker/taker roles to the legs of one basket.
 *
 * `taker` prices every leg as an aggressive fill: the conservative estimate.
 * `maker_first` assumes one leg rests as a limit order and the other is taken
 * once it fills; the resting leg is the one whose taker fee would be highest,
 * because that is where posting saves the most. A resting order is an
 * assumption about the fill, not a fact, so the mode is a configuration and
 * the role travels with every published leg.
 */
export function assignLegRoles<T extends { venue: FeeVenue; price: number; category?: string | null }>(
  legs: T[],
  mode: ExecutionRoleMode,
): Array<T & { role: LegRole }> {
  if (mode === "taker" || legs.length === 0) {
    return legs.map((leg) => ({ ...leg, role: "taker" as LegRole }));
  }

  let makerIndex = 0;
  let highestFee = -1;

  legs.forEach((leg, index) => {
    const fee = legFeeUsd({ ...leg, role: "taker", shares: 100 });

    if (fee > highestFee) {
      highestFee = fee;
      makerIndex = index;
    }
  });

  return legs.map((leg, index) => ({
    ...leg,
    role: (index === makerIndex ? "maker" : "taker") as LegRole,
  }));
}

export function parseExecutionRoleMode(
  value: string | undefined,
  fallback: ExecutionRoleMode = "taker",
): ExecutionRoleMode {
  const normalized = (value ?? "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === "taker" || normalized === "taker_only") {
    return "taker";
  }

  if (normalized === "maker_first" || normalized === "maker-first") {
    return "maker_first";
  }

  throw new Error(
    `EXECUTION_ROLE_MODE must be "taker" or "maker_first", got "${value}".`,
  );
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
