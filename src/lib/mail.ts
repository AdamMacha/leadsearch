import "server-only";
import nodemailer from "nodemailer";
import { config } from "./config";

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!config.smtpUser || !config.smtpPass) {
    throw new Error(
      "E-mailový server není nastaven. Nastav SMTP_USER a SMTP_PASS v .env.local / Vercelu.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  const from =
    config.smtpFrom ||
    (config.sender.email
      ? `"${config.sender.name}" <${config.sender.email}>`
      : `"${config.sender.name}" <${config.smtpUser}>`);

  // HTML format preserving line breaks and paragraphs cleanly
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #1e293b;">${p.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1e293b; background-color: #ffffff; padding: 20px; max-width: 620px; margin: 0 auto;">
    ${paragraphs}
  </body>
</html>`;

  const info = await transporter.sendMail({
    from,
    to,
    replyTo: config.sender.email || config.smtpUser,
    subject,
    text,
    html,
  });

  return info;
}
