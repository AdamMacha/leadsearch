"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconMail, IconSend, IconSparkle, IconZap } from "@/components/icons";
import type { Lead } from "@/lib/types";
import styles from "./autopilot.module.css";

interface AutopilotModalProps {
  leads: Lead[];
  isOpen: boolean;
  onClose: () => void;
  onDoneLead?: (lead: Lead) => void;
  onFinish?: () => void;
}

type Mode = "full" | "prepare";

interface LogItem {
  id: string;
  time: string;
  name: string;
  status: "running" | "sent" | "prepared" | "skipped" | "error";
  message: string;
}

export function AutopilotModal({
  leads,
  isOpen,
  onClose,
  onDoneLead,
  onFinish,
}: AutopilotModalProps) {
  // Only target leads that are not already contacted or closed
  const eligible = leads.filter(
    (l) => l.status !== "contacted" && l.status !== "replied" && l.status !== "won"
  );

  const [mode, setMode] = useState<Mode>("full");
  const [minNeedScore, setMinNeedScore] = useState<number>(35);
  const [skipNoEmail, setSkipNoEmail] = useState<boolean>(true);
  const [delaySec, setDelaySec] = useState<number>(4);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [fastMode, setFastMode] = useState<boolean>(false);
  const [limitCount, setLimitCount] = useState<number>(Math.min(10, eligible.length || 10));

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentLeadName, setCurrentLeadName] = useState<string | null>(null);

  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    sent: 0,
    prepared: 0,
    skipped: 0,
    errors: 0,
  });

  const [logs, setLogs] = useState<LogItem[]>([]);
  const cancelledRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (running) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, running]);

  if (!isOpen) return null;

  const nowTime = () =>
    new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const addLog = (name: string, status: LogItem["status"], message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: nowTime(),
        name,
        status,
        message,
      },
    ]);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const startAutopilot = async () => {
    cancelledRef.current = false;
    setRunning(true);
    setFinished(false);
    setLogs([]);

    const toProcess = eligible.slice(0, limitCount);
    setProgress({
      current: 0,
      total: toProcess.length,
      sent: 0,
      prepared: 0,
      skipped: 0,
      errors: 0,
    });

    const workerCount = mode === "full" ? 1 : Math.min(concurrency, toProcess.length);
    const queue = [...toProcess];
    let processedSoFar = 0;

    addLog(
      "Autopilot",
      "running",
      `Zahajuji dávku pro ${toProcess.length} firem (${mode === "full" ? "Plný automat s odesláním" : `Poloautomat (${workerCount} paralelní vlákna)`}${fastMode ? " · Bleskový režim" : ""})…`
    );

    const worker = async () => {
      while (queue.length > 0 && !cancelledRef.current) {
        const lead = queue.shift();
        if (!lead) break;

        setCurrentLeadName(lead.name);
        addLog(lead.name, "running", "Analyzuji web a připravuji rozbor…");

        try {
          const res = await fetch(`/api/leads/${lead.id}/autopilot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              autoSend: mode === "full",
              minNeedScore,
              skipNoEmail,
              fastMode,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.reason || data.error || "Neznámá chyba serveru");
          }

          if (data.lead && onDoneLead) {
            onDoneLead(data.lead);
          }

          processedSoFar++;
          setProgress((p) => ({ ...p, current: processedSoFar }));

          if (data.status === "sent") {
            setProgress((p) => ({ ...p, sent: p.sent + 1 }));
            addLog(
              lead.name,
              "sent",
              `Rozbor vytvořen & e-mail úspěšně odeslán na ${data.recipient || lead.email}`
            );
          } else if (data.status === "prepared") {
            setProgress((p) => ({ ...p, prepared: p.prepared + 1 }));
            addLog(
              lead.name,
              "prepared",
              `Rozbor a oslovení připraveno (web.technologio.eu/${data.lead?.auditSlug || ""})`
            );
          } else if (data.status === "skipped") {
            setProgress((p) => ({ ...p, skipped: p.skipped + 1 }));
            addLog(lead.name, "skipped", `Přeskočeno: ${data.reason || "Nesplňuje kritéria"}`);
          }
        } catch (err) {
          processedSoFar++;
          setProgress((p) => ({ ...p, errors: p.errors + 1, current: processedSoFar }));
          addLog(lead.name, "error", `Chyba: ${(err as Error).message}`);
        }

        // Throttle delay between items only in full mode with email sending
        if (mode === "full" && delaySec > 0 && queue.length > 0 && !cancelledRef.current) {
          await sleep(delaySec * 1000);
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    setRunning(false);
    setFinished(true);
    setCurrentLeadName(null);
    addLog("Autopilot", "sent", "Dávka dokončena.");
    if (onFinish) onFinish();
  };

  const stopAutopilot = () => {
    cancelledRef.current = true;
    addLog("Autopilot", "skipped", "Čekám na dokončení právě běžící firmy a zastavuji…");
  };

  const handleClose = () => {
    if (running) {
      if (confirm("Autopilot právě běží. Opravdu chceš okno zavřít a zastavit běh?")) {
        cancelledRef.current = true;
        onClose();
      }
    } else {
      onClose();
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className={styles.backdrop} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.headerAccent} />
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <div className={styles.iconCircle}>
              <IconZap size={22} />
            </div>
            <div>
              <h2 className={styles.title}>Autopilot: Hromadné oslovení</h2>
              <p className={styles.subtitle}>
                Automatická analýza ➔ Vytvoření rozborů na web.technologio.eu ➔ Personalizované e-maily
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} title="Zavřít">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {!running && !finished ? (
            <div>
              <div className={styles.sectionTitle}>1. Režim zpracování</div>
              <div className={styles.modeCards}>
                <div
                  className={`${styles.modeCard} ${mode === "full" ? styles.modeCardActive : ""}`}
                  onClick={() => setMode("full")}
                >
                  <div className={styles.modeCardTitle}>
                    <IconSend size={16} style={{ color: "var(--accent)" }} />
                    <span>Plný automat</span>
                  </div>
                  <div className={styles.modeCardDesc}>
                    Analyzuje, vytvoří rozbory a <strong>rovnou odešle e-maily</strong> klientům s bezpečnostní prodlevou.
                  </div>
                </div>

                <div
                  className={`${styles.modeCard} ${mode === "prepare" ? styles.modeCardActive : ""}`}
                  onClick={() => setMode("prepare")}
                >
                  <div className={styles.modeCardTitle}>
                    <IconSparkle size={16} style={{ color: "var(--info)" }} />
                    <span>Poloautomat (Náhled)</span>
                  </div>
                  <div className={styles.modeCardDesc}>
                    Vše připraví (web + e-mail), ale <strong>neodešle</strong>. Můžeš si e-maily před odesláním zkontrolovat.
                  </div>
                </div>
              </div>

              <div className={styles.sectionTitle}>2. Nastavení dávky & Filtry</div>
              <div className={styles.configGrid}>
                <div>
                  <label className="label">Počet firem ke zpracování</label>
                  <select
                    className="select"
                    value={limitCount}
                    onChange={(e) => setLimitCount(Number(e.target.value))}
                  >
                    {[5, 10, 15, 20, 30, 50]
                      .filter((n) => n <= Math.max(eligible.length, 5))
                      .map((n) => (
                        <option key={n} value={n}>
                          {n} firem
                        </option>
                      ))}
                    <option value={eligible.length}>Všechny dostupné ({eligible.length})</option>
                  </select>
                </div>

                <div>
                  <label className="label">Minimální potřeba webu</label>
                  <select
                    className="select"
                    value={minNeedScore}
                    onChange={(e) => setMinNeedScore(Number(e.target.value))}
                  >
                    <option value={0}>Všechny (i s dobrým webem)</option>
                    <option value={35}>Min. 35/100 (Doporučeno)</option>
                    <option value={50}>Min. 50/100 (Jen horší weby)</option>
                    <option value={70}>Min. 70/100 (Kritické případy)</option>
                  </select>
                </div>
              </div>

              <div className={styles.configGrid}>
                {mode === "full" ? (
                  <div>
                    <label className="label">Pauza mezi odesláním (SMTP)</label>
                    <select
                      className="select"
                      value={delaySec}
                      onChange={(e) => setDelaySec(Number(e.target.value))}
                    >
                      <option value={2}>2 sekundy (Rychlé)</option>
                      <option value={4}>4 sekundy (Doporučeno)</option>
                      <option value={8}>8 sekund (Bezpečné pro SMTP)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="label">Rychlost přípravy (souběžnost)</label>
                    <select
                      className="select"
                      value={concurrency}
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                    >
                      <option value={2}>2 firmy současně</option>
                      <option value={3}>3 firmy současně (Doporučeno)</option>
                      <option value={4}>4 firmy současně (Maximální rychlost)</option>
                    </select>
                  </div>
                )}

                <div style={{ alignSelf: "end", paddingBottom: 6 }}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={skipNoEmail}
                      onChange={(e) => setSkipNoEmail(e.target.checked)}
                    />
                    <span>Přeskočit firmy bez e-mailu</span>
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <label className={styles.checkboxRow} style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={fastMode}
                    onChange={(e) => setFastMode(e.target.checked)}
                  />
                  <span>
                    ⚡ <strong>Bleskový režim</strong> (vynechá Google PageSpeed, zkrátí přípravu na ~2 s / firmu)
                  </span>
                </label>
                <p className="small muted" style={{ margin: "4px 0 0 24px", lineHeight: 1.35 }}>
                  Google Lighthouse měření trvá 15–25 s na web. V bleskovém režimu se web prověří okamžitě a 20 firem zabere pod 40 sekund.
                </p>
              </div>

              <div
                className={styles.alertBox}
                style={{
                  backgroundColor: mode === "full" ? "rgba(99, 102, 241, 0.08)" : "rgba(2, 132, 199, 0.08)",
                  border: `1px solid ${mode === "full" ? "rgba(99, 102, 241, 0.25)" : "rgba(2, 132, 199, 0.25)"}`,
                  color: "var(--text-1)",
                }}
              >
                {mode === "full" ? (
                  <span>
                    ⚡ <strong>Připraveno:</strong> Vybráno {limitCount} z {eligible.length} firem. E-maily se odešlou s HTML šablonou přes tvůj SMTP server a s odkazem na <code>web.technologio.eu</code>.
                  </span>
                ) : (
                  <span>
                    🛡️ <strong>Bezpečný náhled:</strong> Vygeneruje rozbory a texty e-mailů. Nic se neodešle, dokud v aplikaci nestiskneš „Odeslat 1 kliknutím“.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>
                  {running ? (
                    <span className="row" style={{ gap: 8 }}>
                      <span className="spinner" /> Zpracovávám: <strong>{currentLeadName || "načítám..."}</strong>
                    </span>
                  ) : (
                    <span>🎉 Autopilot dokončen!</span>
                  )}
                </span>
                <span className="small muted">
                  {progress.current} / {progress.total} ({pct}%)
                </span>
              </div>

              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              </div>

              <div className={styles.metricsRow}>
                {mode === "full" && (
                  <span className={styles.metricBadge} style={{ color: "var(--good)", borderColor: "rgba(34, 197, 94, 0.3)" }}>
                    ✉️ Odesláno: {progress.sent}
                  </span>
                )}
                {mode === "prepare" && (
                  <span className={styles.metricBadge} style={{ color: "var(--info)", borderColor: "rgba(59, 130, 246, 0.3)" }}>
                    📝 Připraveno: {progress.prepared}
                  </span>
                )}
                <span className={styles.metricBadge} style={{ color: "var(--warn)", borderColor: "rgba(245, 158, 11, 0.3)" }}>
                  ⏭️ Přeskočeno: {progress.skipped}
                </span>
                {progress.errors > 0 && (
                  <span className={styles.metricBadge} style={{ color: "var(--bad)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                    ❌ Chyby: {progress.errors}
                  </span>
                )}
              </div>

              <div className={styles.logBox}>
                {logs.map((log) => (
                  <div key={log.id} className={styles.logEntry}>
                    <span className={styles.logTime}>[{log.time}]</span>
                    <span className={styles.logName}>{log.name}:</span>
                    <span
                      style={{
                        color:
                          log.status === "sent"
                            ? "var(--good)"
                            : log.status === "prepared"
                            ? "#93c5fd"
                            : log.status === "skipped"
                            ? "#fcd34d"
                            : log.status === "error"
                            ? "var(--bad)"
                            : "var(--text-2)",
                      }}
                    >
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {!running && !finished ? (
            <>
              <button className="btn" onClick={handleClose}>
                Zrušit
              </button>
              <button
                className="btn btn-primary"
                onClick={startAutopilot}
                disabled={eligible.length === 0}
                id="start-autopilot-btn"
              >
                <IconZap size={16} /> Spustit Autopilot ({limitCount})
              </button>
            </>
          ) : running ? (
            <button className="btn" onClick={stopAutopilot}>
              Zastavit po této firmě
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleClose}>
              <IconCheck size={16} /> Hotovo, zavřít
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
