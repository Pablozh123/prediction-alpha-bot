import "dotenv/config";
import axios, { isAxiosError } from "axios";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ODDPOOL_BASE_URL = "https://api.oddpool.com";
const DEFAULT_OUTPUT_PATH = resolve("logs", "oddpool-reference.json");
const DEFAULT_MIN_NET_CENTS = 0.5;
const DEFAULT_SPREAD_MINUTES = 10;
const DEFAULT_TIMEOUT_MS = 20_000;
const ODDPOOL_KEY_PLACEHOLDER = "paste_your_oddpool_key_here";

type QueryParams = Record<string, string | number | boolean>;

export type OddpoolFetchJsonOptions = {
  apiKey: string;
  params: QueryParams;
  timeoutMs: number;
};

export type OddpoolFetchJson = (
  url: string,
  options: OddpoolFetchJsonOptions,
) => Promise<unknown>;

export type OddpoolReferenceOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchJson?: OddpoolFetchJson;
  includeOrderbook?: boolean;
  minNetCents?: number;
  now?: () => Date;
  outputPath?: string;
  quiet?: boolean;
  spreadMinutes?: number;
  timeoutMs?: number;
};

export type OddpoolReferenceData = {
  version: 1;
  generatedAt: string;
  source: "oddpool";
  mode: "dev-reference";
  endpoints: {
    arbitrage: {
      path: "/arbitrage/current";
      params: {
        min_net_cents: number;
        orderbook: boolean;
      };
    };
    priceSpreads: {
      path: "/arbitrage/current/difference";
      params: {
        minutes: number;
      };
    };
  };
  endpointStatus: {
    arbitrage: OddpoolEndpointStatus;
    priceSpreads: OddpoolEndpointStatus;
  };
  summary: {
    arbitrageCount: number;
    priceSpreadCount: number;
    topArbitrage: OddpoolArbitrageSummary[];
    topPriceSpreads: OddpoolPriceSpreadSummary[];
  };
  raw: {
    arbitrage: unknown[];
    priceSpreads: unknown[];
  };
};

export type OddpoolEndpointStatus =
  | {
      ok: true;
      rows: number;
    }
  | {
      ok: false;
      rows: 0;
      error: string;
    };

export type OddpoolReferenceWriteResult = {
  data: OddpoolReferenceData;
  outputPath: string;
};

export type OddpoolArbitrageSummary = {
  eventTitle: string | null;
  label: string | null;
  buyYesMarket: string | null;
  buyNoMarket: string | null;
  netCents: number | null;
  executableSize: number | null;
  maxProfitDollars: number | null;
  timestamp: string | null;
};

export type OddpoolPriceSpreadSummary = {
  eventTitle: string | null;
  label: string | null;
  side: string | null;
  side1: string | null;
  side2: string | null;
  side1Price: number | null;
  side2Price: number | null;
  diff: number | null;
  timestamp: string | null;
};

export async function writeOddpoolReference(
  options: OddpoolReferenceOptions = {},
): Promise<OddpoolReferenceWriteResult> {
  const outputPath = resolve(options.outputPath ?? DEFAULT_OUTPUT_PATH);
  const data = await buildOddpoolReference(options);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  return { data, outputPath };
}

export async function buildOddpoolReference(
  options: OddpoolReferenceOptions = {},
): Promise<OddpoolReferenceData> {
  const apiKey = requireOddpoolApiKey(options.apiKey ?? process.env.ODDPOOL_API_KEY);
  const baseUrl = stripTrailingSlash(options.baseUrl ?? DEFAULT_ODDPOOL_BASE_URL);
  const fetchJson = options.fetchJson ?? fetchOddpoolJson;
  const minNetCents = finiteNumber(options.minNetCents, DEFAULT_MIN_NET_CENTS);
  const includeOrderbook = options.includeOrderbook ?? true;
  const spreadMinutes = finiteNumber(options.spreadMinutes, DEFAULT_SPREAD_MINUTES);
  const timeoutMs = finiteNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const arbitrageParams = {
    min_net_cents: minNetCents,
    orderbook: includeOrderbook,
  };
  const priceSpreadParams = {
    minutes: spreadMinutes,
  };
  const [arbitrageResult, priceSpreadResult] = await Promise.all([
    fetchOptionalRows("Oddpool arbitrage response", () =>
      fetchJson(`${baseUrl}/arbitrage/current`, {
        apiKey,
        params: arbitrageParams,
        timeoutMs,
      }),
    ),
    fetchOptionalRows("Oddpool price-spread response", () =>
      fetchJson(`${baseUrl}/arbitrage/current/difference`, {
        apiKey,
        params: priceSpreadParams,
        timeoutMs,
      }),
    ),
  ]);
  const arbitrageRows = arbitrageResult.rows;
  const priceSpreadRows = priceSpreadResult.rows;

  return {
    version: 1,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    source: "oddpool",
    mode: "dev-reference",
    endpoints: {
      arbitrage: {
        path: "/arbitrage/current",
        params: arbitrageParams,
      },
      priceSpreads: {
        path: "/arbitrage/current/difference",
        params: priceSpreadParams,
      },
    },
    endpointStatus: {
      arbitrage: arbitrageResult.status,
      priceSpreads: priceSpreadResult.status,
    },
    summary: {
      arbitrageCount: arbitrageRows.length,
      priceSpreadCount: priceSpreadRows.length,
      topArbitrage: arbitrageRows.slice(0, 10).map(summarizeArbitrageRow),
      topPriceSpreads: priceSpreadRows.slice(0, 10).map(summarizePriceSpreadRow),
    },
    raw: {
      arbitrage: arbitrageRows,
      priceSpreads: priceSpreadRows,
    },
  };
}

export async function fetchOddpoolJson(
  url: string,
  options: OddpoolFetchJsonOptions,
): Promise<unknown> {
  try {
    const response = await axios.get<unknown>(url, {
      headers: {
        "X-API-Key": options.apiKey,
      },
      params: options.params,
      timeout: options.timeoutMs,
    });

    return response.data;
  } catch (error) {
    throw new Error(safeOddpoolError(url, error), { cause: error });
  }
}

function requireOddpoolApiKey(value: string | undefined): string {
  const apiKey = value?.trim();

  if (!apiKey || apiKey === ODDPOOL_KEY_PLACEHOLDER) {
    throw new Error(
      "Missing Oddpool API key. Set ODDPOOL_API_KEY in your local .env first.",
    );
  }

  return apiKey;
}

async function fetchOptionalRows(
  label: string,
  fetchRows: () => Promise<unknown>,
): Promise<{
  rows: unknown[];
  status: OddpoolEndpointStatus;
}> {
  try {
    const rows = requireArray(await fetchRows(), label);

    return {
      rows,
      status: {
        ok: true,
        rows: rows.length,
      },
    };
  } catch (error) {
    return {
      rows: [],
      status: {
        ok: false,
        rows: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function summarizeArbitrageRow(row: unknown): OddpoolArbitrageSummary {
  return {
    eventTitle: stringField(row, "event_title"),
    label: stringField(row, "label"),
    buyYesMarket: stringField(row, "buy_yes_market"),
    buyNoMarket: stringField(row, "buy_no_market"),
    netCents: numberField(row, "net_cents"),
    executableSize: numberField(row, "executable_size"),
    maxProfitDollars: numberField(row, "max_profit_dollars"),
    timestamp: stringField(row, "timestamp"),
  };
}

function summarizePriceSpreadRow(row: unknown): OddpoolPriceSpreadSummary {
  return {
    eventTitle: stringField(row, "event_title"),
    label: stringField(row, "label"),
    side: stringField(row, "side"),
    side1: stringField(row, "side1"),
    side2: stringField(row, "side2"),
    side1Price: numberField(row, "side1_price"),
    side2Price: numberField(row, "side2_price"),
    diff: numberField(row, "diff"),
    timestamp: stringField(row, "timestamp"),
  };
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} was not an array.`);
  }

  return value;
}

function stringField(value: unknown, key: string): string | null {
  if (!isObject(value)) {
    return null;
  }

  const field = value[key];

  return typeof field === "string" && field.trim() ? field : null;
}

function numberField(value: unknown, key: string): number | null {
  if (!isObject(value)) {
    return null;
  }

  const field = value[key];
  const parsed = typeof field === "number" ? field : Number(field);

  return Number.isFinite(parsed) ? parsed : null;
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function safeOddpoolError(url: string, error: unknown): string {
  const endpoint = new URL(url).pathname;

  if (!isAxiosError(error)) {
    return `Oddpool request failed for ${endpoint}: ${redactSecret(String(error))}`;
  }

  const status = error.response?.status;
  const detail = responseErrorDetail(error.response?.data);

  return [
    `Oddpool request failed for ${endpoint}`,
    status ? `HTTP ${status}` : null,
    detail,
  ]
    .filter(Boolean)
    .join(": ");
}

function responseErrorDetail(value: unknown): string | null {
  if (typeof value === "string") {
    return redactSecret(value).slice(0, 240);
  }

  if (!isObject(value)) {
    return null;
  }

  const message = value.error ?? value.message ?? value.detail;

  if (typeof message === "string") {
    return redactSecret(message).slice(0, 240);
  }

  return null;
}

function redactSecret(value: string): string {
  return value.replace(/oddpool_[A-Za-z0-9_-]+/gu, "oddpool_[redacted]");
}

function parseOptions(argv: string[]): OddpoolReferenceOptions {
  const options: OddpoolReferenceOptions = {};

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--no-orderbook") {
      options.includeOrderbook = false;
      continue;
    }

    const [key, value] = arg.split("=", 2);

    if (!value) {
      continue;
    }

    if (key === "--base-url") {
      options.baseUrl = value;
    } else if (key === "--min-net-cents") {
      options.minNetCents = Number(value);
    } else if (key === "--output") {
      options.outputPath = value;
    } else if (key === "--spread-minutes") {
      options.spreadMinutes = Number(value);
    } else if (key === "--timeout-ms") {
      options.timeoutMs = Number(value);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(
    [
      "Usage: npm run oddpool:reference -- [options]",
      "",
      "Options:",
      "  --min-net-cents=0.5       Minimum Oddpool net cents for arb rows",
      "  --spread-minutes=10       Price-spread lookback window",
      "  --no-orderbook            Skip attached top-25 ask ladders",
      "  --output=logs/file.json   Output JSON path",
      "  --timeout-ms=20000        Per-request timeout",
      "",
      "Reads ODDPOOL_API_KEY from local .env. The key is never written to output.",
    ].join("\n"),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMainModule(): boolean {
  const entry = process.argv[1];

  return entry ? import.meta.url === pathToFileURL(entry).href : false;
}

if (isMainModule()) {
  writeOddpoolReference(parseOptions(process.argv.slice(2)))
    .then((result) => {
      if (!result.data.endpointStatus.arbitrage.ok) {
        console.warn(`Oddpool arbitrage unavailable: ${result.data.endpointStatus.arbitrage.error}`);
      }
      if (!result.data.endpointStatus.priceSpreads.ok) {
        console.warn(`Oddpool price spreads unavailable: ${result.data.endpointStatus.priceSpreads.error}`);
      }
      if (result.data.summary.topArbitrage[0]) {
        const top = result.data.summary.topArbitrage[0];
        console.log(
          `Top Oddpool arb: ${top.eventTitle ?? "unknown"} / ${top.label ?? "unknown"} (${top.netCents ?? "n/a"}c net)`,
        );
      }
      console.log(`Oddpool arbs: ${result.data.summary.arbitrageCount}`);
      console.log(`Oddpool price spreads: ${result.data.summary.priceSpreadCount}`);
      console.log(`Saved reference JSON: ${result.outputPath}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
