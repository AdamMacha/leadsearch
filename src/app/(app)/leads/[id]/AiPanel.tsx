"use client";

import { useState, useTransition } from "react";
import {
  generateAuditAction,
  generateOutreachAction,
  markEmailSent,
  saveOutreach,
  sendDirectEmailAction,
  setAiModelAction,
} from "@/app/actions";
import {
  IconCheck,
  IconCopy,
  IconExternal,
  IconMail,
  IconSend,
  IconSparkle,
} from "@/components/icons";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai/models";
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
  initialModel,
}: {
  id: string;
  audit: AuditContent | null;
  outreach: OutreachContent | null;
  auditLink: string | null;
  previewHref: string | null;
  email: string | null;
  aiReady: boolean;
  analyzed: boolean;
  initialModel?: string;
}) {
  const [tab, setTab] = useState<Tab>("audit");
  const [selectedModel, setSelectedModel] = useState(initialModel || DEFAULT_AI_MODEL);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"audit" | "outreach" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: outreach?.subject ?? "", email: outreach?.email ?? "" });

  const [sendingDirect, setSendingDirect] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setAiModelAction(model).catch(() => {});
  };

  const gen = (kind: "audit" | "outreach") => {
    setBusy(kind);
    setError(null);
    start(async () => {
      const res =
        kind === "audit"
          ? await generateAuditAction(id, selectedModel)
          : await generateOutreachAction(id, selectedModel);
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

  const handleSendDirect = async () => {
    if (!email) {
      setDirectError("Doplň nejdřív e-mail klienta v sekci Kontakt vpravo.");
      return;
    }
    if (!confirm(`Opravdu odeslat tento e-mail přímo na adresu ${email}?`)) {
      return;
    }
    setSendingDirect(true);
    setDirectError(null);
    setSendSuccess(null);
    try {
      const res = await sendDirectEmailAction(id, draft.subject, draft.email);
      if (!res.ok) {
        setDirectError(res.error);
      } else {
        setSendSuccess(`E-mail byl úspěšně odeslán na ${res.recipient}!`);
        setTimeout(() => setSendSuccess(null), 8000);
      }
    } catch (err) {
      setDirectError((err as Error).message);
    } finally {
      setSendingDirect(false);
    }
  };

  return (
    <section className="card">
      <div className="card-title" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2><IconSparkle size={17} /> Audit a oslovení</h2>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {aiReady ? (
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="small muted">AI model:</span>
              <select
                className="select select-sm"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                title="Změna AI modelu (při vyčerpání limitu u jednoho modelu zvol jiný)"
                style={{ fontSize: "0.82rem", padding: "4px 8px", height: "auto" }}
              >
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.limits.split("·")[0].trim()})
                  </option>
                ))}
                {!AI_MODELS.some((m) => m.id === selectedModel) && (
                  <option value={selectedModel}>{selectedModel} (vlastní)</option>
                )}
              </select>
            </div>
          ) : (
            <span className="small muted">šablony (bez AI klíče)</span>
          )}
        </div>
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
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <h3>{audit.headline}</h3>
                  {audit.model && <span className="badge small">{audit.model}</span>}
                </div>
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
                {sendSuccess && (
                  <div className="alert alert-info row" style={{ gap: 8 }}>
                    <IconCheck size={14} style={{ color: "var(--good)" }} /> {sendSuccess}
                  </div>
                )}
                {directError && (
                  <div className="alert alert-bad row" style={{ gap: 8 }}>
                    {directError}
                  </div>
                )}
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
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={sendingDirect || !email}
                    onClick={handleSendDirect}
                    id="send-direct"
                  >
                    {sendingDirect ? <span className="spinner" /> : <IconSend size={13} />}
                    Odeslat 1 kliknutím
                  </button>
                  {mailto && (
                    <a href={mailto} className="btn btn-sm" onClick={() => start(() => markEmailSent(id))} id="send-email">
                      <IconMail size={13} /> Otevřít v klientovi
                    </a>
                  )}
                  {editing ? (
                    <button className="btn btn-sm" onClick={() => start(async () => { await saveOutreach(id, draft.subject, draft.email); setEditing(false); })}>
                      Uložit
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>Upravit</button>
                  )}
                  <CopyButton text={`${draft.subject}\n\n${draft.email}`} label="Kopírovat" />
                  {!email && (
                    <span className="small muted">Doplň e-mail vpravo v kontaktu pro odeslání.</span>
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
