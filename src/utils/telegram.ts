import axios from "axios";

const DEFAULT_TELEGRAM_TIMEOUT_MS = 10_000;
const MAX_TELEGRAM_MESSAGE_LENGTH = 3_900;

export type TelegramAlertConfig = {
  botToken?: string;
  chatId?: string;
  enabled: boolean;
  timeoutMs: number;
};

export type TelegramAlertResult = {
  error?: string;
  ok: boolean;
  skipped: boolean;
};

export type TelegramHttpSender = (
  url: string,
  payload: Record<string, string | boolean>,
  options: { timeoutMs: number }
) => Promise<unknown>;

export function loadTelegramAlertConfig(
  env: NodeJS.ProcessEnv = process.env
): TelegramAlertConfig {
  const enabled = parseBoolean(env.TELEGRAM_ALERTS_ENABLED, false);
  const timeoutMs = parsePositiveInteger(
    env.TELEGRAM_TIMEOUT_MS,
    DEFAULT_TELEGRAM_TIMEOUT_MS,
    "TELEGRAM_TIMEOUT_MS"
  );

  if (!enabled) {
    return {
      enabled: false,
      timeoutMs
    };
  }

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is required when TELEGRAM_ALERTS_ENABLED=true."
    );
  }

  if (!chatId) {
    throw new Error(
      "TELEGRAM_CHAT_ID is required when TELEGRAM_ALERTS_ENABLED=true."
    );
  }

  return {
    botToken,
    chatId,
    enabled: true,
    timeoutMs
  };
}

export async function sendTelegramAlert(
  config: TelegramAlertConfig,
  message: string,
  sender: TelegramHttpSender = axiosTelegramSender
): Promise<TelegramAlertResult> {
  if (!config.enabled) {
    return {
      ok: true,
      skipped: true
    };
  }

  if (!config.botToken || !config.chatId) {
    return {
      error: "telegram alert config is incomplete",
      ok: false,
      skipped: false
    };
  }

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const payload = {
    chat_id: config.chatId,
    disable_web_page_preview: true,
    text: truncateTelegramMessage(message)
  };

  try {
    await sender(url, payload, { timeoutMs: config.timeoutMs });

    return {
      ok: true,
      skipped: false
    };
  } catch (error) {
    return {
      error: sanitizeTelegramError(error, config.botToken, config.chatId),
      ok: false,
      skipped: false
    };
  }
}

export function formatTelegramAlert(
  title: string,
  fields: Record<string, string | number | boolean | undefined> = {}
): string {
  const lines = [title];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

export function sanitizeTelegramError(
  error: unknown,
  botToken?: string,
  chatId?: string
): string {
  const message = axios.isAxiosError(error)
    ? error.response?.status !== undefined
      ? `telegram api status ${error.response.status}`
      : error.message
    : error instanceof Error
      ? error.message
      : String(error);

  return redactTelegramSecrets(message, botToken, chatId);
}

function axiosTelegramSender(
  url: string,
  payload: Record<string, string | boolean>,
  options: { timeoutMs: number }
): Promise<unknown> {
  return axios.post(url, payload, {
    timeout: options.timeoutMs
  });
}

function truncateTelegramMessage(message: string): string {
  if (message.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 14)}\n[truncated]`;
}

function redactTelegramSecrets(
  value: string,
  botToken?: string,
  chatId?: string
): string {
  let redacted = value.replace(/bot[^/\s]+/g, "bot<redacted>");

  if (botToken) {
    redacted = redacted.replaceAll(botToken, "<redacted>");
  }

  if (chatId) {
    redacted = redacted.replaceAll(chatId, "<redacted>");
  }

  return redacted;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean env value: ${value}`);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}
