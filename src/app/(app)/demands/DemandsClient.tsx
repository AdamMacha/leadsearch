"use client";

import { useState } from "react";
import {
  IconAlert,
  IconBriefcase,
  IconCheck,
  IconCopy,
  IconExternal,
  IconFilter,
  IconPlus,
  IconRefresh,
  IconSparkle,
  IconStar,
  IconTrash,
  IconZap,
} from "@/components/icons";
import type { Demand, DemandFitLevel, DemandStatus, DemandTrackerConfig } from "@/lib/demands/types";
import styles from "./demands.module.css";

interface Props {
  initialDemands: Demand[];
  initialConfig: DemandTrackerConfig;
}

export function DemandsClient({ initialDemands, initialConfig }: Props) {
  const [demands, setDemands] = useState<Demand[]>(initialDemands);
  const [cfg, setCfg] = useState<DemandTrackerConfig>(initialConfig);

  // Filters state
  const [statusTab, setStatusTab] = useState<"all" | "high" | "new" | "saved" | "contacted">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    ok: boolean;
    scannedCount?: number;
    newCount?: number;
    highMatchCount?: number;
    error?: string;
  } | null>(null);

  // Manual Analyzer state
  const [manualText, setManualText] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [analyzingManual, setAnalyzingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Expanded pitch cards
  const [expandedPitches, setExpandedPitches] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Trigger Live Scan
  async function handleTriggerScan() {
    if (scanning) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/demands/scan", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.result) {
        setScanResult({
          ok: true,
          scannedCount: data.result.scannedCount,
          newCount: data.result.newCount,
          highMatchCount: data.result.highMatchCount,
        });

        // Refresh list
        const ref = await fetch("/api/demands");
        const refData = await ref.json();
        if (refData.ok && Array.isArray(refData.demands)) {
          setDemands(refData.demands);
        }
      } else {
        setScanResult({ ok: false, error: data.error || "Chyba při skenování" });
      }
    } catch (e) {
      setScanResult({ ok: false, error: (e as Error).message });
    } finally {
      setScanning(false);
    }
  }

  // Submit Manual Text Analysis
  async function handleManualAnalyze() {
    if (!manualText.trim() || analyzingManual) return;
    setAnalyzingManual(true);
    setManualError(null);
    try {
      const res = await fetch("/api/demands/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: manualText.trim(),
          title: manualTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && data.demand) {
        setDemands((prev) => [data.demand, ...prev]);
        setManualText("");
        setManualTitle("");
        setExpandedPitches((prev) => ({ ...prev, [data.demand.id]: true }));
      } else {
        setManualError(data.error || "Chyba při analýze textu");
      }
    } catch (e) {
      setManualError((e as Error).message);
    } finally {
      setAnalyzingManual(false);
    }
  }

  // Update status (e.g. mark as contacted, saved, dismissed)
  async function handleStatusChange(id: string, newStatus: DemandStatus) {
    try {
      const res = await fetch(`/api/demands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        setDemands((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
        );
      }
    } catch (e) {
      console.error("Status change error:", e);
    }
  }

  // Copy proposal pitch to clipboard
  function handleCopyPitch(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  }

  function togglePitch(id: string) {
    setExpandedPitches((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Stats calculation
  const totalCount = demands.length;
  const highMatchCount = demands.filter((d) => d.matchScore >= 75).length;
  const todayCount = demands.filter((d) => {
    const diffHours = (Date.now() - new Date(d.createdAt).getTime()) / (1000 * 3600);
    return diffHours <= 24;
  }).length;
  const savedCount = demands.filter((d) => d.status === "saved").length;

  // Filter demands
  const filteredDemands = demands.filter((d) => {
    if (statusTab === "high" && d.matchScore < 75) return false;
    if (statusTab === "new" && d.status !== "new") return false;
    if (statusTab === "saved" && d.status !== "saved") return false;
    if (statusTab === "contacted" && d.status !== "contacted") return false;

    if (sourceFilter !== "all" && d.source !== sourceFilter) return false;

    return true;
  });

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1>
            <IconBriefcase size={24} style={{ color: "var(--accent)" }} />
            Hlídač poptávek a zakázek
          </h1>
        </div>
        <div className={styles.subtitle}>
          Autonomní bot nepřetržitě sleduje poptávkové portály (Webtrh.cz, Freelancer.com, WeWorkRemotely). Každou novou poptávku
          AI okamžitě ohodnotí podle vašich dovedností, připraví personalizovaný návrh odpovědi a pošle vám echo na Telegram.
        </div>
      </header>

      {/* Stats Cards */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Celkem zachyceno</span>
            <IconBriefcase size={16} />
          </div>
          <div className={styles.statBig}>{totalCount}</div>
          <div className={styles.statDesc}>Aktivní zakázky v databázi</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Vysoká shoda (75%+)</span>
            <IconSparkle size={16} style={{ color: "#10b981" }} />
          </div>
          <div className={styles.statBig} style={{ color: "#34d399" }}>
            {highMatchCount}
          </div>
          <div className={styles.statDesc}>Perfektně sedí na tvorbu webů</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Nové za 24 hodin</span>
            <IconZap size={16} style={{ color: "#fbbf24" }} />
          </div>
          <div className={styles.statBig}>{todayCount}</div>
          <div className={styles.statDesc}>Čerstvé příležitosti k reakci</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Uloženo do oblíbených</span>
            <IconStar size={16} style={{ color: "#f59e0b" }} />
          </div>
          <div className={styles.statBig} style={{ color: "#fbbf24" }}>
            {savedCount}
          </div>
          <div className={styles.statDesc}>Připraveno k oslovení</div>
        </div>
      </section>

      {/* Quick Manual AI Analyzer */}
      <section className={styles.analyzerCard}>
        <div className={styles.analyzerHeader}>
          <div>
            <div className={styles.analyzerTitle}>
              <IconSparkle size={18} style={{ color: "#a855f7" }} />
              Rychlý rozbor poptávky odkudkoliv (Facebook, LinkedIn, e-mail)
            </div>
            <div className={styles.analyzerDesc}>
              Vidíte poptávku ve FB skupině nebo zprávě? Vložte text sem. AI za 2 sekundy vyhodnotí shodu a sestaví
              přesvědčivý návrh odpovědi připravený k odeslání.
            </div>
          </div>
        </div>

        <div className={styles.analyzerInputRow}>
          <input
            type="text"
            className="input"
            placeholder="Název nebo zadavatel (volitelné)..."
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
          />

          <textarea
            className={styles.textarea}
            placeholder="Vložte sem zkopírovaný text poptávky z Facebooku, zprávy nebo e-mailu (např. 'Hledáme někoho na redesign e-shopu v Next.js...')..."
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
          />

          {manualError && (
            <div className="alert alert-error" style={{ fontSize: 13, padding: "8px 12px" }}>
              {manualError}
            </div>
          )}

          <div className={styles.analyzerActions}>
            <span className="small muted">
              AI použije profil Technologio (Next.js, moderní design, rychlost) a vygeneruje odpověď.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleManualAnalyze}
              disabled={analyzingManual || !manualText.trim()}
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", color: "white" }}
            >
              {analyzingManual ? <span className="spinner" /> : <IconSparkle size={16} />}
              {analyzingManual ? "Analyzuji a tvořím nabídku…" : "⚡ Analyzovat & sestavit nabídku"}
            </button>
          </div>
        </div>
      </section>

      {/* Live Portal Scanner Banner */}
      <section className={styles.triggerBanner}>
        <div className={styles.triggerInfo}>
          <div className={styles.triggerTitle}>
            <IconZap size={18} style={{ color: "#fbbf24" }} />
            Automatický skener portálů (Webtrh.cz, Freelancer.com, WeWorkRemotely)
          </div>
          <div className={styles.triggerDesc}>
            Skener prochází nejnovější poptávky v kategoriích vývoje webů, e-shopů a redesignu. Poptávky se shodou nad 70 %
            automaticky odesílá na váš Telegram.
            {cfg.lastScanAt && (
              <span className="muted" style={{ marginLeft: 8 }}>
                (Poslední kontrola: {new Date(cfg.lastScanAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })})
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleTriggerScan}
          disabled={scanning}
          style={{ background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)", color: "white" }}
        >
          {scanning ? <span className="spinner" /> : <IconRefresh size={16} />}
          {scanning ? "Skenuji poptávky…" : "⚡ Zkontrolovat nové poptávky hned"}
        </button>
      </section>

      {/* Result feedback of scanner */}
      {scanResult && (
        <div
          className="alert"
          style={{
            marginBottom: 20,
            background: scanResult.ok ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            borderColor: scanResult.ok ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)",
          }}
        >
          {scanResult.ok ? (
            <div>
              <strong>✅ Kontrola portálů dokončena!</strong>
              <div style={{ marginTop: 4, fontSize: 13 }}>
                Prověřeno {scanResult.scannedCount} poptávek &middot; Nalezeno {scanResult.newCount} nových &middot;{" "}
                {scanResult.highMatchCount} s vysokou shodou (odesláno na Telegram).
              </div>
            </div>
          ) : (
            <div>
              <strong>❌ Chyba při skenování:</strong> {scanResult.error}
            </div>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <section className={styles.filterBar}>
        <div className={styles.tabsRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${statusTab === "all" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusTab("all")}
          >
            Všechny ({demands.length})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${statusTab === "high" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusTab("high")}
          >
            🔥 Vysoká shoda ({highMatchCount})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${statusTab === "new" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusTab("new")}
          >
            Nové k vyřízení
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${statusTab === "saved" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusTab("saved")}
          >
            ⭐ Uložené ({savedCount})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${statusTab === "contacted" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusTab("contacted")}
          >
            ✓ Osloveno
          </button>
        </div>

        <div className={styles.sourcePills}>
          <button
            type="button"
            className={`${styles.sourcePill} ${sourceFilter === "all" ? styles.sourcePillActive : ""}`}
            onClick={() => setSourceFilter("all")}
          >
            Všechny zdroje
          </button>
          <button
            type="button"
            className={`${styles.sourcePill} ${sourceFilter === "webtrh" ? styles.sourcePillActive : ""}`}
            onClick={() => setSourceFilter("webtrh")}
          >
            Webtrh.cz
          </button>
          <button
            type="button"
            className={`${styles.sourcePill} ${sourceFilter === "freelancer" ? styles.sourcePillActive : ""}`}
            onClick={() => setSourceFilter("freelancer")}
          >
            Freelancer.com
          </button>
          <button
            type="button"
            className={`${styles.sourcePill} ${sourceFilter === "weworkremotely" ? styles.sourcePillActive : ""}`}
            onClick={() => setSourceFilter("weworkremotely")}
          >
            WeWorkRemotely
          </button>
          <button
            type="button"
            className={`${styles.sourcePill} ${sourceFilter === "startupjobs" ? styles.sourcePillActive : ""}`}
            onClick={() => setSourceFilter("startupjobs")}
          >
            StartupJobs.cz
          </button>
          <button
            type="button"
            className={`${styles.sourcePill} ${sourceFilter === "manual" ? styles.sourcePillActive : ""}`}
            onClick={() => setSourceFilter("manual")}
          >
            Vlastní rozbory
          </button>
        </div>
      </section>

      {/* Demands Feed List */}
      <section className={styles.demandsList}>
        {filteredDemands.length === 0 ? (
          <div className={styles.emptyState}>
            <IconBriefcase size={36} style={{ color: "var(--text-3)" }} />
            <div className={styles.emptyTitle}>Žádné poptávky neodpovídají filtru</div>
            <div className={styles.emptyDesc}>
              Klikněte na tlačítko <em>⚡ Zkontrolovat nové poptávky hned</em> pro načtení aktuálních zakázek, nebo vložte
              vlastní text do rychlého rozboru výše.
            </div>
          </div>
        ) : (
          filteredDemands.map((demand) => {
            const isHigh = demand.matchScore >= 75;
            const isMedium = demand.matchScore >= 50 && demand.matchScore < 75;
            const scoreClass = isHigh ? styles.scoreHigh : isMedium ? styles.scoreMedium : styles.scoreLow;
            const cardMatchClass = isHigh
              ? styles.demandCardHighMatch
              : isMedium
              ? styles.demandCardMediumMatch
              : "";

            const isExpanded = expandedPitches[demand.id] ?? isHigh;
            const isCopied = copiedId === demand.id;

            return (
              <article key={demand.id} className={`${styles.demandCard} ${cardMatchClass}`}>
                <div className={demandHeadClass(demand.source)}>
                  <div className={styles.demandTitleCol}>
                    <div className={styles.demandSourceRow}>
                      <span className={`${styles.sourceBadge} ${sourceBadgeClass(demand.source)}`}>
                        {demand.source === "webtrh"
                          ? "Webtrh"
                          : demand.source === "freelancer"
                          ? "Freelancer"
                          : demand.source === "weworkremotely"
                          ? "WWR"
                          : demand.source === "startupjobs"
                          ? "StartupJobs"
                          : "Vlastní vložení"}
                      </span>
                      <span>&bull;</span>
                      <span>{formatTimeAgo(demand.publishedAt)}</span>
                      {demand.category && (
                        <>
                          <span>&bull;</span>
                          <span>{demand.category}</span>
                        </>
                      )}
                    </div>

                    <a
                      href={demand.url || "#"}
                      target={demand.url ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className={styles.demandTitle}
                    >
                      {demand.title} {demand.url && <IconExternal size={14} style={{ verticalAlign: "middle" }} />}
                    </a>
                  </div>

                  <div className={styles.scoreBadge}>
                    <span className={`${styles.scorePill} ${scoreClass}`}>
                      <IconSparkle size={13} /> Shoda: {demand.matchScore} %
                    </span>
                    <span className="small muted">
                      {isHigh ? "Doporučeno reagovat" : isMedium ? "Střední shoda" : "Nízká shoda"}
                    </span>
                  </div>
                </div>

                {/* Requirements & Budget Tags */}
                <div className={styles.requirementsRow}>
                  {demand.budget && (
                    <span className={styles.budgetPill}>
                      💰 Rozpočet: {demand.budget}
                    </span>
                  )}
                  {demand.keyRequirements.map((req, i) => (
                    <span key={i} className={styles.reqPill}>
                      {req}
                    </span>
                  ))}
                </div>

                {/* AI Verdict Box */}
                <div className={styles.verdictBox}>
                  <strong>💡 AI rozbor zadání:</strong> {demand.matchReason}
                </div>

                {/* Proposal Pitch Preview */}
                <div className={styles.pitchSection}>
                  <div className={styles.pitchHeader}>
                    <span>📝 Návrh odpovědi (Pitch) připravený k odeslání:</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "3px 8px", fontSize: 12 }}
                        onClick={() => togglePitch(demand.id)}
                      >
                        {isExpanded ? "Sbalit" : "Rozbalit text"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: "3px 12px", fontSize: 12 }}
                        onClick={() => handleCopyPitch(demand.id, demand.suggestedPitch)}
                      >
                        {isCopied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                        {isCopied ? "✓ Zkopírováno!" : "Zkopírovat odpověď"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.pitchText}>
                      {demand.suggestedPitch}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className={styles.cardFooter}>
                  <div className="small muted">
                    {demand.status === "contacted" && <span style={{ color: "#10b981" }}>✓ Označeno jako osloveno</span>}
                    {demand.status === "saved" && <span style={{ color: "#f59e0b" }}>⭐ Uloženo v oblíbených</span>}
                    {demand.status === "new" && <span>Stav: Čeká na reakci</span>}
                  </div>

                  <div className={styles.footerActions}>
                    {demand.url && (
                      <a
                        href={demand.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost"
                        style={{ fontSize: 12.5 }}
                      >
                        Otevřít zadání <IconExternal size={13} />
                      </a>
                    )}

                    {demand.status !== "saved" ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 12.5 }}
                        onClick={() => handleStatusChange(demand.id, "saved")}
                      >
                        ⭐ Uložit
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 12.5 }}
                        onClick={() => handleStatusChange(demand.id, "new")}
                      >
                        Odebrat z uložených
                      </button>
                    )}

                    {demand.status !== "contacted" && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 12.5, color: "#10b981" }}
                        onClick={() => handleStatusChange(demand.id, "contacted")}
                      >
                        ✓ Označit jako osloveno
                      </button>
                    )}

                    {demand.status !== "dismissed" && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 12.5, color: "var(--text-3)" }}
                        onClick={() => handleStatusChange(demand.id, "dismissed")}
                      >
                        Skrýt
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function demandHeadClass(source: string) {
  return styles.demandHead;
}

function sourceBadgeClass(source: string) {
  if (source === "webtrh") return styles.badgeWebtrh;
  if (source === "freelancer") return styles.badgeFreelancer;
  if (source === "weworkremotely") return styles.badgeWeworkremotely;
  if (source === "startupjobs") return styles.badgeStartupjobs;
  return styles.badgeManual;
}

function formatTimeAgo(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) return `před ${Math.max(1, diffMins)} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `před ${diffHours} hod`;
    const diffDays = Math.floor(diffHours / 24);
    return `před ${diffDays} dny`;
  } catch {
    return "Nedávno";
  }
}
