import "server-only";
import { config, auditUrl } from "./config";
import { repo } from "./db";
import { notifyTelegram } from "./notify";
import { analyzeAndSave, createAuditAndOutreach } from "./services";
import type { Lead } from "./types";

export interface AutopilotLeadOptions {
  autoSend?: boolean;
  minNeedScore?: number;
  skipNoEmail?: boolean;
  fastMode?: boolean;
  modelOverride?: string;
  sourceTrigger?: "manual" | "batch" | "campaign";
}

export interface AutopilotProcessResult {
  ok: boolean;
  status: "sent" | "prepared" | "skipped" | "error";
  reason?: string;
  recipient?: string | null;
  auditLink?: string | null;
  lead?: Lead;
}

export async function processLeadAutopilot(
  id: string,
  opts: AutopilotLeadOptions = {}
): Promise<AutopilotProcessResult> {
  const r = repo();
  let lead = await r.getLead(id);
  if (!lead) {
    return { ok: false, status: "error", reason: "Lead nenalezen" };
  }

  const autoSend = Boolean(opts.autoSend);
  const fastMode = Boolean(opts.fastMode);
  const minNeedScore = typeof opts.minNeedScore === "number" ? opts.minNeedScore : 35;
  const skipNoEmail = opts.skipNoEmail !== false;
  const modelOverride = opts.modelOverride;
  const triggerTag = opts.sourceTrigger === "campaign" ? "[Kampaň]" : "[Autopilot]";

  // 1. Skip if already contacted or in sales pipeline
  if (
    lead.status === "contacted" ||
    lead.status === "replied" ||
    lead.status === "won" ||
    lead.status === "meeting" ||
    lead.status === "proposal"
  ) {
    return {
      ok: true,
      status: "skipped",
      reason: `Firma již byla dříve kontaktována (${lead.status})`,
      lead,
    };
  }

  // 2. Analyze website if not yet analyzed
  try {
    if (!lead.analyzedAt) {
      lead = await analyzeAndSave(id, { pageSpeed: !fastMode, skipNoEmail });
    }
  } catch (err) {
    return {
      ok: false,
      status: "error",
      reason: `Chyba při analýze webu: ${(err as Error).message}`,
      lead,
    };
  }

  // 3. Qualification filter
  if (skipNoEmail && !lead.email) {
    return {
      ok: true,
      status: "skipped",
      reason: "Firma nemá dohledaný e-mail na webu",
      lead,
    };
  }

  if (lead.website && lead.needScore != null && lead.needScore < minNeedScore) {
    return {
      ok: true,
      status: "skipped",
      reason: `Web má dobré skóre (potřeba jen ${lead.needScore}/100, minimum je ${minNeedScore})`,
      lead,
    };
  }

  // 4. Create Audit & Outreach concurrently in parallel
  try {
    if (!lead.audit || !lead.outreach) {
      lead = await createAuditAndOutreach(id, modelOverride, { pageSpeed: !fastMode });
    }
  } catch (err) {
    return {
      ok: false,
      status: "error",
      reason: `Chyba při tvorbě materiálů: ${(err as Error).message}`,
      lead,
    };
  }

  const link = lead.auditSlug ? auditUrl(lead.auditSlug) : null;

  // 5. Send Email if requested
  if (autoSend) {
    if (!config.smtpUser || !config.smtpPass) {
      return {
        ok: false,
        status: "error",
        reason: "E-mailový SMTP server není nastaven. Nastav SMTP_USER a SMTP_PASS v Nastavení.",
        lead,
      };
    }

    if (!lead.email) {
      return {
        ok: true,
        status: "skipped",
        reason: "Nelze odeslat (chybí e-mail)",
        lead,
      };
    }

    if (!lead.outreach?.subject || !lead.outreach?.email) {
      return {
        ok: false,
        status: "error",
        reason: "Chybí vygenerovaný text e-mailu",
        lead,
      };
    }

    const outreach = lead.outreach;
    try {
      const { sendEmail } = await import("./mail");
      await sendEmail({
        to: lead.email,
        subject: outreach.subject,
        text: outreach.email,
      });

      lead = await r.updateLead(id, { status: "contacted" });
      await r.addActivity(
        id,
        "email",
        `${triggerTag} Automaticky odeslán e-mail na ${lead.email}: "${outreach.subject}"`
      );

      await notifyTelegram(
        `🚀 <b>${triggerTag}</b> Odeslán e-mail pro <b>${lead.name}</b> (${lead.email})\n🔗 ${link || ""}`
      );

      return {
        ok: true,
        status: "sent",
        recipient: lead.email,
        auditLink: link,
        lead,
      };
    } catch (err) {
      return {
        ok: false,
        status: "error",
        reason: `Chyba při odesílání e-mailu: ${(err as Error).message}`,
        lead,
      };
    }
  }

  // Safe mode / Prepared only
  return {
    ok: true,
    status: "prepared",
    auditLink: link,
    lead,
  };
}
