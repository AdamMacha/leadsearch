import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IconAlert, IconArrowLeft, IconExternal, IconMap, IconStar } from "@/components/icons";
import { ScoreRing } from "@/components/ui";
import { AI_MODEL_COOKIE, DEFAULT_AI_MODEL } from "@/lib/ai/models";
import { auditUrl, integrationStatus } from "@/lib/config";
import { repo } from "@/lib/db";
import { formatDate, hostname } from "@/lib/utils";
import { AiPanel } from "./AiPanel";
import { ActivityLog, ContactCard, CrmCard } from "./CrmPanels";
import { AnalyzeButton, DeleteButton } from "./LeadButtons";
import styles from "./lead.module.css";

export const maxDuration = 60;

export async function generateMetadata(props: PageProps<"/leads/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const lead = await repo().getLead(id);
  return { title: lead?.name ?? "Lead" };
}

const SEVERITY_LABEL = { critical: "kritické", high: "vysoké", medium: "střední", low: "nízké" } as const;
const SEVERITY_CLASS = { critical: "badge-bad", high: "badge-bad", medium: "badge-warn", low: "badge" } as const;

export default async function LeadPage(props: PageProps<"/leads/[id]">) {
  await connection();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const r = repo();
  const cookieJar = await cookies();
  const activeModel = cookieJar.get(AI_MODEL_COOKIE)?.value || process.env.GEMINI_MODEL || DEFAULT_AI_MODEL;
  const lead = await r.getLead(id);
  if (!lead) notFound();
  const [activities, hasShot] = await Promise.all([r.listActivities(id), r.getScreenshot(id).then(Boolean)]);
  const a = lead.analysis;
  const psi = a?.pageSpeed;
  const ai = integrationStatus().gemini;

  return (
    <div className="page">
      <Link href="/leads" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, marginLeft: -10 }}>
        <IconArrowLeft size={14} /> Zpět na leady
      </Link>

      <header className={styles.header}>
        <div style={{ minWidth: 0 }}>
          <h1>{lead.name}</h1>
          <div className="row text-2" style={{ marginTop: 8, gap: 14 }}>
            {lead.category && <span>{lead.category}</span>}
            {lead.city && <span className="muted">· {lead.city}</span>}
            {lead.rating != null && (
              <span className="row" style={{ gap: 4 }}>
                <IconStar size={14} style={{ color: "var(--warn)" }} /> <strong>{lead.rating}</strong>
                <span className="muted">({lead.reviewsCount} recenzí)</span>
              </span>
            )}
            {lead.googleMapsUrl && (
              <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer" className="row link small" style={{ gap: 4 }}>
                <IconMap size={14} /> Google Mapy
              </a>
            )}
          </div>
        </div>
        <div className="row">
          <AnalyzeButton id={lead.id} analyzed={!!lead.analyzedAt} auto={sp.analyze === "1" && !lead.analyzedAt} />
          <DeleteButton id={lead.id} />
        </div>
      </header>

      <div className={styles.layout}>
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          {/* ---------- Scores ---------- */}
          <section className={`card ${styles.scores}`}>
            <ScoreRing value={lead.priority} size={84} label="Priorita" />
            <ScoreRing value={lead.needScore} size={64} invert label="Potřeba webu" />
            <ScoreRing value={lead.qualityScore} size={64} label="Kvalita firmy" />
            <div className={styles.scoreInfo}>
              {a ? (
                <>
                  <p className="text-2">
                    {!a.hasWebsite
                      ? "Firma nemá vlastní web. Ideální kandidát."
                      : !a.reachable
                        ? "Web se nepodařilo načíst."
                        : `Nalezeno ${a.issues.length} problémů na ${hostname(a.finalUrl)}.`}
                  </p>
                  <p className="small muted">Analyzováno {formatDate(lead.analyzedAt, true)}</p>
                </>
              ) : (
                <p className="text-2">Lead zatím není analyzovaný. Spusť analýzu webu.</p>
              )}
            </div>
          </section>

          {/* ---------- Analysis ---------- */}
          {a && (
            <section className="card">
              <div className="card-title">
                <h2>Analýza webu</h2>
                {a.finalUrl && (
                  <a href={a.finalUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
                    Otevřít web <IconExternal size={13} />
                  </a>
                )}
              </div>

              {psi && (
                <div className={styles.psi}>
                  {psi.error ? (
                    <div className="alert alert-warn row" style={{ gridColumn: "1 / -1" }}>
                      <IconAlert size={15} /> PageSpeed se nepodařilo spustit: {psi.error.slice(0, 160)}
                    </div>
                  ) : (
                    <>
                      <ScoreRing value={psi.performance} size={56} label="Výkon" />
                      <ScoreRing value={psi.seo} size={56} label="SEO" />
                      <ScoreRing value={psi.accessibility} size={56} label="Přístupnost" />
                      <ScoreRing value={psi.bestPractices} size={56} label="Best practices" />
                      <div className={styles.vitals}>
                        <span>LCP <strong className="mono">{psi.lcpMs ? (psi.lcpMs / 1000).toFixed(1) + " s" : "–"}</strong></span>
                        <span>CLS <strong className="mono">{psi.cls?.toFixed(2) ?? "–"}</strong></span>
                        <span>TBT <strong className="mono">{psi.tbtMs ? Math.round(psi.tbtMs) + " ms" : "–"}</strong></span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className={styles.analysisGrid}>
                <div>
                  <h3 style={{ marginBottom: 10 }}>Problémy</h3>
                  {a.issues.length === 0 ? (
                    <p className="muted">Web nemá zásadní problémy. Nižší priorita.</p>
                  ) : (
                    <ul className={styles.issues}>
                      {a.issues.map((i) => (
                        <li key={i.id}>
                          <div className="row" style={{ justifyContent: "space-between" }}>
                            <strong>{i.title}</strong>
                            <span className={`badge ${SEVERITY_CLASS[i.severity]}`}>{SEVERITY_LABEL[i.severity]}</span>
                          </div>
                          <p className="small text-2">{i.description}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="stack">
                  {hasShot && (
                    <div className={styles.phone}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/leads/${lead.id}/screenshot`} alt={`Mobilní náhled webu ${lead.name}`} />
                    </div>
                  )}
                  {a.hasWebsite && a.reachable && (
                    <dl className={styles.facts}>
                      <dt>HTTPS</dt><dd>{a.https ? "✓" : "✗"}</dd>
                      <dt>Mobilní viewport</dt><dd>{a.hasViewport ? "✓" : "✗"}</dd>
                      <dt>Odezva serveru</dt><dd className="mono">{a.responseTimeMs ? `${a.responseTimeMs} ms` : "–"}</dd>
                      <dt>Copyright</dt><dd className="mono">{a.copyrightYear ?? "–"}</dd>
                      <dt>Titulek</dt><dd title={a.title ?? ""}>{a.title ? a.title.slice(0, 40) : "✗"}</dd>
                      <dt>Technologie</dt>
                      <dd>
                        <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                          {a.technologies.length ? a.technologies.map((t) => <span key={t} className="badge">{t}</span>) : "–"}
                        </div>
                      </dd>
                    </dl>
                  )}
                </div>
              </div>
            </section>
          )}

          <AiPanel
            id={lead.id}
            audit={lead.audit}
            outreach={lead.outreach}
            auditLink={lead.auditSlug ? auditUrl(lead.auditSlug) : null}
            previewHref={lead.auditSlug ? `/a/${lead.auditSlug}` : null}
            email={lead.email}
            aiReady={ai}
            analyzed={!!lead.analyzedAt}
            initialModel={activeModel}
          />
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          <ContactCard lead={lead} />
          <CrmCard lead={lead} />
          <ActivityLog id={lead.id} activities={activities} />
        </aside>
      </div>
    </div>
  );
}
