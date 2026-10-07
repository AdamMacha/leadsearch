import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { config } from "@/lib/config";
import { repo } from "@/lib/db";
import { notifyTelegram } from "@/lib/notify";
import { formatDate, hostname } from "@/lib/utils";
import styles from "./audit.module.css";

export async function generateMetadata(props: PageProps<"/a/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const lead = await repo().getLeadBySlug(slug);
  return {
    title: { absolute: lead ? `Audit webu – ${lead.name} | ${config.sender.company}` : "Audit" },
    description: lead?.audit?.summary ?? "Nezávazný audit webu",
    robots: { index: false, follow: false },
  };
}

export default async function AuditPage(props: PageProps<"/a/[slug]">) {
  await connection();
  const { slug } = await props.params;
  const r = repo();
  const lead = await r.getLeadBySlug(slug);
  if (!lead) notFound();

  // Track views only from prospects (not from the logged-in owner).
  const isOwner = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!isOwner) {
    after(async () => {
      await r.incrementAuditViews(lead.id);
      await r.addActivity(lead.id, "audit_view", "Klient otevřel audit");
      await notifyTelegram(`👀 <b>${lead.name}</b> právě otevřel(a) audit.\nIdeální chvíle zavolat${lead.phone ? `: ${lead.phone}` : "."}`);
    });
  }

  const a = lead.analysis;
  const audit = lead.audit;
  const issues = a?.issues ?? [];
  const health = lead.needScore == null ? null : Math.max(0, 100 - lead.needScore);
  const hasShot = Boolean(await r.getScreenshot(lead.id));
  const s = config.sender;
  const recommendations = audit?.recommendations ?? issues.slice(0, 5).map((i) => ({ title: i.title, description: i.description }));
  const tone = health == null ? "muted" : health >= 70 ? "good" : health >= 40 ? "warn" : "bad";

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <header className={styles.top}>
        <a href={s.web} className={styles.brand}>{s.company}</a>
        <span className={styles.date}>Audit vytvořen {formatDate(audit?.generatedAt ?? lead.analyzedAt)}</span>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>Nezávazný audit webu</span>
          <h1>{audit?.headline ?? `Audit webu ${lead.name}`}</h1>
          <p className={styles.lead}>
            {audit?.summary ??
              (lead.website
                ? `Prošli jsme web ${hostname(lead.website)} a připravili přehled toho, co by mohlo přivádět víc zákazníků.`
                : `${lead.name} zatím nemá vlastní web. Připravili jsme přehled, co by vám mohl přinést.`)}
          </p>
        </section>

        <section className={styles.overview}>
          <div className={styles.healthCard} data-tone={tone}>
            <span className={styles.healthLabel}>Celkové skóre webu</span>
            <strong className={styles.healthValue}>{lead.website ? (health ?? "–") : "0"}<small>/100</small></strong>
            <span className={styles.healthHint}>
              {!lead.website ? "Web chybí" : health == null ? "" : health >= 70 ? "Dobrý základ" : health >= 40 ? "Prostor ke zlepšení" : "Potřebuje zásadní změnu"}
            </span>
          </div>
          {a?.pageSpeed && !a.pageSpeed.error && (
            <div className={styles.metrics}>
              <Metric label="Rychlost na mobilu" value={a.pageSpeed.performance} />
              <Metric label="SEO" value={a.pageSpeed.seo} />
              <Metric label="Přístupnost" value={a.pageSpeed.accessibility} />
              <Metric label="Technická kvalita" value={a.pageSpeed.bestPractices} />
            </div>
          )}
          {hasShot && (
            <figure className={styles.phone}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/a/${slug}/screenshot`} alt={`Jak web ${lead.name} vypadá na mobilu`} />
              <figcaption>Takhle web vidí zákazníci na mobilu</figcaption>
            </figure>
          )}
        </section>

        {issues.length > 0 && (
          <section className={styles.section}>
            <h2>Co jsme zjistili</h2>
            <div className={styles.issues}>
              {issues.map((i) => (
                <article key={i.id} className={styles.issue} data-sev={i.severity}>
                  <span className={styles.sev} />
                  <div>
                    <h3>{i.title}</h3>
                    <p>{i.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {recommendations.length > 0 && (
          <section className={styles.section}>
            <h2>Co doporučujeme</h2>
            <ol className={styles.recs}>
              {recommendations.map((rec, i) => (
                <li key={i}>
                  <span className={styles.num}>{i + 1}</span>
                  <div>
                    <h3>{rec.title}</h3>
                    <p>{rec.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {audit?.benefits && audit.benefits.length > 0 && (
          <section className={styles.section}>
            <h2>Co vám nový web přinese</h2>
            <ul className={styles.benefits}>
              {audit.benefits.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>
        )}

        <section className={styles.cta}>
          <h2>Probereme to na 15 minut?</h2>
          <p>Nezávazně vám ukážu, jak by mohl vypadat nový web a co by stál. Žádný závazek.</p>
          <div className={styles.ctaButtons}>
            {s.email && (
              <a className={styles.ctaPrimary} href={`mailto:${s.email}?subject=${encodeURIComponent(`Audit webu – ${lead.name}`)}`}>
                Napsat e-mail
              </a>
            )}
            {s.phone && <a className={styles.ctaSecondary} href={`tel:${s.phone.replace(/\s/g, "")}`}>Zavolat {s.phone}</a>}
            <a className={s.email ? styles.ctaSecondary : styles.ctaPrimary} href={s.web} target="_blank" rel="noreferrer">
              Ukázky práce
            </a>
          </div>
          <p className={styles.sign}>{s.name} · {s.company}</p>
        </section>
      </main>

      <footer className={styles.footer}>
        Audit vznikl automatickou analýzou veřejně dostupných informací (Google, PageSpeed Insights). © {new Date().getFullYear()} {s.company}
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  const tone = value == null ? "muted" : value >= 90 ? "good" : value >= 50 ? "warn" : "bad";
  return (
    <div className={styles.metric} data-tone={tone}>
      <div className={styles.metricBar}><span style={{ width: `${value ?? 0}%` }} /></div>
      <div className={styles.metricRow}><span>{label}</span><strong>{value ?? "–"}</strong></div>
    </div>
  );
}
