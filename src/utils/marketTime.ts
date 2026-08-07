export type CapitalLockClass = 'short' | 'medium' | 'long' | 'unknown';

export interface CapitalLockTelemetry {
  expectedResolutionAt: number | null;
  durationHours: number | null;
  capitalLockClass: CapitalLockClass;
}

export const DEFAULT_MAX_SHORT_DURATION_HOURS = 72;
export const DEFAULT_MEDIUM_DURATION_HOURS = 14 * 24;

const GAMMA_RESOLUTION_KEYS = [
  'end',
  'endDate',
  'endDateIso',
  'endDateISO',
  'end_date',
  'endTime',
  'end_time',
  'endsAt',
  'ends_at',
  'expiry',
  'expiryDate',
  'expiry_date',
  'expiresAt',
  'expires_at',
  'closeTime',
  'close_time',
  'closedTime',
  'closed_time',
  'closingTime',
  'closing_time',
  'expectedExpirationTime',
  'expected_expiration_time',
  'expectedResolutionTime',
  'expected_resolution_time',
  'expectedResolutionDate',
  'expected_resolution_date',
  'resolutionTime',
  'resolution_time',
  'resolutionDate',
  'resolution_date',
  'maturityTime',
  'maturity_time',
  'expirationTime',
  'expiration_time',
] as const;

const TEXT_DATE_KEYS = [
  'slug',
  'ticker',
  'title',
  'question',
  'name',
] as const;

const NESTED_TIME_KEYS = [
  'event',
  'eventMetadata',
  'market',
  'marketMetadata',
  'metadata',
  'resolution',
  'series',
] as const;

export function classifyCapitalLock(
  expectedResolutionAt: number | null | undefined,
  nowMs = Date.now(),
): CapitalLockTelemetry {
  if (!expectedResolutionAt || !Number.isFinite(expectedResolutionAt)) {
    return {
      expectedResolutionAt: null,
      durationHours: null,
      capitalLockClass: 'unknown',
    };
  }

  const durationHours = Math.max(0, (expectedResolutionAt - nowMs) / (60 * 60 * 1000));

  if (durationHours <= DEFAULT_MAX_SHORT_DURATION_HOURS) {
    return { expectedResolutionAt, durationHours, capitalLockClass: 'short' };
  }

  if (durationHours <= DEFAULT_MEDIUM_DURATION_HOURS) {
    return { expectedResolutionAt, durationHours, capitalLockClass: 'medium' };
  }

  return { expectedResolutionAt, durationHours, capitalLockClass: 'long' };
}

export function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveExpectedResolutionAt(
  ...records: Array<Record<string, unknown> | null | undefined>
): number | null {
  for (const record of records) {
    const parsed = deriveExpectedResolutionAtFromRecord(record);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function latestKnownResolutionAt(values: Array<number | null | undefined>): number | null {
  const known = values.filter((value): value is number => Boolean(value && Number.isFinite(value)));
  if (known.length === 0) {
    return null;
  }

  return Math.max(...known);
}

function deriveExpectedResolutionAtFromRecord(
  record: Record<string, unknown> | null | undefined,
  depth = 0,
): number | null {
  if (!record || depth > 2) {
    return null;
  }

  for (const key of GAMMA_RESOLUTION_KEYS) {
    const parsed = parseTimestampMs(record[key]);
    if (parsed) {
      return parsed;
    }
  }

  for (const key of TEXT_DATE_KEYS) {
    const parsed = parseDateFromMarketText(record[key]);
    if (parsed) {
      return parsed;
    }
  }

  for (const key of NESTED_TIME_KEYS) {
    const value = record[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const parsed = deriveExpectedResolutionAtFromRecord(
        value as Record<string, unknown>,
        depth + 1,
      );
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function parseDateFromMarketText(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/[_\s]+/gu, '-')
    .replace(/[^a-z0-9-]+/gu, '-');
  const monthPattern =
    '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
  const match = normalized.match(
    new RegExp(`(?:by|before|through|until|-)?-?${monthPattern}-(\\d{1,2})-(20\\d{2})\\b`, 'u'),
  );

  if (!match) {
    return null;
  }

  const month = monthIndex(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (month === null || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const parsed = Date.UTC(year, month, day, 23, 59, 59);
  const date = new Date(parsed);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function monthIndex(value: string | undefined): number | null {
  const normalized = value?.toLowerCase();
  const months = new Map<string, number>([
    ['january', 0],
    ['jan', 0],
    ['february', 1],
    ['feb', 1],
    ['march', 2],
    ['mar', 2],
    ['april', 3],
    ['apr', 3],
    ['may', 4],
    ['june', 5],
    ['jun', 5],
    ['july', 6],
    ['jul', 6],
    ['august', 7],
    ['aug', 7],
    ['september', 8],
    ['sep', 8],
    ['sept', 8],
    ['october', 9],
    ['oct', 9],
    ['november', 10],
    ['nov', 10],
    ['december', 11],
    ['dec', 11],
  ]);

  return normalized ? months.get(normalized) ?? null : null;
}
