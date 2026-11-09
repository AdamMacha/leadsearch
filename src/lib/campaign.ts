import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeEmail } from "./analyzer/html";
import { processLeadAutopilot } from "./autopilot";
import { config } from "./config";
import { repo } from "./db";
import { notifyTelegram } from "./notify";
import { analyzeAndSave, runSearch } from "./services";
import type { Lead } from "./types";

export interface CampaignConfig {
  enabled: boolean;
  mode: "full" | "prepare";
  dailyLimit: number;
  minNeedScore: number;
  skipNoEmail: boolean;
  workingDaysOnly: boolean;
  workHoursOnly: boolean;
  delaySeconds: number;
  fastMode: boolean;
  niches: string[];
  locations: string[];
  currentNicheIndex: number;
  currentLocationIndex: number;
  lastRunAt: string | null;
  updatedAt: string;
}

export interface CampaignRunItem {
  leadId: string;
  leadName: string;
  email: string | null;
  status: "sent" | "prepared" | "skipped" | "error";
  reason?: string;
  auditLink?: string | null;
}

export interface CampaignRunLog {
  id: string;
  startedAt: string;
  finishedAt: string;
  trigger: "cron" | "manual";
  mode: "full" | "prepare";
  searchedQuery?: string;
  searchedLocation?: string;
  newLeadsFound: number;
  processedCount: number;
  sentCount: number;
  preparedCount: number;
  skippedCount: number;
  errorCount: number;
  items: CampaignRunItem[];
}

export const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = {
  enabled: true,
  mode: "full",
  dailyLimit: 15,
  minNeedScore: 0,
  skipNoEmail: true,
  workingDaysOnly: false,
  workHoursOnly: false,
  delaySeconds: 4,
  fastMode: true,
  niches: [
    "rekonstrukce bytů",
    "stavební firma",
    "truhlářství na míru",
    "zubní klinika",
    "autodetailing",
    "tepelná čerpadla",
    "pergoly a přístřešky",
    "kovovýroba",
    "estetická medicína",
    "architektonické studio",
  ],
  locations: [
    "Praha",
    "Brno",
    "Ostrava",
    "Plzeň",
    "Olomouc",
    "Liberec",
    "České Budějovice",
    "Hradec Králové",
    "Zlín",
    "Pardubice",
  ],
  currentNicheIndex: 0,
  currentLocationIndex: 0,
  lastRunAt: null,
  updatedAt: new Date().toISOString(),
};

const DATA_DIR = path.join(process.cwd(), ".data");
const CONFIG_FILE = path.join(DATA_DIR, "campaign_config.json");
const RUNS_FILE = path.join(DATA_DIR, "campaign_runs.json");

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

// In-memory fallback if file system is read-only (e.g. Vercel serverless without Supabase)
let memoryConfig: CampaignConfig = { ...DEFAULT_CAMPAIGN_CONFIG };
let memoryRuns: CampaignRunLog[] = [];

export async function getCampaignConfig(): Promise<CampaignConfig> {
  // 1. Try Supabase if configured
  if (config.supabaseUrl && config.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(config.supabaseUrl, config.supabaseServiceKey);
      const { data, error } = await client
        .from("campaign_settings")
        .select("config")
        .eq("id", "default")
        .maybeSingle();

      if (!error && data?.config) {
        return { ...DEFAULT_CAMPAIGN_CONFIG, ...data.config };
      }

      // Fallback: If dedicated table is missing (PGRST205), read from existing 'searches' table
      if (error && error.code === "PGRST205") {
        const { data: sysRow } = await client
          .from("searches")
          .select("location")
          .eq("query", "__SYSTEM_CAMPAIGN_CONFIG__")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sysRow?.location) {
          try {
            const parsed = JSON.parse(sysRow.location);
            return { ...DEFAULT_CAMPAIGN_CONFIG, ...parsed };
          } catch {
            /* ignore parse error */
          }
        }
      }
    } catch {
      /* fallback to local */
    }
  }

  // 2. Try Local File
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    memoryConfig = { ...DEFAULT_CAMPAIGN_CONFIG, ...parsed };
    return memoryConfig;
  } catch {
    return memoryConfig;
  }
}

export async function saveCampaignConfig(
  patch: Partial<CampaignConfig>
): Promise<CampaignConfig> {
  const current = await getCampaignConfig();
  const updated: CampaignConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  memoryConfig = updated;

  // 1. Save to Supabase if configured
  if (config.supabaseUrl && config.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(config.supabaseUrl, config.supabaseServiceKey);
      const { error } = await client.from("campaign_settings").upsert({
        id: "default",
        config: updated,
        updated_at: updated.updatedAt,
      });

      // Fallback: If dedicated table is missing (PGRST205), persist in existing 'searches' table
      if (error && error.code === "PGRST205") {
        await client.from("searches").insert({
          query: "__SYSTEM_CAMPAIGN_CONFIG__",
          location: JSON.stringify(updated),
          results_count: 0,
          new_count: 0,
        });

        // Prune old config rows, keep latest 3
        const { data: oldConfigs } = await client
          .from("searches")
          .select("id")
          .eq("query", "__SYSTEM_CAMPAIGN_CONFIG__")
          .order("created_at", { ascending: false });

        if (oldConfigs && oldConfigs.length > 3) {
          const toDelete = oldConfigs.slice(3).map((r) => r.id);
          await client.from("searches").delete().in("id", toDelete);
        }
      }
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

export async function getCampaignRuns(limit = 15): Promise<CampaignRunLog[]> {
  // 1. Try Supabase
  if (config.supabaseUrl && config.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(config.supabaseUrl, config.supabaseServiceKey);
      const { data, error } = await client
        .from("campaign_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (!error && data) {
        return data.map((d) => ({
          id: d.id,
          startedAt: d.started_at,
          finishedAt: d.finished_at,
          trigger: d.trigger,
          mode: d.mode,
          searchedQuery: d.searched_query,
          searchedLocation: d.searched_location,
          newLeadsFound: d.new_leads_found ?? 0,
          processedCount: d.processed_count ?? 0,
          sentCount: d.sent_count ?? 0,
          preparedCount: d.prepared_count ?? 0,
          skippedCount: d.skipped_count ?? 0,
          errorCount: d.error_count ?? 0,
          items: Array.isArray(d.items) ? d.items : [],
        }));
      }

      // Fallback: If dedicated table is missing (PGRST205), read from 'searches' table
      if (error && error.code === "PGRST205") {
        const { data: sysRuns } = await client
          .from("searches")
          .select("id, location, created_at")
          .eq("query", "__SYSTEM_CAMPAIGN_RUN__")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (sysRuns && sysRuns.length > 0) {
          const parsedRuns: CampaignRunLog[] = [];
          for (const row of sysRuns) {
            try {
              if (row.location) {
                parsedRuns.push(JSON.parse(row.location));
              }
            } catch {
              /* ignore parse error */
            }
          }
          if (parsedRuns.length > 0) return parsedRuns;
        }
      }
    } catch {
      /* fallback */
    }
  }

  // 2. Local File
  try {
    const raw = await fs.readFile(RUNS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryRuns = parsed;
      return parsed.slice(0, limit);
    }
  } catch {
    /* fallback to memory */
  }

  return memoryRuns.slice(0, limit);
}

export async function recordCampaignRun(run: CampaignRunLog): Promise<void> {
  memoryRuns = [run, ...memoryRuns].slice(0, 50);

  // 1. Save to Supabase
  if (config.supabaseUrl && config.supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(config.supabaseUrl, config.supabaseServiceKey);
      const { error } = await client.from("campaign_runs").insert({
        id: run.id,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        trigger: run.trigger,
        mode: run.mode,
        searched_query: run.searchedQuery ?? null,
        searched_location: run.searchedLocation ?? null,
        new_leads_found: run.newLeadsFound,
        processed_count: run.processedCount,
        sent_count: run.sentCount,
        prepared_count: run.preparedCount,
        skipped_count: run.skippedCount,
        error_count: run.errorCount,
        items: run.items,
      });

      // Fallback: If dedicated table is missing (PGRST205), store in 'searches' table
      if (error && error.code === "PGRST205") {
        await client.from("searches").insert({
          query: "__SYSTEM_CAMPAIGN_RUN__",
          location: JSON.stringify(run),
          results_count: run.sentCount,
          new_count: run.newLeadsFound,
        });

        // Prune old runs, keep latest 50
        const { data: oldRuns } = await client
          .from("searches")
          .select("id")
          .eq("query", "__SYSTEM_CAMPAIGN_RUN__")
          .order("created_at", { ascending: false });

        if (oldRuns && oldRuns.length > 50) {
          const toDelete = oldRuns.slice(50).map((r) => r.id);
          await client.from("searches").delete().in("id", toDelete);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Save to Local File
  try {
    await ensureDataDir();
    await fs.writeFile(RUNS_FILE, JSON.stringify(memoryRuns, null, 2), "utf-8");
  } catch {
    /* ignore */
  }
}

export async function getSentTodayCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const r = repo();
  const leads = await r.listLeads({});
  return leads.filter((l) => {
    if (l.status !== "contacted" && l.status !== "replied") return false;
    const updatedAt = new Date(l.updatedAt || l.createdAt);
    return updatedAt >= startOfDay;
  }).length;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function checkWorkingHours(): {
  isWorkingDay: boolean;
  isWorkingHour: boolean;
  reason?: string;
} {
  const now = new Date();
  const pragueStr = now.toLocaleString("en-US", { timeZone: "Europe/Prague" });
  const pragueDate = new Date(pragueStr);
  const hour = pragueDate.getHours() + pragueDate.getMinutes() / 60;

  // Odesílání povoleno každý den včetně soboty a neděle (Po–Ne)
  const isWorkingDay = true;
  const isWorkingHour = hour >= 7.0 && hour < 20.0; // 7:00 to 20:00 CET

  let reason: string | undefined;
  if (!isWorkingHour) {
    reason = `Mimo povolenou dobu (aktuální čas v ČR: ${pragueDate.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}, kampaň odesílá v čase 7:00–20:00).`;
  }

  return { isWorkingDay, isWorkingHour, reason };
}

export interface RunCampaignOptions {
  force?: boolean;
  trigger?: "cron" | "manual";
  limitOverride?: number;
}

export function isLeadEligibleForCampaign(
  l: Lead,
  configObj: CampaignConfig,
  minNeedScoreOverride?: number
): boolean {
  // Only process leads with 'new' status
  if (l.status !== "new") return false;

  const effectiveMinScore =
    typeof minNeedScoreOverride === "number" ? minNeedScoreOverride : configObj.minNeedScore;

  // If already analyzed:
  if (l.analyzedAt) {
    const cleanEmail = l.email ? sanitizeEmail(l.email) : null;
    // If skipNoEmail is enabled, must have a valid email
    if (configObj.skipNoEmail && !cleanEmail) return false;
    // Must meet or exceed minimum needScore threshold
    if ((l.needScore ?? 0) < effectiveMinScore) return false;
    return true;
  }

  // If not yet analyzed:
  // If skipNoEmail is on, but lead has neither website nor email, an email can never be scraped
  if (configObj.skipNoEmail && !l.website && !l.email) return false;

  return true;
}

function candidateRankScore(l: Lead): number {
  const need = l.needScore ?? 0;
  const hasValidEmail = Boolean(l.email && sanitizeEmail(l.email));
  if (l.analyzedAt && hasValidEmail && l.audit && l.outreach) {
    return 2000 + need;
  }
  if (l.analyzedAt && hasValidEmail) {
    return 1000 + need;
  }
  if (!l.analyzedAt && hasValidEmail) {
    return 500 + need;
  }
  return need;
}

export function sortCampaignCandidates(a: Lead, b: Lead): number {
  return candidateRankScore(b) - candidateRankScore(a);
}

export async function runAutonomousCampaign(
  opts: RunCampaignOptions = {}
): Promise<{
  ok: boolean;
  status: "completed" | "skipped" | "quota_reached";
  reason?: string;
  run?: CampaignRunLog;
  sentToday: number;
  dailyLimit: number;
}> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  // Safe execution limit before Vercel 300s timeout (leave 45s for saving state & Telegram notification)
  const MAX_EXECUTION_MS = 255_000;

  const configObj = await getCampaignConfig();
  const trigger = opts.trigger ?? "cron";
  const force = Boolean(opts.force);

  // 1. Is campaign enabled?
  if (!configObj.enabled && !force) {
    return {
      ok: true,
      status: "skipped",
      reason: "Kampaň je v nastavení pozastavena.",
      sentToday: await getSentTodayCount(),
      dailyLimit: configObj.dailyLimit,
    };
  }

  // 2. Daily quota check
  const sentToday = await getSentTodayCount();
  if (!force && sentToday >= configObj.dailyLimit) {
    return {
      ok: true,
      status: "quota_reached",
      reason: `Dnešní limit byl již naplněn (${sentToday}/${configObj.dailyLimit} odesláno).`,
      sentToday,
      dailyLimit: configObj.dailyLimit,
    };
  }

  // Target quota of successfully sent (or prepared) emails for this run:
  const targetQuota = force
    ? (opts.limitOverride ?? Math.max(1, configObj.dailyLimit - sentToday))
    : Math.max(1, configObj.dailyLimit - sentToday);

  const r = repo();
  let currentNicheIdx = configObj.currentNicheIndex;
  let currentLocIdx = configObj.currentLocationIndex;
  let newLeadsFound = 0;
  const searchedQueries: { niche: string; city: string; inserted: number }[] = [];
  let searchAttempts = 0;
  const MAX_SEARCH_ATTEMPTS = 15;

  async function performSearchRotation(): Promise<number> {
    if (configObj.niches.length === 0 || configObj.locations.length === 0) return 0;
    if (searchAttempts >= MAX_SEARCH_ATTEMPTS) return 0;

    searchAttempts++;
    const niche = configObj.niches[currentNicheIdx % configObj.niches.length];
    const city = configObj.locations[currentLocIdx % configObj.locations.length];

    currentNicheIdx = (currentNicheIdx + 1) % configObj.niches.length;
    currentLocIdx = (currentLocIdx + 1) % configObj.locations.length;

    try {
      // Use pages = 2 for higher yield of fresh leads
      const searchRes = await runSearch(niche, city, 2);
      newLeadsFound += searchRes.inserted;
      searchedQueries.push({ niche, city, inserted: searchRes.inserted });
      return searchRes.inserted;
    } catch (err) {
      console.error(`Auto search failed for ${niche} ${city}:`, err);
      return 0;
    }
  }

  // Fast parallel pre-analysis of unanalyzed leads (5 at a time without slow PageSpeed)
  async function preAnalyzeBatch(leadsToAnalyze: Lead[]): Promise<void> {
    const batch = leadsToAnalyze.slice(0, 5);
    if (batch.length === 0) return;
    await Promise.allSettled(
      batch.map((l) =>
        analyzeAndSave(l.id, {
          pageSpeed: false,
          skipNoEmail: configObj.skipNoEmail,
        })
      )
    );
  }

  async function fetchPool(minScoreOverride: number, excludeIds: Set<string>): Promise<{
    readyWithEmail: Lead[];
    unanalyzed: Lead[];
  }> {
    const all = await r.listLeads({});
    const filtered = all
      .filter((l) => !excludeIds.has(l.id) && isLeadEligibleForCampaign(l, configObj, minScoreOverride))
      .sort(sortCampaignCandidates);
    const readyWithEmail = filtered.filter((l) => Boolean(l.analyzedAt && l.email && sanitizeEmail(l.email)));
    const unanalyzed = filtered.filter((l) => !l.analyzedAt);
    return { readyWithEmail, unanalyzed };
  }

  const runItems: CampaignRunItem[] = [];
  let sentCount = 0;
  let preparedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const processedLeadIds = new Set<string>();

  const getSuccessCount = () => (configObj.mode === "full" ? sentCount : sentCount + preparedCount);
  const isTargetMet = () => getSuccessCount() >= targetQuota;

  // Start with configured minNeedScore, but relax to 0 automatically if not enough strict candidates exist
  let effectiveMinScore = configObj.minNeedScore;

  const MAX_EVALUATIONS = 150;
  let evaluatedCount = 0;

  while (!isTargetMet() && evaluatedCount < MAX_EVALUATIONS) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > MAX_EXECUTION_MS) {
      console.warn(
        `[Campaign] Approaching execution deadline (${Math.round(elapsedMs / 1000)}s). Wrapping up current run cleanly.`
      );
      break;
    }

    // Fetch current pool of ready analyzed leads and unanalyzed leads
    let { readyWithEmail, unanalyzed } = await fetchPool(effectiveMinScore, processedLeadIds);

    // If we don't have enough ready-to-send leads with email at the strict minNeedScore,
    // immediately check if relaxing minNeedScore to 0 gives us ready leads with email (sorted highest needScore first!)
    if (readyWithEmail.length === 0 && effectiveMinScore > 0) {
      const relaxed = await fetchPool(0, processedLeadIds);
      if (relaxed.readyWithEmail.length > 0) {
        effectiveMinScore = 0;
        readyWithEmail = relaxed.readyWithEmail;
        unanalyzed = relaxed.unanalyzed;
      }
    }

    // If still no ready leads with email, pre-analyze unanalyzed leads in fast parallel batches of 5
    while (readyWithEmail.length < targetQuota - getSuccessCount() && Date.now() - startTime < MAX_EXECUTION_MS - 30_000) {
      if (unanalyzed.length === 0) {
        if (searchAttempts >= MAX_SEARCH_ATTEMPTS) break;
        const inserted = await performSearchRotation();
        if (inserted === 0) continue;
      }

      const currentPool = await fetchPool(0, processedLeadIds);
      if (currentPool.unanalyzed.length > 0) {
        await preAnalyzeBatch(currentPool.unanalyzed);
      }

      const updatedPool = await fetchPool(effectiveMinScore, processedLeadIds);
      readyWithEmail = updatedPool.readyWithEmail;
      unanalyzed = updatedPool.unanalyzed;

      if (readyWithEmail.length === 0 && effectiveMinScore > 0) {
        const relaxedPool = await fetchPool(0, processedLeadIds);
        if (relaxedPool.readyWithEmail.length > 0) {
          effectiveMinScore = 0;
          readyWithEmail = relaxedPool.readyWithEmail;
          unanalyzed = relaxedPool.unanalyzed;
        }
      }

      // As soon as we have at least a few ready leads with email, start sending them!
      if (readyWithEmail.length > 0) break;
      if (unanalyzed.length === 0 && searchAttempts >= MAX_SEARCH_ATTEMPTS) break;
    }

    const candidate = readyWithEmail[0] ?? unanalyzed[0];
    if (!candidate) {
      // No more candidates available at all
      break;
    }

    processedLeadIds.add(candidate.id);
    evaluatedCount++;

    const autoSend = configObj.mode === "full";

    try {
      // Always use fastMode: true during autonomous campaign to avoid 25s PageSpeed bottlenecks
      const res = await processLeadAutopilot(candidate.id, {
        autoSend,
        fastMode: true,
        minNeedScore: effectiveMinScore,
        skipNoEmail: configObj.skipNoEmail,
        sourceTrigger: "campaign",
      });

      if (res.status === "sent") sentCount++;
      else if (res.status === "prepared") preparedCount++;
      else if (res.status === "skipped") skippedCount++;
      else if (res.status === "error") errorCount++;

      runItems.push({
        leadId: candidate.id,
        leadName: candidate.name,
        email: res.recipient || candidate.email || (res.lead?.email ?? null),
        status: res.status,
        reason: res.reason,
        auditLink: res.auditLink,
      });

      // Pause between outgoing emails ONLY after an email is actually sent, capped so we never time out
      if (res.status === "sent" && configObj.delaySeconds > 0 && !isTargetMet()) {
        const remainingNeeded = Math.max(1, targetQuota - getSuccessCount());
        const timeLeftMs = MAX_EXECUTION_MS - (Date.now() - startTime);
        const safeDelayMs = Math.max(
          500,
          Math.min(
            configObj.delaySeconds * 1000,
            3000,
            Math.floor((timeLeftMs - remainingNeeded * 7000) / remainingNeeded)
          )
        );
        await sleep(safeDelayMs);
      }
    } catch (err) {
      errorCount++;
      runItems.push({
        leadId: candidate.id,
        leadName: candidate.name,
        email: candidate.email,
        status: "error",
        reason: (err as Error).message,
      });
    }
  }

  const finishedAt = new Date().toISOString();

  // Persist updated rotation indices and lastRunAt
  configObj.currentNicheIndex = currentNicheIdx;
  configObj.currentLocationIndex = currentLocIdx;
  await saveCampaignConfig({
    currentNicheIndex: currentNicheIdx,
    currentLocationIndex: currentLocIdx,
    lastRunAt: finishedAt,
  });

  let searchedQuery: string | undefined;
  let searchedLocation: string | undefined;
  if (searchedQueries.length > 0) {
    searchedQuery = searchedQueries.map((s) => s.niche).join(", ");
    searchedLocation = searchedQueries.map((s) => s.city).join(", ");
  }

  const runLog: CampaignRunLog = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    startedAt,
    finishedAt,
    trigger,
    mode: configObj.mode,
    searchedQuery,
    searchedLocation,
    newLeadsFound,
    processedCount: evaluatedCount,
    sentCount,
    preparedCount,
    skippedCount,
    errorCount,
    items: runItems,
  };

  await recordCampaignRun(runLog);

  // 5. Telegram Notification
  if (runItems.length > 0 || newLeadsFound > 0) {
    const sentList = runItems
      .filter((it) => it.status === "sent" || it.status === "prepared")
      .map(
        (it) =>
          `• <b>${it.leadName}</b> (${it.email || "bez e-mailu"}) ${it.status === "sent" ? "✉️ odesláno" : "📝 připraveno"}`
      )
      .slice(0, 15)
      .join("\n");

    const skippedList = runItems
      .filter((it) => it.status === "skipped")
      .map((it) => {
        const reason = it.reason ? `: <i>${it.reason}</i>` : "";
        return `• <b>${it.leadName}</b>${reason}`;
      })
      .slice(0, 5)
      .join("\n");

    const nextNiche = configObj.niches[configObj.currentNicheIndex % configObj.niches.length];
    const nextLoc = configObj.locations[configObj.currentLocationIndex % configObj.locations.length];

    const modeName = configObj.mode === "full" ? "Plný automat (e-maily odeslány)" : "Poloautomat (náhledy připraveny)";

    let searchSummary = "";
    if (searchedQueries.length === 1) {
      searchSummary = `🔍 Automaticky prohledáno: <i>${searchedQueries[0].niche} · ${searchedQueries[0].city}</i> (+${newLeadsFound} nových)\n`;
    } else if (searchedQueries.length > 1) {
      const parts = searchedQueries.map((s) => `${s.niche} (+${s.inserted})`).join(", ");
      searchSummary = `🔍 Automaticky prohledáno: <i>${parts}</i> (celkem +${newLeadsFound} nových)\n`;
    } else if (searchedQuery) {
      searchSummary = `🔍 Automaticky prohledáno: <i>${searchedQuery} · ${searchedLocation}</i> (+${newLeadsFound} nových)\n`;
    }

    let batchSummary = "";
    if (sentList) {
      batchSummary = `\n<b>Zpracované firmy:</b>\n${sentList}\n`;
    }
    if (skippedList) {
      batchSummary += `\n⚠️ <b>Důvody přeskočení (${skippedCount}):</b>\n${skippedList}\n`;
    }

    await notifyTelegram(
      `🤖 <b>[LeadRadar] Běh autonomní kampaně dokončen</b>\n` +
      `📌 Režim: <b>${modeName}</b>\n` +
      `✉️ Dnes odesláno celkem: <b>${sentToday + sentCount} / ${configObj.dailyLimit}</b>\n` +
      `🏢 Výsledek běhu: <b>${sentCount} odesláno</b>, <b>${preparedCount} připraveno</b>, <b>${skippedCount} přeskočeno</b> (analyzováno celkem ${evaluatedCount} firem)\n` +
      searchSummary +
      batchSummary +
      `\n⏭️ Další v rotaci: <i>${nextNiche} · ${nextLoc}</i>`
    );
  }

  return {
    ok: true,
    status: "completed",
    run: runLog,
    sentToday: sentToday + sentCount,
    dailyLimit: configObj.dailyLimit,
  };
}
