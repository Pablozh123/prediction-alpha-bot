import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatTelegramAlert,
  loadTelegramAlertConfig,
  sanitizeTelegramError,
  sendTelegramAlert
} from "../src/utils/telegram.js";

describe("Telegram alerts", () => {
  it("are disabled by default without requiring secrets", () => {
    expect(loadTelegramAlertConfig({})).toEqual({
      enabled: false,
      timeoutMs: 10_000
    });
  });

  it("require local Telegram settings only when explicitly enabled", () => {
    expect(() =>
      loadTelegramAlertConfig({ TELEGRAM_ALERTS_ENABLED: "true" })
    ).toThrow("TELEGRAM_BOT_TOKEN is required");

    expect(() =>
      loadTelegramAlertConfig({
        TELEGRAM_ALERTS_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "test-token"
      })
    ).toThrow("TELEGRAM_CHAT_ID is required");
  });

  it("sends plain monitoring alerts without real network calls in tests", async () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    const config = loadTelegramAlertConfig({
      TELEGRAM_ALERTS_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat"
    });

    const result = await sendTelegramAlert(
      config,
      formatTelegramAlert("Paper bot started", {
        paperOnly: true,
        scanIntervalMs: 30_000
      }),
      sender
    );

    expect(result).toEqual({
      ok: true,
      skipped: false
    });
    expect(sender).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      {
        chat_id: "test-chat",
        disable_web_page_preview: true,
        text: "Paper bot started\npaperOnly: true\nscanIntervalMs: 30000"
      },
      { timeoutMs: 10_000 }
    );
  });

  it("redacts Telegram token and chat id from errors", async () => {
    const token = "123456:secret-token";
    const chatId = "999999";
    const result = await sendTelegramAlert(
      {
        botToken: token,
        chatId,
        enabled: true,
        timeoutMs: 10_000
      },
      "test",
      async () => {
        throw new Error(
          `failed at https://api.telegram.org/bot${token}/sendMessage for ${chatId}`
        );
      }
    );

    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(token);
    expect(result.error).not.toContain(chatId);
    expect(result.error).toContain("<redacted>");
  });

  it("keeps Telegram code free of live trading hooks", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "utils", "telegram.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/@polymarket\/clob-client/);
    expect(source).not.toMatch(/placeOrder|postOrder|buyLimit|sellPosition/);
    expect(source).not.toMatch(/private[_-]?key|seed phrase/i);
  });

  it("sanitizes raw Telegram API URLs", () => {
    expect(
      sanitizeTelegramError(
        new Error(
          "request failed: https://api.telegram.org/bot123:abc/sendMessage"
        )
      )
    ).not.toContain("123:abc");
  });
});
