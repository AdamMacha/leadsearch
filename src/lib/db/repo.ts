import type {
  Activity,
  ActivityType,
  DashboardStats,
  Lead,
  LeadFilter,
  NewLead,
  Search,
} from "../types";

export type LeadPatch = Partial<
  Omit<Lead, "id" | "createdAt" | "updatedAt" | "auditViews" | "auditLastViewedAt">
> & { screenshot?: string | null };

export interface Repo {
  readonly kind: "supabase" | "local";
  listLeads(filter?: LeadFilter): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  getLeadBySlug(slug: string): Promise<Lead | null>;
  getScreenshot(id: string): Promise<string | null>;
  /** Inserts leads, skipping ones whose placeId already exists. Returns [all matching leads, newly inserted count]. */
  insertLeads(leads: NewLead[]): Promise<{ leads: Lead[]; inserted: number }>;
  updateLead(id: string, patch: LeadPatch): Promise<Lead>;
  deleteLead(id: string): Promise<void>;
  incrementAuditViews(id: string): Promise<void>;

  createSearch(s: Omit<Search, "id" | "createdAt">): Promise<Search>;
  updateSearch(id: string, patch: Partial<Pick<Search, "resultsCount" | "newCount">>): Promise<void>;
  listSearches(limit?: number): Promise<Search[]>;

  addActivity(leadId: string, type: ActivityType, content: string): Promise<Activity>;
  listActivities(leadId: string): Promise<Activity[]>;

  stats(): Promise<DashboardStats>;
}

/** Shared in-memory filtering/sorting used by the local repo (and as reference for Supabase). */
export function applyFilter(leads: Lead[], f: LeadFilter = {}): Lead[] {
  let out = leads;
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter((l) =>
      [l.name, l.city, l.address, l.category, l.website, l.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }
  if (f.status && f.status !== "all") out = out.filter((l) => l.status === f.status);
  if (f.website === "none") out = out.filter((l) => !l.website);
  if (f.website === "has") out = out.filter((l) => !!l.website);
  if (f.analyzed === "yes") out = out.filter((l) => !!l.analyzedAt);
  if (f.analyzed === "no") out = out.filter((l) => !l.analyzedAt);
  if (f.minPriority) out = out.filter((l) => (l.priority ?? 0) >= f.minPriority!);
  if (f.searchId) out = out.filter((l) => l.searchId === f.searchId);

  const sort = f.sort ?? "priority";
  const by = {
    priority: (l: Lead) => l.priority ?? -1,
    need: (l: Lead) => l.needScore ?? -1,
    reviews: (l: Lead) => l.reviewsCount ?? -1,
    created: (l: Lead) => new Date(l.createdAt).getTime(),
    name: () => 0,
  }[sort];
  out = [...out].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name, "cs") : by(b) - by(a),
  );
  return f.limit ? out.slice(0, f.limit) : out;
}
