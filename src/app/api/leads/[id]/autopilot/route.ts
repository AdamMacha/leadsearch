import { NextResponse } from "next/server";
import { config, auditUrl } from "@/lib/config";
import { repo } from "@/lib/db";
import { notifyTelegram } from "@/lib/notify";
import { analyzeAndSave, createAuditAndOutreach } from "@/lib/services";

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/autopilot">) {
  const { id } = await ctx.params;
  const r = repo();
  let lead = await r.getLead(id);
  if (!lead) return NextResponse.json({ error: "Lead nenalezen" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const autoSend = Boolean(body.autoSend);
  const fastMode = Boolean(body.fastMode);
  const minNeedScore = typeof body.minNeedScore === "number" ? body.minNeedScore : 35;
  const skipNoEmail = body.skipNoEmail !== false;
  const modelOverride = typeof body.modelOverride === "string" ? body.modelOverride.trim() : undefined;

  // 1. Skip if already contacted or in sales pipeline
  if (lead.status === "contacted" || lead.status === "replied" || lead.status === "won" || lead.status === "meeting" || lead.status === "proposal") {
    return NextResponse.json({
      ok: true,
      status: "skipped" as const,
      reason: `Firma již byla dříve kontaktována (${lead.status})`,
      lead,
    });
  }

  // 2. Analyze website if not yet analyzed
  try {
    if (!lead.analyzedAt) {
      lead = await analyzeAndSave(id, { pageSpeed: !fastMode });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: "error" as const,
      reason: `Chyba při analýze webu: ${(err as Error).message}`,
      lead,
    }, { status: 500 });
  }

  // 3. Qualification filter
  if (skipNoEmail && !lead.email) {
    return NextResponse.json({
      ok: true,
      status: "skipped" as const,
      reason: "Firma nemá dohledaný e-mail",
      lead,
    });
  }

  if (lead.website && lead.needScore != null && lead.needScore < minNeedScore) {
    return NextResponse.json({
      ok: true,
      status: "skipped" as const,
      reason: `Web má dobré skóre (potřeba jen ${lead.needScore}/100)`,
      lead,
    });
  }

  // 4. Create Audit & Outreach concurrently in parallel
  try {
    if (!lead.audit || !lead.outreach) {
      lead = await createAuditAndOutreach(id, modelOverride, { pageSpeed: !fastMode });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: "error" as const,
      reason: `Chyba při tvorbě materiálů: ${(err as Error).message}`,
      lead,
    }, { status: 500 });
  }

  const link = lead.auditSlug ? auditUrl(lead.auditSlug) : null;

  // 6. Send Email if requested
  if (autoSend) {
    if (!config.smtpUser || !config.smtpPass) {
      return NextResponse.json({
        ok: false,
        status: "error" as const,
        reason: "E-mailový SMTP server není nastaven. Nastav SMTP_USER a SMTP_PASS v Nastavení.",
        lead,
      }, { status: 400 });
    }

    if (!lead.email) {
      return NextResponse.json({
        ok: true,
        status: "skipped" as const,
        reason: "Nelze odeslat (chybí e-mail)",
        lead,
      });
    }

    if (!lead.outreach?.subject || !lead.outreach?.email) {
      return NextResponse.json({
        ok: false,
        status: "error" as const,
        reason: "Chybí vygenerovaný text e-mailu",
        lead,
      }, { status: 500 });
    }

    const outreach = lead.outreach;
    try {
      const { sendEmail } = await import("@/lib/mail");
      await sendEmail({
        to: lead.email,
        subject: outreach.subject,
        text: outreach.email,
      });

      lead = await r.updateLead(id, { status: "contacted" });
      await r.addActivity(id, "email", `[Autopilot] Automaticky odeslán e-mail na ${lead.email}: "${outreach.subject}"`);

      await notifyTelegram(
        `🚀 <b>[Autopilot]</b> Odeslán e-mail pro <b>${lead.name}</b> (${lead.email})\n🔗 ${link || ""}`
      );

      return NextResponse.json({
        ok: true,
        status: "sent" as const,
        recipient: lead.email,
        auditLink: link,
        lead,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        status: "error" as const,
        reason: `Chyba při odesílání e-mailu: ${(err as Error).message}`,
        lead,
      }, { status: 500 });
    }
  }

  // Safe mode / Prepared only
  return NextResponse.json({
    ok: true,
    status: "prepared" as const,
    auditLink: link,
    lead,
  });
}
