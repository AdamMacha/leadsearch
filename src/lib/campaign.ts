import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { processLeadAutopilot } from "./autopilot";
import { config } from "./config";
import { repo } from "./db";
import { notifyTelegram } from "./notify";
import { runSearch } from "./services";
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
  mode: "prepare", // Safe preview default so Adam can inspect before full auto
  dailyLimit: 15,
  minNeedScore: 35,
  skipNoEmail: true,
  workingDaysOnly: true,
  workHoursOnly: true,
  delaySeconds: 6,
  fastMode: false,
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
  const day = pragueDate.getDay(); // 0 is Sunday, 6 is Saturday
  const hour = pragueDate.getHours() + pragueDate.getMinutes() / 60;

  const isWorkingDay = day >= 1 && day <= 5;
  const isWorkingHour = hour >= 8.5 && hour < 17.0; // 8:30 to 17:00

  let reason: string | undefined;
  if (!isWorkingDay) {
    reason = "Dnes je víkend (kampaň odesílá pouze Po–Pá).";
  } else if (!isWorkingHour) {
    reason = `Mimo pracovní dobu (aktuální čas v ČR: ${pragueDate.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}, kampaň odesílá v čase 8:30–17:00).`;
  }

  return { isWorkingDay, isWorkingHour, reason };
}

export interface RunCampaignOptions {
  force?: boolean;
  trigger?: "cron" | "manual";
  limitOverride?: number;
}

export function isLeadEligibleForCampaign(l: Lead, configObj: CampaignConfig): boolean {
  // Only process leads with 'new' status
  if (l.status !== "new") return false;

  // If already analyzed:
  if (l.analyzedAt) {
    // If skipNoEmail is enabled, must have an email
    if (configObj.skipNoEmail && !l.email) return false;
    // Must meet or exceed minimum needScore threshold
    if ((l.needScore ?? 0) < configObj.minNeedScore) return false;
    return true;
  }

  // If not yet analyzed:
  // If skipNoEmail is on, but lead has neither website nor email, an email can never be scraped
  if (configObj.skipNoEmail && !l.website && !l.email) return false;

  return true;
}

export function sortCampaignCandidates(a: Lead, b: Lead): number {
  // Qualified leads with high needScore prioritized, then fresh unanalyzed
  const aScore = a.analyzedAt ? (a.needScore ?? 0) : 50;
  const bScore = b.analyzedAt ? (b.needScore ?? 0) : 50;
  return bScore - aScore;
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

  // 2. Working days and hours check (unless forced)
  if (!force) {
    const hours = checkWorkingHours();
    if (configObj.workingDaysOnly && !hours.isWorkingDay) {
      return {
        ok: true,
        status: "skipped",
        reason: hours.reason,
        sentToday: await getSentTodayCount(),
        dailyLimit: configObj.dailyLimit,
      };
    }
    if (configObj.workHoursOnly && !hours.isWorkingHour) {
      return {
        ok: true,
        status: "skipped",
        reason: hours.reason,
        sentToday: await getSentTodayCount(),
        dailyLimit: configObj.dailyLimit,
      };
    }
  }

  // 3. Daily quota check
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

  const remainingQuota = force
    ? (opts.limitOverride ?? Math.min(5, configObj.dailyLimit))
    : Math.max(1, configObj.dailyLimit - sentToday);

  const r = repo();
  let leads = await r.listLeads({});

  // Eligible leads in database: new status, uncontacted and meeting criteria
  let eligible = leads
    .filter((l) => isLeadEligibleForCampaign(l, configObj))
    .sort(sortCampaignCandidates);

  let searchedQuery: string | undefined;
  let searchedLocation: string | undefined;
  let newLeadsFound = 0;
  const searchedQueries: { niche: string; city: string; inserted: number }[] = [];
  let currentNicheIdx = configObj.currentNicheIndex;
  let currentLocIdx = configObj.currentLocationIndex;

  // 4. Auto-Search if not enough leads in database (with smart rotation)
  if (eligible.length < remainingQuota && configObj.niches.length > 0 && configObj.locations.length > 0) {
    let attempts = 0;
    const maxAttempts = 3;

    while (eligible.length < remainingQuota && attempts < maxAttempts) {
      attempts++;
      const niche = configObj.niches[currentNicheIdx % configObj.niches.length];
      const city = configObj.locations[currentLocIdx % configObj.locations.length];

      try {
        const searchRes = await runSearch(niche, city, 1);
        newLeadsFound += searchRes.inserted;
        searchedQueries.push({ niche, city, inserted: searchRes.inserted });

        // Advance indices
        currentNicheIdx = (currentNicheIdx + 1) % configObj.niches.length;
        currentLocIdx = (currentLocIdx + 1) % configObj.locations.length;

        // Refetch leads
        leads = await r.listLeads({});
        eligible = leads
          .filter((l) => isLeadEligibleForCampaign(l, configObj))
          .sort(sortCampaignCandidates);

        // If this search found new leads or we have enough eligible candidates, stop searching
        if (searchRes.inserted > 0 || eligible.length >= remainingQuota) {
          break;
        }
      } catch (err) {
        console.error(`Auto search failed for ${niche} ${city}:`, err);
        currentNicheIdx = (currentNicheIdx + 1) % configObj.niches.length;
        currentLocIdx = (currentLocIdx + 1) % configObj.locations.length;
      }
    }

    // Persist updated rotation indices
    configObj.currentNicheIndex = currentNicheIdx;
    configObj.currentLocationIndex = currentLocIdx;
    await saveCampaignConfig({
      currentNicheIndex: currentNicheIdx,
      currentLocationIndex: currentLocIdx,
    });

    if (searchedQueries.length > 0) {
      searchedQuery = searchedQueries.map((s) => s.niche).join(", ");
      searchedLocation = searchedQueries.map((s) => s.city).join(", ");
    }
  }

  // Take candidates for this batch
  const toProcess = eligible.slice(0, remainingQuota);

  const runItems: CampaignRunItem[] = [];
  let sentCount = 0;
  let preparedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const candidate = toProcess[i];
    const autoSend = configObj.mode === "full";

    const res = await processLeadAutopilot(candidate.id, {
      autoSend,
      fastMode: configObj.fastMode,
      minNeedScore: configObj.minNeedScore,
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
      email: candidate.email,
      status: res.status,
      reason: res.reason,
      auditLink: res.auditLink,
    });

    // Safe delay between outgoing emails
    if (autoSend && configObj.delaySeconds > 0 && i < toProcess.length - 1) {
      await sleep(configObj.delaySeconds * 1000);
    }
  }

  const finishedAt = new Date().toISOString();
  const runLog: CampaignRunLog = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    startedAt,
    finishedAt,
    trigger,
    mode: configObj.mode,
    searchedQuery,
    searchedLocation,
    newLeadsFound,
    processedCount: toProcess.length,
    sentCount,
    preparedCount,
    skippedCount,
    errorCount,
    items: runItems,
  };

  await recordCampaignRun(runLog);
  await saveCampaignConfig({ lastRunAt: finishedAt });

  // 5. Telegram Notification
  if (toProcess.length > 0 || newLeadsFound > 0) {
    const sentList = runItems
      .filter((it) => it.status === "sent" || it.status === "prepared")
      .map(
        (it) =>
          `• <b>${it.leadName}</b> (${it.email || "bez e-mailu"}) ${it.status === "sent" ? "✉️ odesláno" : "📝 připraveno"}`
      )
      .slice(0, 8)
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
      `🏢 V této dávce: <b>${sentCount} odesláno</b>, <b>${preparedCount} připraveno</b>, <b>${skippedCount} přeskočeno</b>\n` +
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
