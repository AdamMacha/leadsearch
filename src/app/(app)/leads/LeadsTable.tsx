"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { AutopilotModal } from "@/components/AutopilotModal";
import { FavoriteButton } from "@/components/FavoriteButton";
import { IconEye, IconGlobe, IconMail, IconPhone, IconStar, IconZap } from "@/components/icons";
import { PriorityPill, ScoreRing, StatusBadge } from "@/components/ui";
import { useAnalyzeQueue } from "@/components/useAnalyzeQueue";
import type { Lead } from "@/lib/types";
import { hostname } from "@/lib/utils";

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const onDone = useCallback(() => router.refresh(), [router]);
  const queue = useAnalyzeQueue(onDone);
  const unanalyzed = leads.filter((l) => !l.analyzedAt).map((l) => l.id);
  const [showAutopilot, setShowAutopilot] = useState(false);
  const uncontactedCount = leads.filter(
    (l) => l.status !== "contacted" && l.status !== "replied" && l.status !== "won"
  ).length;

  if (leads.length === 0) {
    return (
      <div className="card empty">
        <h3>Žádné leady</h3>
        <p>
          Zkus změnit filtr nebo <Link href="/search" className="link">vyhledat nové firmy</Link>.
        </p>
      </div>
    );
  }

  return (
    <section className="card" style={{ padding: 0 }}>
      <div className="row" style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span className="small text-2">
          Zobrazeno <strong>{leads.length}</strong> firem {unanalyzed.length > 0 ? `(${unanalyzed.length} neanalyzováno)` : ""}
        </span>
        <div className="row" style={{ gap: 8 }}>
          {unanalyzed.length > 0 && !queue.running && (
            <button className="btn btn-sm" onClick={() => queue.run(unanalyzed)} id="leads-analyze-all">
              <IconZap size={14} /> Analyzovat ({unanalyzed.length})
            </button>
          )}
          {queue.running && (
            <span className="row small text-2" style={{ gap: 8 }}>
              <span className="spinner" /> {queue.progress.done}/{queue.progress.total}
              <button className="btn btn-sm" onClick={queue.cancel}>Zastavit</button>
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setShowAutopilot(true)}
            id="leads-autopilot-btn"
            style={{ background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)", color: "white" }}
          >
            <IconZap size={14} /> Spustit Autopilot ({uncontactedCount})
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34, paddingRight: 0 }}></th>
              <th>Firma</th>
              <th>Kontakt</th>
              <th>Hodnocení</th>
              <th>Potřeba</th>
              <th>Stav</th>
              <th style={{ textAlign: "right" }}>Priorita</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const st = queue.state[l.id];
              return (
                <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/leads/${l.id}`)}>
                  <td style={{ width: 34, paddingRight: 0, verticalAlign: "middle" }}>
                    <FavoriteButton leadId={l.id} initialFavorite={l.isFavorite} size={16} />
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
                      {l.name}
                    </Link>
                    <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[l.category, l.city].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>
                    <div className="row small text-2" style={{ gap: 12 }}>
                      {l.website ? (
                        <span className="row" style={{ gap: 5 }} title={l.website}>
                          <IconGlobe size={13} /> {hostname(l.website)}
                        </span>
                      ) : (
                        <span className="badge badge-bad">bez webu</span>
                      )}
                      {l.phone && <IconPhone size={13} aria-label="telefon" />}
                      {l.email && <IconMail size={13} aria-label="e-mail" />}
                      {l.auditViews > 0 && (
                        <span className="badge badge-good" title="Klient otevřel audit">
                          <IconEye size={12} /> {l.auditViews}
                        </span>
                      )}
                    </div>
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
                  <td>
                    {st === "running" || st === "queued" ? <span className="spinner" /> : <ScoreRing value={l.needScore} size={34} invert />}
                  </td>
                  <td><StatusBadge status={l.status} /></td>
                  <td style={{ textAlign: "right" }}><PriorityPill value={l.priority} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AutopilotModal
        leads={leads}
        isOpen={showAutopilot}
        onClose={() => setShowAutopilot(false)}
        onFinish={onDone}
      />
    </section>
  );
}
