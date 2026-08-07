import "dotenv/config";
import axios from "axios";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ENV_PATH = ".env";

type TelegramUpdateResponse = {
  ok?: boolean;
  result?: Array<{
    message?: {
      chat?: {
        id?: number | string;
      };
    };
  }>;
};

async function main(): Promise<void> {
  const rl = createInterface({ input, output });

  try {
    console.log("Telegram setup writes only to local .env.");
    console.log("Do not commit .env and do not paste secrets into chat.");

    const token = (await rl.question("Telegram bot token: ")).trim();

    if (!token) {
      throw new Error("Telegram bot token is required.");
    }

    let chatId = (await rl.question("Telegram chat id (blank = auto-detect): "))
      .trim();

    if (!chatId) {
      chatId = await detectChatId(token);
    }

    writeLocalEnv({
      PAPER_ONLY: "true",
      TELEGRAM_ALERTS_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: token,
      TELEGRAM_CHAT_ID: chatId,
      TELEGRAM_TIMEOUT_MS: "10000"
    });

    console.log("Telegram settings saved to local .env.");
    console.log("Run npm run telegram:test to send a test alert.");
  } finally {
    rl.close();
  }
}

async function detectChatId(token: string): Promise<string> {
  const response = await axios.get<TelegramUpdateResponse>(
    `https://api.telegram.org/bot${token}/getUpdates`,
    {
      timeout: 10_000
    }
  );
  const chatId = response.data.result?.find(
    (update) => update.message?.chat?.id !== undefined
  )?.message?.chat?.id;

  if (chatId === undefined) {
    throw new Error(
      "Could not auto-detect chat id. Send /start to your bot in Telegram, then run setup again."
    );
  }

  return String(chatId);
}

function writeLocalEnv(values: Record<string, string>): void {
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const updated = lines.map((line) => {
    const match = line.match(/^\s*([^#=\s]+)\s*=/);

    if (!match) {
      return line;
    }

    const key = match[1];

    if (!(key in values)) {
      return line;
    }

    seen.add(key);

    return `${key}=${values[key]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      updated.push(`${key}=${value}`);
    }
  }

  writeFileSync(ENV_PATH, `${updated.filter(Boolean).join("\n")}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message.replace(/bot[^/\s]+/g, "bot<redacted>"));
  process.exit(1);
});
