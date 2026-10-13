"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  IconCheck,
  IconCopy,
  IconExternal,
  IconPlus,
  IconRefresh,
  IconSend,
  IconSparkle,
  IconTrash,
  IconZap,
} from "@/components/icons";
import type { CampaignConfig, CampaignRunItem, CampaignRunLog } from "@/lib/campaign";
import styles from "./campaign.module.css";

const SQL_MIGRATION = `-- LeadRadar: Schéma pro Úroveň 2 (Kampaň) a Úroveň 3 (Hlídač poptávek)
create table if not exists campaign_settings (
  id text primary key default 'default',
  config jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists campaign_runs (
  id text primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  trigger text not null default 'cron',
  mode text not null default 'prepare',
  searched_query text,
  searched_location text,
  new_leads_found int not null default 0,
  processed_count int not null default 0,
  sent_count int not null default 0,
  prepared_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaign_runs_started_idx on campaign_runs (started_at desc);

create table if not exists demands (
  id text primary key,
  source text not null,
  external_id text,
  title text not null,
  description text not null,
  url text,
  category text,
  budget text,
  published_at timestamptz not null default now(),
  match_score int not null default 0,
  fit_level text not null default 'low',
  match_reason text,
  key_requirements jsonb not null default '[]'::jsonb,
  suggested_pitch text,
  status text not null default 'new',
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demands_created_idx on demands (created_at desc);
create index if not exists demands_match_score_idx on demands (match_score desc);
create index if not exists demands_source_external_idx on demands (source, external_id);

create table if not exists demand_tracker_settings (
  id text primary key default 'default',
  config jsonb not null,
  updated_at timestamptz not null default now()
);

alter table campaign_settings enable row level security;
alter table campaign_runs enable row level security;
alter table demands enable row level security;
alter table demand_tracker_settings enable row level security;
`;

interface Props {
  initialConfig: CampaignConfig;
  initialSentToday: number;
  initialRuns: CampaignRunLog[];
  hoursInfo: { isWorkingDay: boolean; isWorkingHour: boolean; reason?: string };
  placesReady: boolean;
  emailReady: boolean;
  cronSecret?: string;
  baseUrl: string;
}

export function CampaignClient({
  initialConfig,
  initialSentToday,
  initialRuns,
  hoursInfo,
  placesReady,
  emailReady,
  cronSecret,
  baseUrl,
}: Props) {
  const [cfg, setCfg] = useState<CampaignConfig>(initialConfig);
  const [sentToday, setSentToday] = useState(initialSentToday);
  const [runs, setRuns] = useState<CampaignRunLog[]>(initialRuns);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Trigger running state
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{
    ok: boolean;
    status?: string;
    reason?: string;
    error?: string;
    run?: CampaignRunLog;
  } | null>(null);

  // Add niche / location input state
  const [newNiche, setNewNiche] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Expanded run log details
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/cron/campaign${cronSecret ? `?key=${cronSecret}` : ""}`;

  function copySql() {
    navigator.clipboard.writeText(SQL_MIGRATION);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  }

  async function updateConfig(patch: Partial<CampaignConfig>) {
    const updated = { ...cfg, ...patch };
    setCfg(updated);
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/campaign/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.config) {
        setCfg(data.config);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e) {
      console.error("Save config failed", e);
    } finally {
      setSaving(false);
    }
  }

  async function triggerManualRun() {
    if (triggering) return;
    setTriggering(true);
    setTriggerResult(null);
    try {
      const batchLimit = Math.min(5, cfg.dailyLimit);
      const res = await fetch(`/api/cron/campaign?force=1&limit=${batchLimit}`, { method: "POST" });
      const data = await res.json();
      setTriggerResult(data);

      // Refresh runs and today sent
      const ref = await fetch("/api/campaign/settings");
      const refData = await ref.json();
      if (refData.runs) setRuns(refData.runs);
      if (typeof refData.sentToday === "number") setSentToday(refData.sentToday);
    } catch (e) {
      setTriggerResult({ ok: false, error: (e as Error).message });
    } finally {
      setTriggering(false);
    }
  }

  function addNiche() {
    if (!newNiche.trim()) return;
    const item = newNiche.trim();
    if (!cfg.niches.includes(item)) {
      updateConfig({ niches: [...cfg.niches, item] });
    }
    setNewNiche("");
  }

  function removeNiche(item: string) {
    updateConfig({ niches: cfg.niches.filter((n) => n !== item) });
  }

  function addLocation() {
    if (!newLocation.trim()) return;
    const item = newLocation.trim();
    if (!cfg.locations.includes(item)) {
      updateConfig({ locations: [...cfg.locations, item] });
    }
    setNewLocation("");
  }

  function removeLocation(item: string) {
    updateConfig({ locations: cfg.locations.filter((l) => l !== item) });
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  }

  const currentNiche = cfg.niches[cfg.currentNicheIndex % (cfg.niches.length || 1)] || "–";
  const currentLocation = cfg.locations[cfg.currentLocationIndex % (cfg.locations.length || 1)] || "–";

  const progressPercent = Math.min(100, Math.round((sentToday / Math.max(1, cfg.dailyLimit)) * 100));

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1>
              <IconZap size={24} style={{ color: "#818cf8" }} />
              Autopilot Kampaň (Úroveň 2)
            </h1>
            <p className={styles.subtitle}>
              Plně autonomní získávání klientů na pozadí. Systém v pracovní době sám rotuje vybraná odvětví v ČR,
              vyhledává firmy, provádí rozbory a odesílá personalizované e-maily.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              className={`btn ${cfg.enabled ? "btn-primary" : ""}`}
              onClick={() => updateConfig({ enabled: !cfg.enabled })}
              style={
                cfg.enabled
                  ? { background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "white" }
                  : { background: "var(--bg-2)", color: "var(--text-3)" }
              }
            >
              {cfg.enabled ? "🟢 Kampaň je aktivní" : "⏸️ Kampaň je pozastavena"}
            </button>
          </div>
        </div>
      </header>

      {/* Warnings if integrations missing */}
      {!emailReady && cfg.mode === "full" && (
        <div className="alert alert-warn" style={{ marginBottom: 20 }}>
          Nemáš nastavené přihlašovací údaje k SMTP pro odesílání e-mailů. Nastav je v{" "}
          <Link href="/settings" className="link">Nastavení</Link>, jinak budou e-maily přeskakovány.
        </div>
      )}
      {!placesReady && (
        <div className="alert alert-warn" style={{ marginBottom: 20 }}>
          Chybí <code>GOOGLE_PLACES_API_KEY</code>. Automatické dohledávání nových firem nebude fungovat.
        </div>
      )}

      {/* 3 Stats Cards */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Dnešní odeslané e-maily</span>
            <IconSend size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div className={styles.statBig}>
            {sentToday} <small>/ max {cfg.dailyLimit} dnes</small>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <div className={styles.statDesc}>
            Zbývá dnes odeslat: <strong>{Math.max(0, cfg.dailyLimit - sentToday)}</strong> e-mailů
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Aktuální cíl v rotaci</span>
            <IconSparkle size={16} style={{ color: "#38bdf8" }} />
          </div>
          <div className={styles.statBig} style={{ fontSize: 20 }}>
            {currentNiche}
          </div>
          <div className={styles.statDesc}>
            Město: <strong>{currentLocation}</strong> ({cfg.niches.length} oborů × {cfg.locations.length} měst)
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Časové okno pro odesílání</span>
            <IconCheck size={16} style={{ color: "#10b981" }} />
          </div>
          <div className={styles.statBig} style={{ fontSize: 18 }}>
            {hoursInfo.isWorkingDay && hoursInfo.isWorkingHour ? "🟢 Pracovní doba" : "⏸️ Klidový režim"}
          </div>
          <div className={styles.statDesc}>
            {cfg.workingDaysOnly || cfg.workHoursOnly
              ? "Odesílá pouze Po–Pá 8:30–17:00 (ochrana před spam filtry)"
              : "Bez omezení času"}
          </div>
        </div>
      </section>

      {/* Trigger Runner Banner */}
      <section className={styles.triggerBanner}>
        <div className={styles.triggerInfo}>
          <div className={styles.triggerTitle}>
            <IconZap size={18} style={{ color: "#fbbf24" }} />
            Ruční testovací spuštění dávky
          </div>
          <div className={styles.triggerDesc}>
            Chcete ihned otestovat průchod kampaně? Kliknutím spustíte 1 testovací dávku (až pro {Math.min(5, cfg.dailyLimit)} firem) ihned
            bez ohledu na časový plán cronu.
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={triggerManualRun}
          disabled={triggering}
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", color: "white" }}
        >
          {triggering ? <span className="spinner" /> : <IconZap size={16} />}
          {triggering ? "Zpracovávám dávku…" : "⚡ Spustit dávku hned"}
        </button>
      </section>

      {/* Result feedback of manual run */}
      {triggerResult && (() => {
        if (!triggerResult.ok) {
          return (
            <div className={`${styles.resultCard} ${styles.resultCardError}`}>
              <div className={styles.resultHeader}>
                <div className={styles.resultTitle} style={{ color: "#ef4444" }}>
                  ❌ Chyba při spuštění dávky
                </div>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                {triggerResult.error || "Neznámá chyba při volání kampaně"}
              </div>
            </div>
          );
        }

        const run = triggerResult.run;
        const sent = run?.sentCount ?? 0;
        const prep = run?.preparedCount ?? 0;
        const skip = run?.skippedCount ?? 0;
        const errCount = run?.errorCount ?? 0;
        const hasSuccess = sent > 0 || prep > 0;
        const isAllSkipped = !hasSuccess && skip > 0 && errCount === 0;
        const hasErrors = errCount > 0;

        const cardClass = hasErrors
          ? styles.resultCardWarning
          : hasSuccess
          ? styles.resultCardSuccess
          : isAllSkipped
          ? styles.resultCardInfo
          : styles.resultCardSuccess;

        return (
          <div className={`${styles.resultCard} ${cardClass}`}>
            <div className={styles.resultHeader}>
              <div className={styles.resultTitle}>
                {hasSuccess && <span style={{ color: "#10b981" }}>✅ Dávka proběhla úspěšně!</span>}
                {!hasSuccess && hasErrors && <span style={{ color: "#f59e0b" }}>⚠️ Dávka dokončena s chybami</span>}
                {isAllSkipped && <span style={{ color: "#818cf8" }}>ℹ️ Dávka dokončena – prověřené firmy přeskočeny podle filtrů</span>}
                {!hasSuccess && !hasErrors && !isAllSkipped && <span>Dávka dokončena</span>}
              </div>

              <div className={styles.resultPills}>
                <span className={styles.resultPill} style={{ color: sent > 0 ? "#10b981" : "var(--text-3)" }}>
                  <IconSend size={13} /> {sent} odesláno
                </span>
                <span className={styles.resultPill} style={{ color: prep > 0 ? "#38bdf8" : "var(--text-3)" }}>
                  <IconSparkle size={13} /> {prep} připraveno
                </span>
                <span className={styles.resultPill} style={{ color: skip > 0 ? "#fbbf24" : "var(--text-3)" }}>
                  ⏭️ {skip} přeskočeno
                </span>
                {errCount > 0 && (
                  <span className={styles.resultPill} style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.4)" }}>
                    ❌ {errCount} chyb
                  </span>
                )}
              </div>
            </div>

            {/* Itemized list of processed companies */}
            {run?.items && run.items.length > 0 && (
              <div className={styles.resultItemsList}>
                {run.items.map((item: CampaignRunItem, idx: number) => {
                  const badgeClass =
                    item.status === "sent"
                      ? styles.badgeSuccess
                      : item.status === "prepared"
                      ? styles.badgeInfo
                      : item.status === "skipped"
                      ? styles.badgeWarning
                      : styles.badgeError;

                  const badgeText =
                    item.status === "sent"
                      ? "Odesláno"
                      : item.status === "prepared"
                      ? "Připraveno"
                      : item.status === "skipped"
                      ? "Přeskočeno"
                      : "Chyba";

                  return (
                    <div key={idx} className={styles.resultItemRow}>
                      <div className={styles.resultItemLead}>
                        <span className={styles.resultItemLeadName}>{item.leadName}</span>
                        <span className={styles.resultItemLeadEmail}>
                          {item.email || "bez e-mailu na webu"}
                        </span>
                      </div>

                      <div className={styles.resultItemReason}>
                        {item.reason || "–"}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`${styles.badge} ${badgeClass}`}>
                          {badgeText}
                        </span>
                        {item.auditLink && (
                          <a
                            href={item.auditLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost"
                            style={{ padding: "3px 8px", fontSize: 11.5 }}
                          >
                            Audit <IconExternal size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Helpful tip when leads are skipped */}
            {isAllSkipped && (
              <div className={styles.resultTip}>
                💡 <strong>Proč byly firmy přeskočeny?</strong> Autopilot chrání reputaci vaší domény a oslovuje pouze weby se skutečnou potřebou redesignu (potřeba webu musí být alespoň <strong>{cfg.minNeedScore}/100</strong>) a dohledaným e-mailem. Pokud chcete oslovit i weby s menšími nedostatky, můžete níže snížit parametr <em>Minimální potřeba webu</em> (např. na 10 nebo 20).
              </div>
            )}
          </div>
        );
      })()}

      {/* Settings Section */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <IconSparkle size={18} style={{ color: "var(--accent)" }} />
            Parametry a chování autonomní kampaně
            {saving && <span className="small muted">(ukládám…)</span>}
            {saveSuccess && <span className="small" style={{ color: "#10b981" }}>✓ Uloženo</span>}
          </div>
          <div className={styles.sectionDesc}>
            Všechna nastavení se automaticky projeví při příštím běhu cronu i ručním spuštění.
          </div>
        </div>

        {/* Mode Selector */}
        <div className={styles.modesRow}>
          <div
            className={`${styles.modeCard} ${cfg.mode === "full" ? styles.modeCardActive : ""}`}
            onClick={() => updateConfig({ mode: "full" })}
          >
            <div className={styles.modeCardHead}>
              <IconSend size={16} style={{ color: "#6366f1" }} />
              <span>Plný automat (s odesíláním)</span>
            </div>
            <div className={styles.modeCardDesc}>
              Systém samostatně vytvoří audit, sestaví e-mail a <strong>rovnou jej odešle klientovi</strong> přes SMTP.
            </div>
          </div>

          <div
            className={`${styles.modeCard} ${cfg.mode === "prepare" ? styles.modeCardActive : ""}`}
            onClick={() => updateConfig({ mode: "prepare" })}
          >
            <div className={styles.modeCardHead}>
              <IconSparkle size={16} style={{ color: "#38bdf8" }} />
              <span>Poloautomat (bezpečný náhled)</span>
            </div>
            <div className={styles.modeCardDesc}>
              Systém vše vyhledá a připraví (audit + texty), ale <strong>e-maily neodešle</strong>. Zůstanou připravené pro vaši kontrolu.
            </div>
          </div>
        </div>

        {/* Controls Grid */}
        <div className={styles.controlsGrid}>
          <div>
            <label className="label">Denní limit odeslání (ochrana domény)</label>
            <select
              className="select"
              value={cfg.dailyLimit}
              onChange={(e) => updateConfig({ dailyLimit: Number(e.target.value) })}
            >
              <option value={5}>5 e-mailů / den (velmi opatrné)</option>
              <option value={10}>10 e-mailů / den (bezpečné)</option>
              <option value={15}>15 e-mailů / den (doporučeno)</option>
              <option value={20}>20 e-mailů / den (standardní)</option>
              <option value={30}>30 e-mailů / den (vyšší objem)</option>
            </select>
          </div>

          <div>
            <label className="label">Minimální potřeba webu (needScore)</label>
            <select
              className="select"
              value={cfg.minNeedScore}
              onChange={(e) => updateConfig({ minNeedScore: Number(e.target.value) })}
            >
              <option value={0}>Všechny nalezené firmy</option>
              <option value={35}>Min. 35/100 (Doporučeno)</option>
              <option value={50}>Min. 50/100 (Pouze horší weby)</option>
              <option value={70}>Min. 70/100 (Pouze havarijní weby)</option>
            </select>
          </div>

          <div>
            <label className="label">Pauza mezi odesíláním e-mailů</label>
            <select
              className="select"
              value={cfg.delaySeconds}
              onChange={(e) => updateConfig({ delaySeconds: Number(e.target.value) })}
            >
              <option value={4}>4 sekundy</option>
              <option value={6}>6 sekund (Doporučeno)</option>
              <option value={10}>10 sekund (Vysoká bezpečnost)</option>
              <option value={15}>15 sekund</option>
            </select>
          </div>
        </div>

        {/* Checkboxes */}
        <div className={styles.checkboxGrid}>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={cfg.workingDaysOnly}
              onChange={(e) => updateConfig({ workingDaysOnly: e.target.checked })}
            />
            <span>Odesílat pouze v pracovní dny (pondělí až pátek)</span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={cfg.workHoursOnly}
              onChange={(e) => updateConfig({ workHoursOnly: e.target.checked })}
            />
            <span>Odesílat pouze v pracovní době (8:30 – 17:00 středoevropského času)</span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={cfg.skipNoEmail}
              onChange={(e) => updateConfig({ skipNoEmail: e.target.checked })}
            />
            <span>Přeskočit firmy, u kterých se nepodařilo najít e-mail</span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={cfg.fastMode}
              onChange={(e) => updateConfig({ fastMode: e.target.checked })}
            />
            <span>⚡ Bleskový režim (vynechat Google PageSpeed pro maximální rychlost běhu)</span>
          </label>
        </div>

        {/* Niches List */}
        <div className={styles.chipsBox}>
          <div className={styles.chipsHead}>
            <span>Rotace cílových odvětví ({cfg.niches.length})</span>
            <span className="small muted">Systém bere obory popořadě</span>
          </div>
          <div className={styles.chipsList}>
            {cfg.niches.map((n, i) => {
              const isCurrent = i === cfg.currentNicheIndex % cfg.niches.length;
              return (
                <span
                  key={n}
                  className={styles.chip}
                  style={isCurrent ? { borderColor: "#6366f1", background: "rgba(99, 102, 241, 0.15)" } : undefined}
                >
                  {isCurrent && "👉 "}
                  {n}
                  <button type="button" className={styles.chipRemove} onClick={() => removeNiche(n)}>
                    &times;
                  </button>
                </span>
              );
            })}
          </div>
          <div className={styles.addChipRow}>
            <input
              className="input"
              value={newNiche}
              onChange={(e) => setNewNiche(e.target.value)}
              placeholder="Přidat další obor (např. servis oken)…"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNiche())}
              style={{ maxWidth: 300 }}
            />
            <button type="button" className="btn btn-sm" onClick={addNiche}>
              <IconPlus size={14} /> Přidat obor
            </button>
          </div>
        </div>

        {/* Locations List */}
        <div className={styles.chipsBox} style={{ marginTop: 12 }}>
          <div className={styles.chipsHead}>
            <span>Rotace měst a regionů ({cfg.locations.length})</span>
            <span className="small muted">Systém rotuje města v ČR</span>
          </div>
          <div className={styles.chipsList}>
            {cfg.locations.map((loc, i) => {
              const isCurrent = i === cfg.currentLocationIndex % cfg.locations.length;
              return (
                <span
                  key={loc}
                  className={styles.chip}
                  style={isCurrent ? { borderColor: "#38bdf8", background: "rgba(56, 189, 248, 0.15)" } : undefined}
                >
                  {isCurrent && "👉 "}
                  {loc}
                  <button type="button" className={styles.chipRemove} onClick={() => removeLocation(loc)}>
                    &times;
                  </button>
                </span>
              );
            })}
          </div>
          <div className={styles.addChipRow}>
            <input
              className="input"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="Přidat další město (např. Kladno)…"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLocation())}
              style={{ maxWidth: 300 }}
            />
            <button type="button" className="btn btn-sm" onClick={addLocation}>
              <IconPlus size={14} /> Přidat město
            </button>
          </div>
        </div>
      </section>

      {/* Webhook & Cron Integration Guide */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <IconExternal size={18} style={{ color: "#38bdf8" }} />
            Automatické spouštění (Cron & Webhook)
          </div>
          <div className={styles.sectionDesc}>
            Jak zařídit, aby se kampaň spouštěla každý den sama bez vašeho klikání.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
              1. Automatický Cron na Vercelu (nejjednodušší)
            </div>
            <p className="small muted" style={{ lineHeight: 1.5 }}>
              V projektu je již připraven konfigurační soubor <code>vercel.json</code>. Pokud máte aplikaci nasazenou na Vercelu,
              Vercel sám automaticky volá tento endpoint každý všední den v <strong>9:00 ráno</strong>.
            </p>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
              2. Webhook URL (pro externí cron jako cron-job.org nebo EasyCron)
            </div>
            <div className={styles.webhookBox}>
              <span>{webhookUrl}</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={copyWebhook}
                style={{ background: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc" }}
              >
                {copiedWebhook ? <IconCheck size={14} /> : <IconCopy size={14} />}
                {copiedWebhook ? "Zkopírováno!" : "Kopírovat URL"}
              </button>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Tuto URL adresu můžete zdarma vložit na službu <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="link">cron-job.org</a> a nastavit spouštění např. každý den v 9:00.
            </p>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  3. Databázová synchronizace (Supabase)
                </div>
                <p className="small muted" style={{ lineHeight: 1.5, margin: 0 }}>
                  Data o bězích a rotaci se automaticky ukládají do cloudu Supabase. Pokud chcete v Supabase vytvořit nativní tabulky pro čistější SQL schéma, zkopírujte migrační skript a spusťte jej v <i>Supabase → SQL Editor</i>.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={copySql}
                style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" }}
              >
                {copiedSql ? <IconCheck size={14} /> : <IconCopy size={14} />}
                {copiedSql ? "SQL zkopírováno!" : "Kopírovat SQL skript"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Runs History */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <IconRefresh size={18} style={{ color: "var(--accent)" }} />
            Historie posledních běhů kampaně ({runs.length})
          </div>
          <div className={styles.sectionDesc}>
            Protokol automatických i ručních běhů včetně oslovených kontaktů.
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 0", textAlign: "center" }}>
            <p className="muted">Zatím neproběhl žádný běh kampaně.</p>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ marginTop: 10 }}
              onClick={triggerManualRun}
            >
              Spustit první zkušební běh
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={styles.runsTable}>
              <thead>
                <tr>
                  <th>Čas spuštění</th>
                  <th>Spouštěč</th>
                  <th>Režim</th>
                  <th>Hledaný dotaz</th>
                  <th>Odesláno</th>
                  <th>Připraveno</th>
                  <th>Přeskočeno</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isExpanded = expandedRunId === r.id;
                  const dateFormatted = new Date(r.startedAt).toLocaleString("cs-CZ", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td>
                          <strong>{dateFormatted}</strong>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${r.trigger === "cron" ? styles.badgeInfo : styles.badgeWarning}`}>
                            {r.trigger === "cron" ? "⏱️ Cron" : "👤 Ručně"}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${r.mode === "full" ? styles.badgeSuccess : styles.badgeInfo}`}>
                            {r.mode === "full" ? "Odeslání" : "Náhled"}
                          </span>
                        </td>
                        <td className="small muted">
                          {r.searchedQuery ? `${r.searchedQuery} (${r.searchedLocation})` : "–"}
                        </td>
                        <td>
                          <strong style={{ color: r.sentCount > 0 ? "#4ade80" : "inherit" }}>
                            {r.sentCount}
                          </strong>
                        </td>
                        <td>{r.preparedCount}</td>
                        <td className="muted">{r.skippedCount}</td>
                        <td>
                          {r.items.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                            >
                              {isExpanded ? "Zavřít" : `Firmy (${r.items.length})`}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ background: "var(--bg-2)", padding: 14 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
                                Zpracované firmy v tomto běhu:
                              </div>
                              {r.items.map((it, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    fontSize: 12.5,
                                    padding: "4px 0",
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  <div>
                                    <strong>{it.leadName}</strong>{" "}
                                    <span className="muted">({it.email || "bez e-mailu"})</span>
                                    {it.reason && <span className="muted" style={{ marginLeft: 8 }}>({it.reason})</span>}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span
                                      className={`${styles.badge} ${
                                        it.status === "sent"
                                          ? styles.badgeSuccess
                                          : it.status === "prepared"
                                          ? styles.badgeInfo
                                          : styles.badgeWarning
                                      }`}
                                    >
                                      {it.status === "sent"
                                        ? "Odesláno"
                                        : it.status === "prepared"
                                        ? "Připraveno"
                                        : "Přeskočeno"}
                                    </span>
                                    {it.auditLink && (
                                      <a
                                        href={it.auditLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="link"
                                        style={{ fontSize: 12 }}
                                      >
                                        Rozbor &rarr;
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
