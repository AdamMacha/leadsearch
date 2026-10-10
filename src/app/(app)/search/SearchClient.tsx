"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";
import { addManualLeadAction } from "@/app/actions";
import { AutopilotModal } from "@/components/AutopilotModal";
import { FavoriteButton } from "@/components/FavoriteButton";
import { IconGlobe, IconPlus, IconSearch, IconSparkle, IconStar, IconZap } from "@/components/icons";
import { PriorityPill } from "@/components/ui";
import { useAnalyzeQueue } from "@/components/useAnalyzeQueue";
import type { Lead } from "@/lib/types";
import { hostname } from "@/lib/utils";
import styles from "./search.module.css";

interface HighValueSegment {
  id: string;
  title: string;
  icon: string;
  badge: string;
  badgeBg: string;
  badgeColor: string;
  benefit: string;
  items: string[];
}

const TOP_COMBOS = [
  { label: "Rekonstrukce bytů · Brno", query: "rekonstrukce bytů", location: "Brno" },
  { label: "Truhlářství na míru · Praha", query: "truhlářství na míru", location: "Praha" },
  { label: "Zubní klinika · Ostrava", query: "zubní klinika", location: "Ostrava" },
  { label: "Autodetailing · Plzeň", query: "autodetailing", location: "Plzeň" },
  { label: "Tepelná čerpadla · České Budějovice", query: "tepelná čerpadla", location: "České Budějovice" },
  { label: "Kovovýroba & CNC · Zlín", query: "kovovýroba", location: "Zlín" },
];

const RECOMMENDED_SEGMENTS: HighValueSegment[] = [
  {
    id: "construction",
    title: "Dům, stavba & interiér",
    icon: "🏠",
    badge: "Zakázky 100k+ Kč",
    badgeBg: "rgba(234, 179, 8, 0.15)",
    badgeColor: "#fbbf24",
    benefit: "Vysoký rozpočet na realizaci — nový web se zaplatí z jediného získaného klienta.",
    items: [
      "rekonstrukce bytů",
      "stavební firma",
      "truhlářství na míru",
      "pergoly a přístřešky",
      "tepelná čerpadla",
      "výstavba bazénů",
      "střechy a klempířství",
    ],
  },
  {
    id: "services",
    title: "Prémiové služby & zdraví",
    icon: "🩺",
    badge: "Důvěra & estetika",
    badgeBg: "rgba(59, 130, 246, 0.15)",
    badgeColor: "#60a5fa",
    benefit: "Zákazníci vybírají podle dojmu z mobilu a rychlosti. Pomalý web odrazuje.",
    items: [
      "zubní klinika",
      "estetická medicína",
      "fyzioterapie",
      "advokátní kancelář",
      "architektonické studio",
    ],
  },
  {
    id: "automotive",
    title: "Auto-moto & detailing",
    icon: "🚗",
    badge: "Pomalé weby & těžká grafika",
    badgeBg: "rgba(249, 115, 22, 0.15)",
    badgeColor: "#fb923c",
    benefit: "Vizuální obory s neoptimalizovanými fotkami — ideální terč pro PageSpeed audit.",
    items: [
      "autodetailing",
      "polepy aut",
      "půjčovna obytných vozů",
      "autoservis",
    ],
  },
  {
    id: "b2b",
    title: "B2B výroba & technika",
    icon: "⚙️",
    badge: "Desítky mil. obrat",
    badgeBg: "rgba(168, 85, 247, 0.15)",
    badgeColor: "#c084fc",
    benefit: "Tradiční firmy často s weby z let 2012–2016 hledající reprezentaci pro B2B partnery.",
    items: [
      "kovovýroba",
      "CNC obrábění",
      "elektroinstalace pro firmy",
      "průmyslové podlahy",
    ],
  },
];

const CITIES = ["Praha", "Brno", "Ostrava", "Plzeň", "Olomouc", "Liberec", "Hradec Králové", "České Budějovice", "Zlín", "Pardubice"];

export function SearchClient({ placesReady }: { placesReady: boolean }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ leads: Lead[]; inserted: number } | null>(null);
  const [showAutopilot, setShowAutopilot] = useState(false);

  const onDone = useCallback((lead: Lead) => {
    setResult((r) => (r ? { ...r, leads: r.leads.map((l) => (l.id === lead.id ? lead : l)) } : r));
  }, []);
  const queue = useAnalyzeQueue(onDone);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location, pages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ leads: data.leads, inserted: data.inserted });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const leads = result?.leads ?? [];
  const sorted = [...leads].sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1));
  const unanalyzed = leads.filter((l) => !l.analyzedAt).map((l) => l.id);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form className={`card ${styles.searchCard}`} onSubmit={search}>
        {!placesReady && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            Chybí <code>GOOGLE_PLACES_API_KEY</code>, takže hledání zatím nepůjde. Firmu ale můžeš přidat ručně níže. Návod najdeš v <Link href="/settings" className="link">Nastavení</Link>.
          </div>
        )}
        <div className={styles.fields}>
          <div>
            <label className="label" htmlFor="q">Obor / hledaný výraz</label>
            <input id="q" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="např. rekonstrukce bytů, zubní klinika…" required />
          </div>
          <div>
            <label className="label" htmlFor="loc">Město / region</label>
            <input id="loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="např. Brno" list="cities" />
            <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="label" htmlFor="pages">Počet výsledků</label>
            <select id="pages" className="select" value={pages} onChange={(e) => setPages(Number(e.target.value))}>
              <option value={1}>až 20</option>
              <option value={2}>až 40</option>
              <option value={3}>až 60</option>
            </select>
          </div>
          <button className="btn btn-primary btn-lg" disabled={loading || !placesReady} id="search-submit" style={{ alignSelf: "end" }}>
            {loading ? <span className="spinner" /> : <IconSearch size={17} />} Hledat
          </button>
        </div>

        <div className={styles.presets}>
          {/* Rychlá volba města */}
          <div className={styles.citiesSection}>
            <span className="small muted">Rychlý výběr města:</span>
            <div className={styles.cityChips}>
              {CITIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`${styles.cityChip} ${location.toLowerCase() === c.toLowerCase() ? styles.cityChipActive : ""}`}
                  onClick={() => setLocation(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Rychlé kombo na 1 klik */}
          <div className={styles.combosSection}>
            <div className={styles.combosHeader}>
              <IconZap size={14} style={{ color: "#fbbf24" }} />
              <span>Doporučený rychlý start (vysoká konverze 1-klikem):</span>
            </div>
            <div className={styles.combosList}>
              {TOP_COMBOS.map((combo) => {
                const isActive = query === combo.query && location.toLowerCase() === combo.location.toLowerCase();
                return (
                  <button
                    type="button"
                    key={combo.label}
                    className={`${styles.comboChip} ${isActive ? styles.comboChipActive : ""}`}
                    onClick={() => {
                      setQuery(combo.query);
                      setLocation(combo.location);
                    }}
                  >
                    ⚡ {combo.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prémiové segmenty s odznáčky */}
          <div className={styles.segmentsWrapper}>
            <div className={styles.segmentsHeader}>
              <div className={styles.segmentsTitle}>
                <IconSparkle size={15} style={{ color: "var(--accent)" }} />
                <span>Doporučená prémiová odvětví pro audit</span>
              </div>
              <div className={styles.segmentsSubtitle}>
                Vybráno podle velikosti zakázek a potenciálu modernizace
              </div>
            </div>
            <div className={styles.segmentsGrid}>
              {RECOMMENDED_SEGMENTS.map((seg) => (
                <div key={seg.id} className={styles.segmentCard}>
                  <div className={styles.segmentHead}>
                    <div className={styles.segmentName}>
                      <span>{seg.icon}</span>
                      <span>{seg.title}</span>
                    </div>
                    <span
                      className={styles.segmentBadge}
                      style={{ background: seg.badgeBg, color: seg.badgeColor }}
                    >
                      {seg.badge}
                    </span>
                  </div>
                  <p className={styles.segmentBenefit}>{seg.benefit}</p>
                  <div className={styles.segmentChips}>
                    {seg.items.map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={`${styles.chip} ${query === item ? styles.chipActive : ""}`}
                        onClick={() => setQuery(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </form>

      {error && <div className="alert alert-bad">{error}</div>}

      {result && (
        <section className="card" style={{ padding: 0 }}>
          <div className={styles.resultsHead}>
            <div>
              <h2>{leads.length} firem nalezeno</h2>
              <p className="small muted">{result.inserted} nových, {leads.length - result.inserted} už v databázi</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {queue.running ? (
                <>
                  <span className="small text-2 row" style={{ gap: 8 }}>
                    <span className="spinner" /> Analyzuji {queue.progress.done}/{queue.progress.total}
                  </span>
                  <button type="button" className="btn" onClick={queue.cancel}>Zastavit</button>
                </>
              ) : (
                <>
                  {unanalyzed.length > 0 && (
                    <button type="button" className="btn btn-sm" onClick={() => queue.run(unanalyzed)} id="analyze-all">
                      <IconZap size={14} /> Analyzovat ({unanalyzed.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowAutopilot(true)}
                    id="autopilot-btn"
                    style={{ background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)", color: "white" }}
                  >
                    <IconZap size={15} /> Spustit Autopilot
                  </button>
                </>
              )}
            </div>
          </div>
          {queue.running && (
            <div className={styles.progress}>
              <span style={{ width: `${(queue.progress.done / Math.max(1, queue.progress.total)) * 100}%` }} />
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 34, paddingRight: 0 }}></th>
                  <th>Firma</th>
                  <th>Web</th>
                  <th>Hodnocení</th>
                  <th>Problémy</th>
                  <th style={{ textAlign: "right" }}>Priorita</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => {
                  const st = queue.state[l.id];
                  return (
                    <tr key={l.id}>
                      <td style={{ width: 34, paddingRight: 0, verticalAlign: "middle" }}>
                        <FavoriteButton leadId={l.id} initialFavorite={l.isFavorite} size={16} />
                      </td>
                      <td>
                        <Link href={`/leads/${l.id}`} className="link" style={{ fontWeight: 600 }}>{l.name}</Link>
                        <div className="small muted">{[l.category, l.city].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td>
                        {l.website ? (
                          <a href={l.website} target="_blank" rel="noreferrer" className="row small text-2" style={{ gap: 6 }}>
                            <IconGlobe size={14} /> {hostname(l.website)}
                          </a>
                        ) : (
                          <span className="badge badge-bad">bez webu</span>
                        )}
                      </td>
                      <td className="mono small">
                        {l.rating ? (
                          <span className="row" style={{ gap: 4 }}>
                            <IconStar size={13} style={{ color: "var(--warn)" }} /> {l.rating} <span className="muted">({l.reviewsCount})</span>
                          </span>
                        ) : (
                          <span className="muted">–</span>
                        )}
                      </td>
                      <td className="small text-2" style={{ maxWidth: 320 }}>
                        {st === "running" || st === "queued" ? (
                          <span className="row muted" style={{ gap: 6 }}>
                            {st === "running" ? <span className="spinner" /> : null} {st === "running" ? "analyzuji…" : "ve frontě"}
                          </span>
                        ) : st === "error" ? (
                          <span className="badge badge-bad">chyba analýzy</span>
                        ) : l.analysis ? (
                          l.analysis.issues.slice(0, 2).map((i) => i.title).join(" · ") || "Bez zásadních problémů"
                        ) : (
                          <span className="muted">–</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <PriorityPill value={l.priority} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ManualLead />

      <AutopilotModal
        leads={leads}
        isOpen={showAutopilot}
        onClose={() => setShowAutopilot(false)}
        onDoneLead={onDone}
      />
    </div>
  );
}

function ManualLead() {
  const [state, action, pending] = useActionState(addManualLeadAction, undefined);
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <div className="card-title" style={{ marginBottom: open ? 14 : 0 }}>
        <div>
          <h2><IconPlus size={17} /> Přidat firmu ručně</h2>
          <p className="small muted">Potkal jsi firmu osobně nebo ji máš z doporučení? Přidej ji a nech zanalyzovat.</p>
        </div>
        <button className="btn btn-sm" type="button" onClick={() => setOpen((o) => !o)} id="manual-toggle">
          {open ? "Zavřít" : "Přidat"}
        </button>
      </div>
      {open && (
        <form action={action} className={styles.manual}>
          <div><label className="label" htmlFor="m-name">Název firmy *</label><input id="m-name" name="name" className="input" required /></div>
          <div><label className="label" htmlFor="m-web">Web</label><input id="m-web" name="website" className="input" placeholder="www.firma.cz" /></div>
          <div><label className="label" htmlFor="m-city">Město</label><input id="m-city" name="city" className="input" /></div>
          <div><label className="label" htmlFor="m-phone">Telefon</label><input id="m-phone" name="phone" className="input" /></div>
          <div><label className="label" htmlFor="m-cat">Obor</label><input id="m-cat" name="category" className="input" /></div>
          <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "end" }} id="manual-submit">
            {pending ? <span className="spinner" /> : <IconSparkle size={16} />} Přidat a analyzovat
          </button>
          {state?.error && <div className="alert alert-bad">{state.error}</div>}
        </form>
      )}
    </section>
  );
}
