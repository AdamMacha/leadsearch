import "server-only";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const config = {
  appPassword: env("APP_PASSWORD"),
  sessionSecret: env("SESSION_SECRET") ?? "dev-insecure-secret-change-me-please-32chars",
  cronSecret: env("CRON_SECRET"),

  supabaseUrl: env("SUPABASE_URL"),
  supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),

  googlePlacesKey: env("GOOGLE_PLACES_API_KEY"),
  pageSpeedKey: env("PAGESPEED_API_KEY") ?? env("GOOGLE_PLACES_API_KEY"),

  geminiKey: env("GEMINI_API_KEY"),
  geminiModel: env("GEMINI_MODEL") ?? "gemini-3.8-flash",

  telegramToken: env("TELEGRAM_BOT_TOKEN"),
  telegramChatId: env("TELEGRAM_CHAT_ID"),

  auditBaseUrl: env("AUDIT_BASE_URL") ?? "http://localhost:3000/a",

  smtpHost: env("SMTP_HOST") ?? "smtp.seznam.cz",
  smtpPort: Number(env("SMTP_PORT") || "465"),
  smtpSecure: env("SMTP_SECURE") === "false" ? false : true,
  smtpUser: env("SMTP_USER"),
  smtpPass: env("SMTP_PASS"),
  smtpFrom: env("SMTP_FROM"),

  sender: {
    name: env("SENDER_NAME") ?? "Bc. Adam Mácha",
    company: env("SENDER_COMPANY") ?? "Technologio",
    web: env("SENDER_WEB") ?? "https://www.technologio.eu",
    email: env("SENDER_EMAIL") ?? "",
    phone: env("SENDER_PHONE") ?? "",
  },
};

export function integrationStatus() {
  return {
    database: Boolean(config.supabaseUrl && config.supabaseServiceKey),
    places: Boolean(config.googlePlacesKey),
    pageSpeed: Boolean(config.pageSpeedKey),
    gemini: Boolean(config.geminiKey),
    telegram: Boolean(config.telegramToken && config.telegramChatId),
    password: Boolean(config.appPassword),
    email: Boolean(config.smtpUser && config.smtpPass),
  };
}

export function auditUrl(slug: string) {
  return `${config.auditBaseUrl.replace(/\/$/, "")}/${slug}`;
}
