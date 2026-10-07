import "server-only";
import { analyzeLead } from "./analyzer";
import { generateAudit, generateOutreach } from "./ai/gemini";
import { config } from "./config";
import { repo } from "./db";
import { searchPlaces } from "./sources/places";
import type { Lead, NewLead } from "./types";
import { auditSlugFor } from "./utils";

export async function runSearch(query: string, location: string, pages: number) {
  const r = repo();
  const found = await searchPlaces(query, location, pages);
  const search = await r.createSearch({ query, location, resultsCount: found.length, newCount: 0 });
  const { leads, inserted } = await r.insertLeads(found.map((f) => ({ ...f, searchId: search.id })));
  await r.updateSearch(search.id, { newCount: inserted });
  return { search: { ...search, newCount: inserted }, leads, inserted };
}

export async function addManualLead(input: Pick<NewLead, "name" | "website" | "city" | "phone" | "category">) {
  const { leads } = await repo().insertLeads([
    {
      ...input,
      placeId: null,
      source: "manual",
      address: null,
      googleMapsUrl: null,
      rating: null,
      reviewsCount: null,
      businessStatus: null,
      searchId: null,
    },
  ]);
  return leads[0];
}

export async function analyzeAndSave(id: string): Promise<Lead> {
  const r = repo();
  const lead = await r.getLead(id);
  if (!lead) throw new Error("Lead nenalezen");
  const res = await analyzeLead(lead, { pageSpeed: true, pageSpeedKey: config.pageSpeedKey });
  const updated = await r.updateLead(id, {
    analysis: res.analysis,
    analyzedAt: res.analysis.analyzedAt,
    needScore: res.needScore,
    qualityScore: res.qualityScore,
    priority: res.priority,
    email: res.email,
    ...(res.screenshot ? { screenshot: res.screenshot } : {}),
  });
  await r.addActivity(id, "system", `Analýza webu: potřeba ${res.needScore}/100, priorita ${res.priority}/100`);
  return updated;
}

export async function ensureAuditSlug(lead: Lead): Promise<Lead> {
  if (lead.auditSlug) return lead;
  return repo().updateLead(lead.id, { auditSlug: auditSlugFor(lead.name) });
}

export async function createAudit(id: string): Promise<Lead> {
  const r = repo();
  let lead = await r.getLead(id);
  if (!lead) throw new Error("Lead nenalezen");
  if (!lead.analyzedAt) lead = await analyzeAndSave(id);
  lead = await ensureAuditSlug(lead);
  const audit = await generateAudit(lead);
  lead = await r.updateLead(id, { audit });
  await r.addActivity(id, "ai", `Vygenerován audit (${audit.model})`);
  return lead;
}

export async function createOutreach(id: string): Promise<Lead> {
  const r = repo();
  let lead = await r.getLead(id);
  if (!lead) throw new Error("Lead nenalezen");
  lead = await ensureAuditSlug(lead);
  const outreach = await generateOutreach(lead);
  lead = await r.updateLead(id, { outreach });
  await r.addActivity(id, "ai", `Vygenerován návrh oslovení (${outreach.model})`);
  return lead;
}
