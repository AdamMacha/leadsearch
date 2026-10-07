"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createSessionToken, safeEqual, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";
import { repo } from "@/lib/db";
import { addManualLead, createAudit, createOutreach } from "@/lib/services";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/types";

/* ---------- Auth ---------- */

/** Server actions are public endpoints – verify the session in each one (defense in depth beyond proxy). */
async function guard() {
  const ok = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!ok) throw new Error("Nepřihlášen");
}

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") return { error: "APP_PASSWORD není nastavené." };
  } else if (!safeEqual(password, expected)) {
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Špatné heslo." };
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ---------- CRM ---------- */

export async function setStatus(id: string, status: LeadStatus) {
  await guard();
  if (!LEAD_STATUSES.includes(status)) throw new Error("Neplatný stav");
  const r = repo();
  await r.updateLead(id, { status });
  await r.addActivity(id, "status", `Stav změněn na „${STATUS_LABELS[status]}“`);
  refresh();
}

export async function saveNotes(id: string, notes: string) {
  await guard();
  await repo().updateLead(id, { notes: notes.slice(0, 10_000) });
  refresh();
}

export async function setNextAction(id: string, date: string | null) {
  await guard();
  await repo().updateLead(id, { nextActionAt: date ? new Date(date).toISOString() : null });
  refresh();
}

export async function updateContact(id: string, data: { email?: string; phone?: string; website?: string }) {
  await guard();
  const clean = (v?: string) => (v === undefined ? undefined : v.trim() || null);
  await repo().updateLead(id, { email: clean(data.email), phone: clean(data.phone), website: clean(data.website) });
  refresh();
}

export async function logActivity(id: string, type: "note" | "email" | "call", content: string) {
  await guard();
  if (!content.trim()) return;
  await repo().addActivity(id, type, content.trim().slice(0, 2000));
  refresh();
}

export async function markEmailSent(id: string) {
  await guard();
  const r = repo();
  const lead = await r.getLead(id);
  if (!lead) return;
  if (lead.status === "new") await r.updateLead(id, { status: "contacted" });
  await r.addActivity(id, "email", `Odeslán e-mail: ${lead.outreach?.subject ?? "(bez předmětu)"}`);
  refresh();
}

export async function deleteLead(id: string) {
  await guard();
  await repo().deleteLead(id);
  redirect("/leads");
}

/* ---------- AI ---------- */

export async function generateAuditAction(id: string) {
  await guard();
  try {
    await createAudit(id);
    refresh();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function generateOutreachAction(id: string) {
  await guard();
  try {
    await createOutreach(id);
    refresh();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function saveOutreach(id: string, subject: string, email: string) {
  await guard();
  const r = repo();
  const lead = await r.getLead(id);
  if (!lead?.outreach) return;
  await r.updateLead(id, { outreach: { ...lead.outreach, subject, email } });
  refresh();
}

/* ---------- Manual lead ---------- */

export async function addManualLeadAction(_prev: { error?: string } | undefined, formData: FormData) {
  await guard();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Vyplň název firmy." };
  const str = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const lead = await addManualLead({
    name,
    website: str("website"),
    city: str("city"),
    phone: str("phone"),
    category: str("category"),
  });
  redirect(`/leads/${lead.id}?analyze=1`);
}
