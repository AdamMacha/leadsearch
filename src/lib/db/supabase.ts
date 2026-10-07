import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { Activity, DashboardStats, Lead, LeadStatus, Search } from "../types";
import { LEAD_STATUSES } from "../types";
import type { LeadPatch, Repo } from "./repo";

let client: SupabaseClient | null = null;
function db() {
  if (!client) {
    client = createClient(config.supabaseUrl!, config.supabaseServiceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// Columns for list/detail views (screenshot excluded – it's large).
const LEAD_COLUMNS =
  "id,place_id,source,name,address,city,phone,email,website,google_maps_url,category,rating,reviews_count,business_status,search_id,status,notes,need_score,quality_score,priority,analysis,analyzed_at,audit_slug,audit,outreach,audit_views,audit_last_viewed_at,next_action_at,created_at,updated_at";

type Row = Record<string, unknown>;

function toLead(r: Row): Lead {
  return {
    id: r.id as string,
    placeId: (r.place_id as string) ?? null,
    source: r.source as string,
    name: r.name as string,
    address: (r.address as string) ?? null,
    city: (r.city as string) ?? null,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    website: (r.website as string) ?? null,
    googleMapsUrl: (r.google_maps_url as string) ?? null,
    category: (r.category as string) ?? null,
    rating: r.rating == null ? null : Number(r.rating),
    reviewsCount: (r.reviews_count as number) ?? null,
    businessStatus: (r.business_status as string) ?? null,
    searchId: (r.search_id as string) ?? null,
    status: (r.status as LeadStatus) ?? "new",
    notes: (r.notes as string) ?? null,
    needScore: (r.need_score as number) ?? null,
    qualityScore: (r.quality_score as number) ?? null,
    priority: (r.priority as number) ?? null,
    analysis: (r.analysis as Lead["analysis"]) ?? null,
    analyzedAt: (r.analyzed_at as string) ?? null,
    auditSlug: (r.audit_slug as string) ?? null,
    audit: (r.audit as Lead["audit"]) ?? null,
    outreach: (r.outreach as Lead["outreach"]) ?? null,
    auditViews: (r.audit_views as number) ?? 0,
    auditLastViewedAt: (r.audit_last_viewed_at as string) ?? null,
    nextActionAt: (r.next_action_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

const FIELD_MAP: Record<string, string> = {
  placeId: "place_id",
  googleMapsUrl: "google_maps_url",
  reviewsCount: "reviews_count",
  businessStatus: "business_status",
  searchId: "search_id",
  needScore: "need_score",
  qualityScore: "quality_score",
  analyzedAt: "analyzed_at",
  auditSlug: "audit_slug",
  nextActionAt: "next_action_at",
};

function toRow(patch: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    row[FIELD_MAP[k] ?? k] = v;
  }
  return row;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

export const supabaseRepo: Repo = {
  kind: "supabase",

  async listLeads(f = {}) {
    let q = db().from("leads").select(LEAD_COLUMNS);
    if (f.q) {
      const s = f.q.replace(/[%,()]/g, " ");
      q = q.or(`name.ilike.%${s}%,city.ilike.%${s}%,category.ilike.%${s}%,website.ilike.%${s}%`);
    }
    if (f.status && f.status !== "all") q = q.eq("status", f.status);
    if (f.website === "none") q = q.is("website", null);
    if (f.website === "has") q = q.not("website", "is", null);
    if (f.analyzed === "yes") q = q.not("analyzed_at", "is", null);
    if (f.analyzed === "no") q = q.is("analyzed_at", null);
    if (f.minPriority) q = q.gte("priority", f.minPriority);
    if (f.searchId) q = q.eq("search_id", f.searchId);
    const sort = f.sort ?? "priority";
    const col = { priority: "priority", need: "need_score", reviews: "reviews_count", created: "created_at", name: "name" }[sort];
    q = q.order(col, { ascending: sort === "name", nullsFirst: false });
    q = q.limit(f.limit ?? 1000);
    return (check(await q) as Row[]).map(toLead);
  },

  async getLead(id) {
    const data = check(await db().from("leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle());
    return data ? toLead(data as Row) : null;
  },

  async getLeadBySlug(slug) {
    const data = check(await db().from("leads").select(LEAD_COLUMNS).eq("audit_slug", slug).maybeSingle());
    return data ? toLead(data as Row) : null;
  },

  async getScreenshot(id) {
    const data = check(await db().from("leads").select("screenshot").eq("id", id).maybeSingle());
    return (data as Row | null)?.screenshot as string | null;
  },

  async insertLeads(items) {
    if (items.length === 0) return { leads: [], inserted: 0 };
    const placeIds = items.map((i) => i.placeId).filter(Boolean) as string[];
    const existing = placeIds.length
      ? (check(await db().from("leads").select("place_id").in("place_id", placeIds)) as Row[])
      : [];
    const existingIds = new Set(existing.map((r) => r.place_id as string));
    const fresh = items.filter((i) => !i.placeId || !existingIds.has(i.placeId));
    if (fresh.length) {
      check(await db().from("leads").insert(fresh.map((i) => toRow({ ...i }))));
    }
    const all = placeIds.length
      ? (check(await db().from("leads").select(LEAD_COLUMNS).in("place_id", placeIds)) as Row[])
      : [];
    return { leads: all.map(toLead), inserted: fresh.length };
  },

  async updateLead(id, patch: LeadPatch) {
    const row = toRow({ ...patch, updatedAt: undefined });
    row.updated_at = new Date().toISOString();
    const data = check(await db().from("leads").update(row).eq("id", id).select(LEAD_COLUMNS).single());
    return toLead(data as Row);
  },

  async deleteLead(id) {
    check(await db().from("leads").delete().eq("id", id));
  },

  async incrementAuditViews(id) {
    check(await db().rpc("increment_audit_views", { lead: id }));
  },

  async createSearch(s) {
    const data = check(
      await db()
        .from("searches")
        .insert({ query: s.query, location: s.location, results_count: s.resultsCount, new_count: s.newCount })
        .select()
        .single(),
    ) as Row;
    return toSearch(data);
  },

  async updateSearch(id, patch) {
    check(
      await db()
        .from("searches")
        .update(toRow({ results_count: patch.resultsCount, new_count: patch.newCount }))
        .eq("id", id),
    );
  },

  async listSearches(limit = 20) {
    const data = check(await db().from("searches").select().order("created_at", { ascending: false }).limit(limit));
    return (data as Row[]).map(toSearch);
  },

  async addActivity(leadId, type, content) {
    const data = check(
      await db().from("activities").insert({ lead_id: leadId, type, content }).select().single(),
    ) as Row;
    return toActivity(data);
  },

  async listActivities(leadId) {
    const data = check(
      await db().from("activities").select().eq("lead_id", leadId).order("created_at", { ascending: false }),
    );
    return (data as Row[]).map(toActivity);
  },

  async stats() {
    const data = check(
      await db().from("leads").select("status,website,analyzed_at,priority,audit_views").limit(100000),
    ) as Row[];
    const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as DashboardStats["byStatus"];
    let analyzed = 0, noWebsite = 0, hot = 0, auditViews = 0;
    for (const r of data) {
      byStatus[(r.status as LeadStatus) ?? "new"]++;
      if (r.analyzed_at) analyzed++;
      if (!r.website) noWebsite++;
      if (((r.priority as number) ?? 0) >= 70) hot++;
      auditViews += (r.audit_views as number) ?? 0;
    }
    return { total: data.length, analyzed, noWebsite, hot, auditViews, byStatus };
  },
};

function toSearch(r: Row): Search {
  return {
    id: r.id as string,
    query: r.query as string,
    location: r.location as string,
    resultsCount: r.results_count as number,
    newCount: r.new_count as number,
    createdAt: r.created_at as string,
  };
}

function toActivity(r: Row): Activity {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    type: r.type as Activity["type"],
    content: r.content as string,
    createdAt: r.created_at as string,
  };
}
