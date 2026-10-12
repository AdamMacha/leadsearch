import "server-only";
import fs from "fs/promises";
import path from "path";
import { config as appConfig } from "../config";
import { notifyTelegram } from "../notify";
import { evaluateDemandWithAi } from "./ai";
import { fetchActiveDemands } from "./scrapers";
import {
  DEFAULT_DEMAND_TRACKER_CONFIG,
  type Demand,
  type DemandAnalysis,
  type DemandStatus,
  type DemandTrackerConfig,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const CONFIG_FILE = path.join(DATA_DIR, "demand_tracker_settings.json");
const DEMANDS_FILE = path.join(DATA_DIR, "demands.json");

let memoryConfig: DemandTrackerConfig = DEFAULT_DEMAND_TRACKER_CONFIG;
let memoryDemands: Demand[] = [];

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

// ----------------------------------------------------
// 1. Settings management
// ----------------------------------------------------

export async function getDemandTrackerConfig(): Promise<DemandTrackerConfig> {
  // 1. Try Supabase
  if (appConfig.supabaseUrl && appConfig.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(appConfig.supabaseUrl, appConfig.supabaseServiceKey);
      const { data, error } = await client
        .from("demand_tracker_settings")
        .select("config")
        .eq("id", "default")
        .maybeSingle();

      if (!error && data?.config) {
        return { ...DEFAULT_DEMAND_TRACKER_CONFIG, ...data.config };
      }
    } catch {
      /* fallback to local */
    }
  }

  // 2. Try Local File
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    memoryConfig = { ...DEFAULT_DEMAND_TRACKER_CONFIG, ...parsed };
    return memoryConfig;
  } catch {
    return memoryConfig;
  }
}

export async function saveDemandTrackerConfig(
  patch: Partial<DemandTrackerConfig>
): Promise<DemandTrackerConfig> {
  const current = await getDemandTrackerConfig();
  const updated: DemandTrackerConfig = {
    ...current,
    ...patch,
  };

  memoryConfig = updated;

  // 1. Save to Supabase
  if (appConfig.supabaseUrl && appConfig.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(appConfig.supabaseUrl, appConfig.supabaseServiceKey);
      await client.from("demand_tracker_settings").upsert({
        id: "default",
        config: updated,
        updated_at: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  }

  // 2. Save to Local File
  try {
    await ensureDataDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch {
    /* ignore */
  }

  return updated;
}

// ----------------------------------------------------
// 2. Demands storage & retrieval
// ----------------------------------------------------

export async function listDemands(filter?: {
  status?: DemandStatus;
  source?: string;
  minScore?: number;
  limit?: number;
}): Promise<Demand[]> {
  let all: Demand[] = [];

  // 1. Try Supabase
  if (appConfig.supabaseUrl && appConfig.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(appConfig.supabaseUrl, appConfig.supabaseServiceKey);
      const query = client
        .from("demands")
        .select("*")
        .order("published_at", { ascending: false });

      if (filter?.status) query.eq("status", filter.status);
      if (filter?.source) query.eq("source", filter.source);
      if (typeof filter?.minScore === "number") query.gte("match_score", filter.minScore);
      if (filter?.limit) query.limit(filter.limit);

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        all = data.map((d) => ({
          id: d.id,
          source: d.source,
          externalId: d.external_id,
          title: d.title,
          description: d.description,
          url: d.url,
          category: d.category,
          budget: d.budget,
          publishedAt: d.published_at,
          matchScore: d.match_score,
          fitLevel: d.fit_level,
          matchReason: d.match_reason,
          keyRequirements: Array.isArray(d.key_requirements) ? d.key_requirements : [],
          suggestedPitch: d.suggested_pitch,
          status: d.status,
          notifiedAt: d.notified_at,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
        return all;
      }
    } catch {
      /* fallback to local */
    }
  }

  // 2. Try Local File
  try {
    const raw = await fs.readFile(DEMANDS_FILE, "utf-8");
    memoryDemands = JSON.parse(raw);
  } catch {
    /* use memory */
  }

  let filtered = [...memoryDemands];
  if (filter?.status) filtered = filtered.filter((d) => d.status === filter.status);
  if (filter?.source) filtered = filtered.filter((d) => d.source === filter.source);
  if (typeof filter?.minScore === "number") filtered = filtered.filter((d) => d.matchScore >= filter.minScore!);

  filtered.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (filter?.limit) filtered = filtered.slice(0, filter.limit);
  return filtered;
}

export async function saveDemand(demand: Demand): Promise<Demand> {
  // Update memory
  const idx = memoryDemands.findIndex((d) => d.id === demand.id);
  if (idx >= 0) memoryDemands[idx] = demand;
  else memoryDemands.unshift(demand);

  // 1. Save to Supabase
  if (appConfig.supabaseUrl && appConfig.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(appConfig.supabaseUrl, appConfig.supabaseServiceKey);
      await client.from("demands").upsert({
        id: demand.id,
        source: demand.source,
        external_id: demand.externalId,
        title: demand.title,
        description: demand.description,
        url: demand.url,
        category: demand.category,
        budget: demand.budget,
        published_at: demand.publishedAt,
        match_score: demand.matchScore,
        fit_level: demand.fitLevel,
        match_reason: demand.matchReason,
        key_requirements: demand.keyRequirements,
        suggested_pitch: demand.suggestedPitch,
        status: demand.status,
        notified_at: demand.notifiedAt,
        created_at: demand.createdAt,
        updated_at: demand.updatedAt,
      });
    } catch {
      /* ignore */
    }
  }

  // 2. Save to Local File
  try {
    await ensureDataDir();
    await fs.writeFile(DEMANDS_FILE, JSON.stringify(memoryDemands, null, 2), "utf-8");
  } catch {
    /* ignore */
  }

  return demand;
}

export async function updateDemandStatus(
  id: string,
  status: DemandStatus
): Promise<Demand | null> {
  const demands = await listDemands();
  const demand = demands.find((d) => d.id === id);
  if (!demand) return null;

  demand.status = status;
  demand.updatedAt = new Date().toISOString();
  await saveDemand(demand);
  return demand;
}

// ----------------------------------------------------
// 3. Scan & Pipeline Execution
// ----------------------------------------------------

export async function scanAndProcessDemands(): Promise<{
  scannedCount: number;
  newCount: number;
  highMatchCount: number;
  demands: Demand[];
}> {
  const cfg = await getDemandTrackerConfig();
  const existingDemands = await listDemands();
  const existingKeys = new Set(
    existingDemands.map((d) => d.externalId || d.url || d.title)
  );

  const rawScraped = await fetchActiveDemands(cfg);
  const now = new Date().toISOString();

  // Filter only unseen demands
  const newItems = rawScraped.filter((item) => {
    const key = item.externalId || item.url || item.title;
    return !existingKeys.has(key);
  });

  const createdDemands: Demand[] = [];
  let highMatchCount = 0;

  for (const item of newItems) {
    try {
      const analysis: DemandAnalysis = await evaluateDemandWithAi(
        item.title,
        item.description,
        cfg
      );

      const demand: Demand = {
        id: `demand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: item.source,
        externalId: item.externalId,
        title: item.title,
        description: item.description,
        url: item.url,
        category: item.category || "Web / IT",
        budget: analysis.estimatedBudget || item.budget || null,
        publishedAt: item.publishedAt || now,
        matchScore: analysis.matchScore,
        fitLevel: analysis.fitLevel,
        matchReason: analysis.matchReason,
        keyRequirements: analysis.keyRequirements,
        suggestedPitch: analysis.suggestedPitch,
        status: "new",
        notifiedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      // Check if eligible for Telegram alert
      if (
        cfg.notifyTelegram &&
        demand.matchScore >= cfg.minMatchScore &&
        !demand.notifiedAt
      ) {
        const sourceLabel =
          demand.source === "webtrh"
            ? "Webtrh.cz"
            : demand.source === "startupjobs"
            ? "StartupJobs.cz"
            : demand.source;

        const pitchPreview = demand.suggestedPitch.slice(0, 300);

        const tgMessage = `🚨 <b>NOVÁ POPTÁVKA (Shoda: ${demand.matchScore} %)</b>

📌 <b>${escapeHtml(demand.title)}</b>
🌐 <b>Zdroj:</b> ${sourceLabel}
${demand.budget ? `💰 <b>Rozpočet:</b> ${escapeHtml(demand.budget)}\n` : ""}💡 <b>Proč sedí:</b> ${escapeHtml(demand.matchReason)}

📝 <b>Návrh odpovědi:</b>
<i>${escapeHtml(pitchPreview)}${demand.suggestedPitch.length > 300 ? "..." : ""}</i>

${demand.url ? `🔗 <a href="${demand.url}">Otevřít zadání poptávky ↗</a>` : ""}`;

        await notifyTelegram(tgMessage);
        demand.notifiedAt = new Date().toISOString();
        highMatchCount++;
      }

      await saveDemand(demand);
      createdDemands.push(demand);
      existingKeys.add(demand.externalId || demand.url || demand.title);
    } catch (err) {
      console.error(`Failed to process demand "${item.title}":`, err);
    }
  }

  // Update last scan timestamp
  await saveDemandTrackerConfig({ lastScanAt: now });

  return {
    scannedCount: rawScraped.length,
    newCount: createdDemands.length,
    highMatchCount,
    demands: createdDemands,
  };
}

// ----------------------------------------------------
// 4. Quick Analyzer for arbitrary pasted text (FB, LinkedIn, Email)
// ----------------------------------------------------

export async function analyzeManualDemandText(
  text: string,
  customTitle?: string
): Promise<Demand> {
  const cfg = await getDemandTrackerConfig();
  const title =
    customTitle?.trim() ||
    text.split("\n")[0].trim().slice(0, 100) ||
    "Poptávka z Facebooku / zprávy";

  const analysis = await evaluateDemandWithAi(title, text, cfg);
  const now = new Date().toISOString();

  const demand: Demand = {
    id: `demand-man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source: "manual",
    title,
    description: text,
    url: null,
    category: "Vlastní zadání",
    budget: analysis.estimatedBudget || null,
    publishedAt: now,
    matchScore: analysis.matchScore,
    fitLevel: analysis.fitLevel,
    matchReason: analysis.matchReason,
    keyRequirements: analysis.keyRequirements,
    suggestedPitch: analysis.suggestedPitch,
    status: "saved",
    notifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await saveDemand(demand);
  return demand;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
