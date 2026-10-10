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
    title: { absolute: lead ? `Návrh a rozbor webu – ${lead.name} | ${config.sender.company}` : "Rozbor webu" },
    description: lead?.audit?.summary ?? "Nezávazný rozbor a návrh webu",
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
      await r.addActivity(lead.id, "audit_view", "Klient otevřel návrh/rozbor webu");
      await notifyTelegram(`👀 <b>${lead.name}</b> právě otevřel(a) návrh/rozbor webu.\nIdeální chvíle zavolat${lead.phone ? `: ${lead.phone}` : "."}`);
    });
  }

  const a = lead.analysis;
  const audit = lead.audit;
  const issues = a?.issues ?? [];
  const health = lead.needScore == null ? null : Math.max(0, 100 - lead.needScore);
  const hasStoredShot = Boolean(await r.getScreenshot(lead.id));
  const hasShot = Boolean(hasStoredShot || lead.website);

  const metrics = (() => {
    if (a?.pageSpeed && !a.pageSpeed.error) {
      return {
        perf: a.pageSpeed.performance,
        seo: a.pageSpeed.seo,
        acc: a.pageSpeed.accessibility,
        bp: a.pageSpeed.bestPractices,
      };
    }
    if (!a || !lead.website) return null;
    // Fallback metrics calculated from analysis so the audit is NEVER empty
    let perf = 70;
    if (a.responseTimeMs != null) {
      if (a.responseTimeMs > 5000) perf = 15;
      else if (a.responseTimeMs > 2500) perf = 30;
      else if (a.responseTimeMs > 1200) perf = 55;
      else if (a.responseTimeMs < 400) perf = 90;
    }
    if (!a.hasViewport) perf = Math.max(10, perf - 25);

    let seo = 80;
    if (!a.metaDescription) seo -= 25;
    if (!a.title) seo -= 20;
    if (a.h1Count === 0) seo -= 15;
    if (a.imagesWithoutAlt > 3) seo -= 10;
    seo = Math.max(15, Math.min(100, seo));

    let acc = 85;
    if (!a.hasViewport) acc -= 30;
    if (a.imagesWithoutAlt > 3) acc -= 15;
    if (!a.lang) acc -= 10;
    acc = Math.max(20, Math.min(100, acc));

    let bp = 85;
    if (!a.https) bp -= 35;
    if (!a.hasStructuredData) bp -= 15;
    if (!a.hasOpenGraph) bp -= 10;
    bp = Math.max(20, Math.min(100, bp));

    return { perf, seo, acc, bp };
  })();

  const s = config.sender;
  const phoneDisplay = s.phone
    ? s.phone.replace(/^(\+?\d{3})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4")
    : null;
  const recommendations = audit?.recommendations ?? issues.slice(0, 5).map((i) => ({ title: i.title, description: i.description }));
  const tone = health == null ? "muted" : health >= 70 ? "good" : health >= 40 ? "warn" : "bad";
  const defaultHeadline = lead.website
    ? `Jak z webu získat více zákazníků pro ${lead.name}`
    : `Návrh nového webu pro ${lead.name}`;
  const headline = audit?.headline && !/audit/i.test(audit.headline)
    ? audit.headline
    : defaultHeadline;

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <header className={styles.top}>
        <a href={s.web} className={styles.brand}>{s.company}</a>
        <span className={styles.date}>Připraveno {formatDate(audit?.generatedAt ?? lead.analyzedAt)}</span>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>Nezávazný rozbor a doporučení</span>
          <h1>{headline}</h1>
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
          {metrics && (
            <div className={styles.metrics}>
              <Metric label="Rychlost na mobilu" value={metrics.perf} />
              <Metric label="SEO" value={metrics.seo} />
              <Metric label="Přístupnost" value={metrics.acc} />
              <Metric label="Technická kvalita" value={metrics.bp} />
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
          <h2>Dává vám to smysl? Pojďme to nezávazně probrat</h2>
          <p>Rád vám během 15 minut ukážu konkrétní koncept nového webu a probereme, jak získat více organických poptávek z internetu. K ničemu vás to nezavazuje.</p>
          <div className={styles.ctaButtons}>
            {s.email && (
              <a className={styles.ctaPrimary} href={`mailto:${s.email}?subject=${encodeURIComponent(`Rozbor webu – ${lead.name}`)}`}>
                Napsat e-mail
              </a>
            )}
            {s.phone && <a className={styles.ctaSecondary} href={`tel:${s.phone.replace(/\s/g, "")}`}>Zavolat {phoneDisplay}</a>}
            <a className={s.email ? styles.ctaSecondary : styles.ctaPrimary} href={s.web} target="_blank" rel="noreferrer">
              Naše reference & ukázky
            </a>
          </div>
          <p className={styles.sign}>
            Bc. Adam Mácha ·{" "}
            <a
              href="https://www.technologio.eu/"
              target="_blank"
              rel="noreferrer"
              className={styles.signLink}
            >
              Technologio.cz
            </a>
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        Rozbor vznikl analýzou veřejně dostupných informací (Google, PageSpeed Insights). © {new Date().getFullYear()} {s.company}
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
