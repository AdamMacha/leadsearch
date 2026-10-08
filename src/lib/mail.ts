import "server-only";
import nodemailer from "nodemailer";
import { config } from "./config";
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(text: string): string {
  // convert emails
  let res = text.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (m) => {
    return `<a href="mailto:${m}" style="color: #4f46e5; text-decoration: none;">${m}</a>`;
  });
  // convert urls
  res = res.replace(/(https?:\/\/[^\s<>"]+)/g, (url) => {
    return `<a href="${url}" style="color: #4f46e5; text-decoration: underline;" target="_blank" rel="noreferrer">${url}</a>`;
  });
  return res;
}

export function formatOutreachHtml(text: string, subject: string): string {
  const isAuditLink = (url: string) =>
    /web\.technologio\.eu|audit\.technologio\.eu|\/a\/[a-z0-9-]+|localhost:3000\/a\//i.test(url);

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocks: string[] = [];

  for (const p of paragraphs) {
    // Check if paragraph is signature
    if (/^s\s+pozdravem/i.test(p) || /^s\s+přátelským\s+pozdravem/i.test(p)) {
      const phoneFormatted = config.sender.phone
        ? config.sender.phone.replace(/^(\+?\d{3})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4")
        : null;

      blocks.push(`
        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">S pozdravem,</div>
          <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(config.sender.name)}</div>
          <div style="font-size: 13px; color: #475569; margin-top: 3px;">
            Webový vývojář &middot; <a href="${config.sender.web}" style="color: #4f46e5; text-decoration: none; font-weight: 600;" target="_blank" rel="noreferrer">${escapeHtml(config.sender.company)}</a>
          </div>
          <div style="font-size: 13px; color: #64748b; margin-top: 8px;">
            ${phoneFormatted ? `<span style="display: inline-block; margin-right: 12px;">tel. <a href="tel:${config.sender.phone.replace(/\s/g, "")}" style="color: #334155; text-decoration: none;">${phoneFormatted}</a></span>` : ""}
            ${config.sender.email ? `<span style="display: inline-block;"><a href="mailto:${config.sender.email}" style="color: #334155; text-decoration: none;">${escapeHtml(config.sender.email)}</a></span>` : ""}
          </div>
        </div>
      `);
      continue;
    }

    // Check if paragraph contains an audit link
    const auditMatch = p.match(/(https?:\/\/[^\s<>"]+)/);
    if (auditMatch && isAuditLink(auditMatch[0])) {
      const url = auditMatch[0];
      const beforeText = p.replace(url, "").trim();
      const beforeHtml = beforeText
        ? `<p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.65; color: #334155;">${escapeHtml(beforeText)}</p>`
        : "";

      blocks.push(`
        <div style="margin: 22px 0;">
          ${beforeHtml}
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; text-align: left;">
            <div style="font-size: 11px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">
              PŘIPRAVENÝ ROZBOR A NÁVRH WEBU
            </div>
            <a href="${url}" style="display: inline-block; background-color: #4f46e5; background: linear-gradient(135deg, #6366f1 0%, #3b82f6 100%); color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; letter-spacing: 0.2px;" target="_blank" rel="noreferrer">
              Zobrazit připravený rozbor webu &rarr;
            </a>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 10px; word-break: break-all;">
              Přímý odkaz: <a href="${url}" style="color: #6366f1; text-decoration: underline;" target="_blank" rel="noreferrer">${url}</a>
            </div>
          </div>
        </div>
      `);
      continue;
    }

    // Normal paragraph
    const pWithLinks = linkify(escapeHtml(p)).replace(/\n/g, "<br>");
    blocks.push(`<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: #334155;">${pWithLinks}</p>`);
  }

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; -webkit-font-smoothing: antialiased;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
      <tr>
        <td style="height: 4px; background: linear-gradient(90deg, #6366f1 0%, #3b82f6 50%, #06b6d4 100%); font-size: 0; line-height: 0;">&nbsp;</td>
      </tr>
      <tr>
        <td style="padding: 32px 28px 26px 28px;">
          ${blocks.join("\n")}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

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

  const html = formatOutreachHtml(text, subject);

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
