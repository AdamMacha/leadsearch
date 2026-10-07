import "server-only";
import { config } from "./config";

export async function notifyTelegram(text: string) {
  if (!config.telegramToken || !config.telegramChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramChatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("Telegram notify failed", e);
  }
}
