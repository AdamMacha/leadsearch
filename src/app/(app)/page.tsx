import Link from "next/link";
import { connection } from "next/server";
import { IconAlert, IconEye, IconFlame, IconGlobe, IconSearch, IconStar, IconUsers, IconZap } from "@/components/icons";
import { PriorityPill, StatusBadge } from "@/components/ui";
import { integrationStatus } from "@/lib/config";
import { repo } from "@/lib/db";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/types";
import { formatDate, hostname } from "@/lib/utils";
import styles from "./dashboard.module.css";

function isOverdue(dateIso: string) {
  return new Date(dateIso).getTime() < Date.now();
}

export default async function DashboardPage() {
  await connection();
  const r = repo();
  const [stats, hot, all, searches] = await Promise.all([
    r.stats(),
    r.listLeads({ status: "new", analyzed: "yes", sort: "priority", limit: 8 }),
    r.listLeads({ sort: "created", limit: 500 }),
    r.listSearches(5),
  ]);
  const integrations = integrationStatus();
  const missing = Object.entries(integrations).filter(([, ok]) => !ok).map(([k]) => k);

  const followUps = all
    .filter((l) => l.nextActionAt && !["won", "lost"].includes(l.status))
    .sort((a, b) => new Date(a.nextActionAt!).getTime() - new Date(b.nextActionAt!).getTime())
    .slice(0, 6);
  const viewed = all
    .filter((l) => l.auditLastViewedAt)
    .sort((a, b) => new Date(b.auditLastViewedAt!).getTime() - new Date(a.auditLastViewedAt!).getTime())
    .slice(0, 5);

  const pipelineTotal = Math.max(1, stats.total);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            Dobrý den, <span className="gradient-text">pojďme najít zakázky</span>
          </h1>
          <p>Přehled leadů, pipeline a firem, které se právě dívají na tvůj audit.</p>
        </div>
        <Link href="/search" className="btn btn-primary" id="dash-new-search">
          <IconSearch size={16} /> Nové hledání
        </Link>
      </header>

      {missing.length > 0 && (
        <Link href="/settings" className="alert alert-warn row" style={{ marginBottom: 20 }}>
          <IconAlert size={16} />
          <span>
            Nenastavené integrace: <strong>{missing.join(", ")}</strong>. Klikni pro návod.
          </span>
        </Link>
      )}

      <section className={styles.stats}>
        <Stat icon={<IconUsers size={18} />} label="Leadů celkem" value={stats.total} sub={`${stats.analyzed} analyzováno`} href="/leads" />
        <Stat icon={<IconStar size={18} style={{ color: "#f59e0b" }} />} label="Oblíbené leady" value={stats.favorites ?? 0} sub="připraveno k oslovení" href="/leads?favorite=1" />
        <Stat icon={<IconFlame size={18} />} label="Horké leady" value={stats.hot} sub="priorita 70+" tone="bad" href="/leads?minPriority=70" />
        <Stat icon={<IconGlobe size={18} />} label="Bez webu" value={stats.noWebsite} sub="ideální kandidáti" tone="warn" href="/leads?website=none" />
        <Stat icon={<IconEye size={18} />} label="Zobrazení auditů" value={stats.auditViews} sub="otevřeno klienty" tone="good" />
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <h2>Pipeline</h2>
          <span className="small muted">{stats.byStatus.won} vyhraných zakázek</span>
        </div>
        <div className={styles.pipeline}>
          {LEAD_STATUSES.map((s) => (
            <Link key={s} href={`/leads?status=${s}`} className={styles.stage}>
              <span className={`${styles.stageBar} status-${s}`} style={{ width: `${Math.max(4, (stats.byStatus[s] / pipelineTotal) * 100)}%`, background: "currentColor" }} />
              <span className={styles.stageLabel}>{STATUS_LABELS[s]}</span>
              <strong className="mono">{stats.byStatus[s]}</strong>
            </Link>
          ))}
        </div>
      </section>

      <div className={styles.columns}>
        <section className="card">
          <div className="card-title">
            <h2><IconFlame size={17} /> Koho oslovit teď</h2>
            <Link href="/leads?status=new&sort=priority" className="small link">Všechny →</Link>
          </div>
          {hot.length === 0 ? (
            <div className="empty">
              <h3>Zatím žádné analyzované leady</h3>
              <p>Začni hledáním firem podle oboru a města.</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {hot.map((l) => (
                <li key={l.id}>
                  <Link href={`/leads/${l.id}`} className={styles.item}>
                    <div style={{ minWidth: 0 }}>
                      <strong className={styles.ellipsis}>{l.name}</strong>
                      <span className="small muted">
                        {[l.category, l.city].filter(Boolean).join(" · ")} · {hostname(l.website) ?? "bez webu"}
                      </span>
                    </div>
                    <PriorityPill value={l.priority} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-title"><h2><IconEye size={17} /> Naposledy otevřené audity</h2></div>
            {viewed.length === 0 ? (
              <p className="muted small">Až klient otevře audit, uvidíš to tady. Je to nejlepší chvíle zavolat.</p>
            ) : (
              <ul className={styles.list}>
                {viewed.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className={styles.item}>
                      <strong className={styles.ellipsis}>{l.name}</strong>
                      <span className="small muted">{formatDate(l.auditLastViewedAt, true)} · {l.auditViews}×</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-title"><h2><IconZap size={17} /> Naplánované akce</h2></div>
            {followUps.length === 0 ? (
              <p className="muted small">Žádné naplánované follow-upy.</p>
            ) : (
              <ul className={styles.list}>
                {followUps.map((l) => {
                  const overdue = isOverdue(l.nextActionAt!);
                  return (
                    <li key={l.id}>
                      <Link href={`/leads/${l.id}`} className={styles.item}>
                        <div style={{ minWidth: 0 }}>
                          <strong className={styles.ellipsis}>{l.name}</strong>
                          <StatusBadge status={l.status} />
                        </div>
                        <span className={`badge ${overdue ? "badge-bad" : "badge-info"}`}>{formatDate(l.nextActionAt)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-title"><h2><IconSearch size={17} /> Poslední hledání</h2></div>
            {searches.length === 0 ? (
              <p className="muted small">Zatím žádné hledání.</p>
            ) : (
              <ul className={styles.list}>
                {searches.map((s) => (
                  <li key={s.id}>
                    <Link href={`/leads?searchId=${s.id}`} className={styles.item}>
                      <strong className={styles.ellipsis}>{s.query} {s.location && <span className="muted">· {s.location}</span>}</strong>
                      <span className="small muted">{s.resultsCount} firem · {s.newCount} nových</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  tone?: "good" | "warn" | "bad";
  href?: string;
}) {
  const inner = (
    <div className={`card ${styles.stat}`} data-tone={tone}>
      <span className={styles.statIcon}>{icon}</span>
      <span className="small text-2">{label}</span>
      <strong className={`${styles.statValue} mono`}>{value}</strong>
      <span className="small muted">{sub}</span>
    </div>
  );
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "contents" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
