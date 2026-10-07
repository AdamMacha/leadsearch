export const LEAD_STATUSES = [
  "new",
  "contacted",
  "replied",
  "meeting",
  "proposal",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nový",
  contacted: "Osloven",
  replied: "Reagoval",
  meeting: "Schůzka",
  proposal: "Nabídka",
  won: "Vyhráno",
  lost: "Prohráno",
};

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export interface Issue {
  id: string;
  severity: IssueSeverity;
  weight: number;
  /** Short title shown to the prospect (Czech). */
  title: string;
  /** Plain-language explanation of the business impact (Czech). */
  description: string;
}

export interface PageSpeedResult {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  error?: string;
}

export interface WebsiteAnalysis {
  analyzedAt: string;
  hasWebsite: boolean;
  url: string | null;
  finalUrl: string | null;
  reachable: boolean;
  httpStatus: number | null;
  https: boolean;
  responseTimeMs: number | null;
  title: string | null;
  metaDescription: string | null;
  hasViewport: boolean;
  hasOpenGraph: boolean;
  hasStructuredData: boolean;
  hasAnalytics: boolean;
  hasFavicon: boolean;
  lang: string | null;
  h1Count: number;
  imagesWithoutAlt: number;
  copyrightYear: number | null;
  technologies: string[];
  emails: string[];
  socials: string[];
  pageSpeed: PageSpeedResult | null;
  issues: Issue[];
  error?: string;
}

export interface AuditContent {
  headline: string;
  summary: string;
  recommendations: { title: string; description: string }[];
  benefits: string[];
  generatedAt: string;
  model: string;
}

export interface OutreachContent {
  subject: string;
  email: string;
  callScript: string;
  linkedin: string;
  generatedAt: string;
  model: string;
}

export interface Lead {
  id: string;
  placeId: string | null;
  source: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  businessStatus: string | null;
  searchId: string | null;
  status: LeadStatus;
  notes: string | null;
  needScore: number | null;
  qualityScore: number | null;
  priority: number | null;
  analysis: WebsiteAnalysis | null;
  analyzedAt: string | null;
  auditSlug: string | null;
  audit: AuditContent | null;
  outreach: OutreachContent | null;
  auditViews: number;
  auditLastViewedAt: string | null;
  nextActionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewLead = Pick<
  Lead,
  | "placeId"
  | "source"
  | "name"
  | "address"
  | "city"
  | "phone"
  | "website"
  | "googleMapsUrl"
  | "category"
  | "rating"
  | "reviewsCount"
  | "businessStatus"
  | "searchId"
>;

export interface Search {
  id: string;
  query: string;
  location: string;
  resultsCount: number;
  newCount: number;
  createdAt: string;
}

export type ActivityType = "note" | "status" | "email" | "call" | "ai" | "audit_view" | "system";

export interface Activity {
  id: string;
  leadId: string;
  type: ActivityType;
  content: string;
  createdAt: string;
}

export interface LeadFilter {
  q?: string;
  status?: LeadStatus | "all";
  website?: "all" | "none" | "has";
  analyzed?: "all" | "yes" | "no";
  minPriority?: number;
  searchId?: string;
  sort?: "priority" | "need" | "reviews" | "created" | "name";
  limit?: number;
}

export interface DashboardStats {
  total: number;
  analyzed: number;
  noWebsite: number;
  hot: number;
  auditViews: number;
  byStatus: Record<LeadStatus, number>;
}
