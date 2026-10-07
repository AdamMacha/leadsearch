"use client";

import { useState, useTransition } from "react";
import { generateAuditAction, generateOutreachAction, markEmailSent, saveOutreach } from "@/app/actions";
import { IconCheck, IconCopy, IconExternal, IconMail, IconSparkle } from "@/components/icons";
import type { AuditContent, OutreachContent } from "@/lib/types";
import styles from "./lead.module.css";

type Tab = "audit" | "email" | "call" | "linkedin";

export function AiPanel({
  id,
  audit,
  outreach,
  auditLink,
  previewHref,
  email,
  aiReady,
  analyzed,
}: {
  id: string;
  audit: AuditContent | null;
  outreach: OutreachContent | null;
  auditLink: string | null;
  previewHref: string | null;
  email: string | null;
  aiReady: boolean;
  analyzed: boolean;
}) {
  const [tab, setTab] = useState<Tab>("audit");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"audit" | "outreach" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: outreach?.subject ?? "", email: outreach?.email ?? "" });

  const gen = (kind: "audit" | "outreach") => {
    setBusy(kind);
    setError(null);
    start(async () => {
      const res = kind === "audit" ? await generateAuditAction(id) : await generateOutreachAction(id);
      if (!res.ok) setError(res.error);
      else if (kind === "outreach") setTab("email");
      setBusy(null);
    });
  };

  // keep draft in sync after regeneration
  const [lastOutreach, setLastOutreach] = useState(outreach?.generatedAt);
  if (outreach?.generatedAt !== lastOutreach) {
    setLastOutreach(outreach?.generatedAt);
    setDraft({ subject: outreach?.subject ?? "", email: outreach?.email ?? "" });
  }

  const mailto =
    outreach && email
      ? `mailto:${email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.email)}`
      : null;

  return (
    <section className="card">
      <div className="card-title">
        <h2><IconSparkle size={17} /> Audit a oslovení</h2>
        <span className="small muted">{aiReady ? "Gemini AI" : "šablony (bez AI klíče)"}</span>
      </div>

      {!analyzed && <div className="alert alert-info" style={{ marginBottom: 14 }}>Nejdřív spusť analýzu webu, audit z ní vychází.</div>}

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" disabled={pending} onClick={() => gen("audit")} id="gen-audit">
          {busy === "audit" ? <span className="spinner" /> : <IconSparkle size={15} />}
          {audit ? "Přegenerovat audit" : "Vytvořit audit"}
        </button>
        <button className="btn" disabled={pending} onClick={() => gen("outreach")} id="gen-outreach">
          {busy === "outreach" ? <span className="spinner" /> : <IconMail size={15} />}
          {outreach ? "Přegenerovat oslovení" : "Navrhnout oslovení"}
        </button>
      </div>

      {error && <div className="alert alert-bad" style={{ marginBottom: 14 }}>{error}</div>}

      {auditLink && audit && (
        <div className={styles.auditLink} style={{ marginBottom: 16 }}>
          <span>🔗</span>
          <code>{auditLink}</code>
          <CopyButton text={auditLink} />
          <a href={previewHref ?? auditLink} target="_blank" rel="noreferrer" className="btn btn-sm">
            Náhled <IconExternal size={12} />
          </a>
        </div>
      )}

      {(audit || outreach) && (
        <>
          <div className={styles.tabs} style={{ marginBottom: 14 }}>
            {([
              ["audit", "Audit"],
              ["email", "E-mail"],
              ["call", "Telefonát"],
              ["linkedin", "LinkedIn"],
            ] as [Tab, string][]).map(([t, label]) => (
              <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)} id={`tab-${t}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "audit" &&
            (audit ? (
              <div className="stack">
                <h3>{audit.headline}</h3>
                <p className="text-2">{audit.summary}</p>
                <ol className="stack" style={{ paddingLeft: 18, gap: 8 }}>
                  {audit.recommendations.map((r, i) => (
                    <li key={i}>
                      <strong>{r.title}</strong>
                      <div className="small text-2">{r.description}</div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="muted">Audit zatím není vytvořený.</p>
            ))}

          {tab === "email" &&
            (outreach ? (
              <div className="stack">
                {editing ? (
                  <>
                    <input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} aria-label="Předmět" />
                    <textarea className="textarea" style={{ minHeight: 280 }} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} aria-label="Text e-mailu" />
                  </>
                ) : (
                  <>
                    <div className="row"><span className="muted small">Předmět:</span> <strong>{draft.subject}</strong></div>
                    <div className={styles.pre}>{draft.email}</div>
                  </>
                )}
                <div className="row">
                  {editing ? (
                    <button className="btn btn-primary btn-sm" onClick={() => start(async () => { await saveOutreach(id, draft.subject, draft.email); setEditing(false); })}>
                      Uložit
                    </button>
                  ) : (
                    <button className="btn btn-sm" onClick={() => setEditing(true)}>Upravit</button>
                  )}
                  <CopyButton text={`${draft.subject}\n\n${draft.email}`} label="Kopírovat" />
                  {mailto ? (
                    <a href={mailto} className="btn btn-sm btn-primary" onClick={() => start(() => markEmailSent(id))} id="send-email">
                      <IconMail size={13} /> Otevřít v e-mailu
                    </a>
                  ) : (
                    <span className="small muted">Doplň e-mail v kontaktu pro odeslání.</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="muted">Oslovení zatím není vygenerované.</p>
            ))}

          {tab === "call" && (outreach ? <TextBlock text={outreach.callScript} /> : <p className="muted">Nejdřív vygeneruj oslovení.</p>)}
          {tab === "linkedin" && (outreach ? <TextBlock text={outreach.linkedin} /> : <p className="muted">Nejdřív vygeneruj oslovení.</p>)}
        </>
      )}
    </section>
  );
}

function TextBlock({ text }: { text: string }) {
  return (
    <div className="stack">
      <div className={styles.pre}>{text}</div>
      <div><CopyButton text={text} label="Kopírovat" /></div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />} {label ?? (copied ? "" : "")}
    </button>
  );
}
