"use client";

import { useState, useTransition } from "react";
import { logActivity, saveNotes, setNextAction, setStatus, updateContact } from "@/app/actions";
import { IconCalendar, IconGlobe, IconMail, IconPhone } from "@/components/icons";
import { LEAD_STATUSES, STATUS_LABELS, type Activity, type Lead, type LeadStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import styles from "./lead.module.css";

export function ContactCard({ lead }: { lead: Lead }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ email: lead.email ?? "", phone: lead.phone ?? "", website: lead.website ?? "" });

  return (
    <section className="card">
      <div className="card-title">
        <h3>Kontakt</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => !e)} id="contact-edit">
          {editing ? "Zrušit" : "Upravit"}
        </button>
      </div>
      {editing ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await updateContact(lead.id, form);
              setEditing(false);
            });
          }}
        >
          {(["email", "phone", "website"] as const).map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`c-${k}`}>{{ email: "E-mail", phone: "Telefon", website: "Web" }[k]}</label>
              <input id={`c-${k}`} className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <button className="btn btn-primary" disabled={pending}>Uložit</button>
        </form>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <ContactRow icon={<IconMail size={15} />} value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} empty="e-mail nenalezen" />
          <ContactRow icon={<IconPhone size={15} />} value={lead.phone} href={lead.phone ? `tel:${lead.phone.replace(/\s/g, "")}` : undefined} empty="bez telefonu" />
          <ContactRow icon={<IconGlobe size={15} />} value={lead.website} href={lead.website ?? undefined} empty="bez webu" external />
          {lead.address && <p className="small muted">{lead.address}</p>}
        </div>
      )}
    </section>
  );
}

function ContactRow({ icon, value, href, empty, external }: { icon: React.ReactNode; value: string | null; href?: string; empty: string; external?: boolean }) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
      <span className="muted">{icon}</span>
      {value ? (
        <a href={href} className="link" target={external ? "_blank" : undefined} rel="noreferrer" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </a>
      ) : (
        <span className="muted small">{empty}</span>
      )}
    </div>
  );
}

export function CrmCard({ lead }: { lead: Lead }) {
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(lead.notes ?? "");
  const dirty = notes !== (lead.notes ?? "");
  const nextDate = lead.nextActionAt ? lead.nextActionAt.slice(0, 10) : "";

  return (
    <section className="card">
      <div className="card-title">
        <h3>Obchod</h3>
        {pending && <span className="spinner" />}
      </div>
      <div className="stack">
        <div>
          <label className="label" htmlFor="crm-status">Stav</label>
          <select
            id="crm-status"
            className="select"
            value={lead.status}
            onChange={(e) => start(() => setStatus(lead.id, e.target.value as LeadStatus))}
          >
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="crm-next"><IconCalendar size={12} /> Další akce (follow-up)</label>
          <input
            id="crm-next"
            type="date"
            className="input"
            defaultValue={nextDate}
            onChange={(e) => start(() => setNextAction(lead.id, e.target.value || null))}
          />
        </div>
        <div>
          <label className="label" htmlFor="crm-notes">Poznámky</label>
          <textarea id="crm-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Co víš o firmě, s kým mluvit, rozpočet…" />
          {dirty && (
            <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} onClick={() => start(() => saveNotes(lead.id, notes))} id="notes-save">
              Uložit poznámky
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const TYPE_LABEL: Record<Activity["type"], string> = {
  note: "Poznámka",
  status: "Stav",
  email: "E-mail",
  call: "Hovor",
  ai: "AI",
  audit_view: "Audit otevřen",
  system: "Systém",
};

export function ActivityLog({ id, activities }: { id: string; activities: Activity[] }) {
  const [text, setText] = useState("");
  const [type, setType] = useState<"note" | "call" | "email">("call");
  const [pending, start] = useTransition();

  return (
    <section className="card">
      <div className="card-title"><h3>Historie</h3></div>
      <form
        className="stack"
        style={{ gap: 8, marginBottom: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await logActivity(id, type, text);
            setText("");
          });
        }}
      >
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as typeof type)} style={{ width: 110 }} aria-label="Typ aktivity">
            <option value="call">Hovor</option>
            <option value="email">E-mail</option>
            <option value="note">Poznámka</option>
          </select>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Co se stalo…" id="activity-input" />
          <button className="btn" disabled={pending || !text.trim()}>+</button>
        </div>
      </form>
      {activities.length === 0 ? (
        <p className="small muted">Zatím žádná aktivita.</p>
      ) : (
        <ul className={styles.activity}>
          {activities.map((a) => (
            <li key={a.id}>
              <span className={styles.dot} data-type={a.type} />
              <div>
                <div className="small">{a.content}</div>
                <div className="small muted">{TYPE_LABEL[a.type]} · {formatDate(a.createdAt, true)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
