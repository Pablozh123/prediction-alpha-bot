import axios from "axios";
import { recordSportsTick, type SportsTickRecord } from "../execution/sportsJournal.js";
import { retryWithBackoff, withTimeout } from "./reliability.js";
import { parseTimestampMs } from "./marketTime.js";

const GAMMA_SPORTS_URL = "https://gamma-api.polymarket.com/sports";
const SPORTS_WS_URL = "wss://sports-api.polymarket.com/ws";
const SPORTS_TIMEOUT_MS = 10_000;

type WebSocketLike = {
  close(): void;
  send(message: string): void;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

export type SportsMetadata = {
  sport: string;
  image: string | null;
  resolution: string | null;
  ordering: string | null;
  tags: string | null;
  series: string | null;
};

export type NormalizedSportsTick = {
  sport: string | null;
  league: string | null;
  gameId: string | null;
  slug: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  ended: boolean;
  finishedTimestamp: number | null;
  raw: unknown;
};

export type SportsFeedRecorder = {
  close(): void;
};

type RawSportsMetadata = Record<string, unknown>;

export async function fetchSportsMetadata(): Promise<SportsMetadata[]> {
  const response = await retryWithBackoff(
    () =>
      withTimeout(
        axios.get<RawSportsMetadata[]>(GAMMA_SPORTS_URL, {
          timeout: SPORTS_TIMEOUT_MS,
        }),
        SPORTS_TIMEOUT_MS + 1_000,
        "Gamma sports metadata request timed out.",
      ),
    { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 },
  );

  return response.data.map(normalizeSportsMetadata);
}

export function startSportsFeedRecorder(input: {
  now?: () => number;
  onError?: (message: string) => void;
  onTick?: (tick: SportsTickRecord) => void;
  url?: string;
  webSocket?: WebSocketConstructor;
} = {}): SportsFeedRecorder {
  const WebSocketCtor =
    input.webSocket ?? (globalThis as { WebSocket?: WebSocketConstructor }).WebSocket;

  if (!WebSocketCtor) {
    throw new Error("Sports WebSocket is not available in this Node runtime.");
  }

  const socket = new WebSocketCtor(input.url ?? SPORTS_WS_URL);
  const now = input.now ?? Date.now;

  socket.onmessage = (event) => {
    if (event.data === "ping") {
      socket.send("pong");
      return;
    }

    try {
      const parsed = parseSportsPayload(event.data);

      for (const tick of parsed) {
        const record = recordSportsTick({
          ...tick,
          raw: tick.raw,
          receivedAt: now(),
        });

        input.onTick?.(record);
      }
    } catch (error) {
      input.onError?.(error instanceof Error ? error.message : String(error));
    }
  };
  socket.onerror = (event) => {
    input.onError?.(`sports websocket error: ${String(event)}`);
  };

  return {
    close(): void {
      socket.close();
    },
  };
}

export function parseSportsPayload(payload: unknown): NormalizedSportsTick[] {
  if (typeof payload !== "string") {
    return [];
  }

  const parsed: unknown = JSON.parse(payload);
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  return rows.flatMap((row) => {
    const normalized = normalizeSportsTick(row);

    return normalized ? [normalized] : [];
  });
}

export function normalizeSportsTick(raw: unknown): NormalizedSportsTick | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const eventState =
    typeof record.eventState === "object" &&
    record.eventState !== null &&
    !Array.isArray(record.eventState)
      ? (record.eventState as Record<string, unknown>)
      : {};
  const gameId =
    optionalString(record.game_id) || optionalString(record.gameId) || null;
  const slug =
    optionalString(record.slug) ||
    optionalString(record.event_slug) ||
    optionalString(record.market_slug) ||
    (gameId ? `game:${gameId}` : "");

  if (!slug) {
    return null;
  }

  const parsedScore = parseSimpleScore(
    optionalString(record.score) || optionalString(eventState.score),
  );
  const status = optionalString(record.status) || optionalString(eventState.status) || null;
  const ended =
    optionalBoolean(record.ended) ||
    optionalBoolean(record.finished) ||
    optionalBoolean(eventState.ended) ||
    optionalBoolean(eventState.finished) ||
    ["final", "finished", "complete", "completed", "ended"].includes(
      (status || "").toLowerCase(),
    );

  return {
    sport:
      optionalString(record.sport) ||
      optionalString(record.league) ||
      optionalString(record.leagueAbbreviation) ||
      null,
    league:
      optionalString(record.league) ||
      optionalString(record.leagueAbbreviation) ||
      null,
    gameId,
    slug,
    homeTeam:
      optionalString(record.homeTeam) ||
      optionalString(record.home_team) ||
      optionalString(record.home) ||
      null,
    awayTeam:
      optionalString(record.awayTeam) ||
      optionalString(record.away_team) ||
      optionalString(record.away) ||
      null,
    homeScore:
      optionalNumber(record.home_score) ??
      optionalNumber(record.homeScore) ??
      optionalNumber(record.home_points) ??
      parsedScore?.homeScore ??
      null,
    awayScore:
      optionalNumber(record.away_score) ??
      optionalNumber(record.awayScore) ??
      optionalNumber(record.away_points) ??
      parsedScore?.awayScore ??
      null,
    status,
    ended,
    finishedTimestamp:
      parseTimestampMs(record.finished_timestamp) ??
      parseTimestampMs(record.finishedTimestamp) ??
      parseTimestampMs(record.end_time) ??
      null,
    raw,
  };
}

function normalizeSportsMetadata(raw: RawSportsMetadata): SportsMetadata {
  return {
    sport: optionalString(raw.sport),
    image: optionalString(raw.image) || null,
    resolution: optionalString(raw.resolution) || null,
    ordering: optionalString(raw.ordering) || null,
    tags: optionalString(raw.tags) || null,
    series: optionalString(raw.series) || null,
  };
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

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function optionalBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "final", "finished"].includes(
      value.trim().toLowerCase(),
    );
  }

  return false;
}

function parseSimpleScore(
  value: string,
): { homeScore: number; awayScore: number } | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/u);

  if (!match) {
    return null;
  }

  const homeScore = Number(match[1]);
  const awayScore = Number(match[2]);

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }

  return { homeScore, awayScore };
}
