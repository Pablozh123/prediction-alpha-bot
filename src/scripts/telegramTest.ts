import "dotenv/config";
import {
  formatTelegramAlert,
  loadTelegramAlertConfig,
  sendTelegramAlert
} from "../utils/telegram.js";

async function main(): Promise<void> {
  const config = loadTelegramAlertConfig(process.env);

  if (!config.enabled) {
    throw new Error(
      "Telegram alerts are disabled. Set TELEGRAM_ALERTS_ENABLED=true locally to send a test alert."
    );
  }

  const result = await sendTelegramAlert(
    config,
    formatTelegramAlert("Paper bot Telegram test", {
      paperOnly: true,
      source: "telegram:test"
    })
  );

  if (!result.ok) {
    throw new Error(result.error ?? "telegram test alert failed");
  }

  console.log("telegram test alert sent");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exit(1);
});
