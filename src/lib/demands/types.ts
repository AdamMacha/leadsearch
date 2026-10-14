export type DemandSource =
  | "webtrh"
  | "startupjobs"
  | "poptavej"
  | "freelancer"
  | "weworkremotely"
  | "manual";

export type DemandFitLevel = "high" | "medium" | "low";

export type DemandStatus = "new" | "saved" | "contacted" | "dismissed";

export interface Demand {
  id: string;
  source: DemandSource;
  externalId?: string;
  title: string;
  description: string;
  url?: string | null;
  category?: string | null;
  budget?: string | null;
  publishedAt: string;
  matchScore: number; // 0 to 100
  fitLevel: DemandFitLevel;
  matchReason: string;
  keyRequirements: string[];
  suggestedPitch: string;
  status: DemandStatus;
  notifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemandAnalysis {
  matchScore: number;
  fitLevel: DemandFitLevel;
  matchReason: string;
  keyRequirements: string[];
  estimatedBudget?: string | null;
  suggestedPitch: string;
}

export interface DemandTrackerConfig {
  enabled: boolean;
  minMatchScore: number; // e.g. 70
  notifyTelegram: boolean;
  notifyEmail: boolean;
  sources: {
    webtrh: boolean;
    startupjobs: boolean;
    poptavej: boolean;
    freelancer: boolean;
    weworkremotely: boolean;
  };
  skillsSummary: string;
  senderProfile: {
    name: string;
    company: string;
    web: string;
    strengths: string;
  };
  lastScanAt?: string;
}

export const DEFAULT_DEMAND_TRACKER_CONFIG: DemandTrackerConfig = {
  enabled: true,
  minMatchScore: 70,
  notifyTelegram: true,
  notifyEmail: false,
  sources: {
    webtrh: true,
    startupjobs: true,
    poptavej: true,
    freelancer: true,
    weworkremotely: true,
  },
  skillsSummary:
    "Tvorba a redesign moderních webových stránek (Next.js, vysoká rychlost a konverze, moderní UI/UX), Webové aplikace a systémy na míru, E-shopy (Shoptet, WooCommerce, zakázkové řešení), SEO optimalizace, grafika a správa webů.",
  senderProfile: {
    name: "Bc. Adam Mácha",
    company: "Technologio",
    web: "https://www.technologio.eu",
    strengths:
      "Moderní Next.js technologie, blesková rychlost načítání, čistý kód, design na míru zaměřený na získávání klientů, spolehlivost a dodržování termínů.",
  },
};
