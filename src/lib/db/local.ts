import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Activity, Lead, Search, DashboardStats } from "../types";
import { LEAD_STATUSES } from "../types";
import { applyFilter, type Repo } from "./repo";

/**
 * Development fallback store (.data/db.json). Used automatically when Supabase
 * env vars are missing. Not usable on Vercel (read-only filesystem).
 */
interface Store {
  leads: (Lead & { screenshot?: string | null })[];
  searches: Search[];
  activities: Activity[];
}

const FILE = path.join(process.cwd(), ".data", "db.json");
let cache: Store | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8")) as Store;
  } catch {
    cache = { leads: [], searches: [], activities: [] };
  }
  return cache;
}

async function save() {
  const data = JSON.stringify(cache);
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, data);
  });
  await writing;
}

const strip = (l: Lead & { screenshot?: string | null }): Lead => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { screenshot, ...rest } = l;
  return rest;
};

export const localRepo: Repo = {
  kind: "local",
  async listLeads(filter) {
    const s = await load();
    return applyFilter(s.leads.map(strip), filter);
  },
  async getLead(id) {
    const l = (await load()).leads.find((x) => x.id === id);
    return l ? strip(l) : null;
  },
  async getLeadBySlug(slug) {
    const l = (await load()).leads.find((x) => x.auditSlug === slug);
    return l ? strip(l) : null;
  },
  async getScreenshot(id) {
    return (await load()).leads.find((x) => x.id === id)?.screenshot ?? null;
  },
  async insertLeads(items) {
    const s = await load();
    const now = new Date().toISOString();
    let inserted = 0;
    const result: Lead[] = [];
    for (const item of items) {
      const existing = item.placeId ? s.leads.find((l) => l.placeId === item.placeId) : undefined;
      if (existing) {
        result.push(strip(existing));
        continue;
      }
      const lead: Lead = {
        ...item,
        id: randomUUID(),
        status: "new",
        email: null,
        notes: null,
        needScore: null,
        qualityScore: null,
        priority: null,
        analysis: null,
        analyzedAt: null,
        auditSlug: null,
        audit: null,
        outreach: null,
        auditViews: 0,
        auditLastViewedAt: null,
        nextActionAt: null,
        createdAt: now,
        updatedAt: now,
      };
      s.leads.push(lead);
      result.push(lead);
      inserted++;
    }
    await save();
    return { leads: result, inserted };
  },
  async updateLead(id, patch) {
    const s = await load();
    const i = s.leads.findIndex((l) => l.id === id);
    if (i < 0) throw new Error("Lead nenalezen");
    s.leads[i] = { ...s.leads[i], ...patch, updatedAt: new Date().toISOString() };
    await save();
    return strip(s.leads[i]);
  },
  async deleteLead(id) {
    const s = await load();
    s.leads = s.leads.filter((l) => l.id !== id);
    s.activities = s.activities.filter((a) => a.leadId !== id);
    await save();
  },
  async incrementAuditViews(id) {
    const s = await load();
    const l = s.leads.find((x) => x.id === id);
    if (!l) return;
    l.auditViews += 1;
    l.auditLastViewedAt = new Date().toISOString();
    await save();
  },
  async createSearch(input) {
    const s = await load();
    const search: Search = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    s.searches.unshift(search);
    await save();
    return search;
  },
  async updateSearch(id, patch) {
    const s = await load();
    const x = s.searches.find((q) => q.id === id);
    if (x) Object.assign(x, patch);
    await save();
  },
  async listSearches(limit = 20) {
    return (await load()).searches.slice(0, limit);
  },
  async addActivity(leadId, type, content) {
    const s = await load();
    const a: Activity = { id: randomUUID(), leadId, type, content, createdAt: new Date().toISOString() };
    s.activities.unshift(a);
    await save();
    return a;
  },
  async listActivities(leadId) {
    return (await load()).activities.filter((a) => a.leadId === leadId);
  },
  async stats() {
    const leads = (await load()).leads;
    const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as DashboardStats["byStatus"];
    for (const l of leads) byStatus[l.status]++;
    return {
      total: leads.length,
      analyzed: leads.filter((l) => l.analyzedAt).length,
      noWebsite: leads.filter((l) => !l.website).length,
      hot: leads.filter((l) => (l.priority ?? 0) >= 70).length,
      auditViews: leads.reduce((sum, l) => sum + l.auditViews, 0),
      byStatus,
    };
  },
};
