import type { Metadata } from "next";
import { connection } from "next/server";
import { repo } from "@/lib/db";
import { LEAD_STATUSES, STATUS_LABELS, type LeadFilter } from "@/lib/types";
import { LeadsTable } from "./LeadsTable";

export const metadata: Metadata = { title: "Leady" };

export default async function LeadsPage(props: PageProps<"/leads">) {
  await connection();
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filter: LeadFilter = {
    q: s("q"),
    status: (s("status") as LeadFilter["status"]) ?? "all",
    website: (s("website") as LeadFilter["website"]) ?? "all",
    analyzed: (s("analyzed") as LeadFilter["analyzed"]) ?? "all",
    minPriority: s("minPriority") ? Number(s("minPriority")) : undefined,
    searchId: s("searchId"),
    sort: (s("sort") as LeadFilter["sort"]) ?? "priority",
  };
  const leads = await repo().listLeads(filter);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Leady</h1>
          <p>{leads.length} firem odpovídá filtru. Řazeno podle priority (potřeba nového webu × kvalita firmy).</p>
        </div>
      </header>

      <form className="card row" style={{ marginBottom: 16, gap: 10, padding: 14 }} id="leads-filter">
        <input name="q" defaultValue={filter.q} className="input" placeholder="Hledat název, město, obor…" style={{ flex: "1 1 220px", width: "auto" }} />
        <select name="status" defaultValue={filter.status} className="select" style={{ width: 150 }}>
          <option value="all">Všechny stavy</option>
          {LEAD_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
        </select>
        <select name="website" defaultValue={filter.website} className="select" style={{ width: 140 }}>
          <option value="all">Web: vše</option>
          <option value="none">Bez webu</option>
          <option value="has">S webem</option>
        </select>
        <select name="analyzed" defaultValue={filter.analyzed} className="select" style={{ width: 160 }}>
          <option value="all">Analýza: vše</option>
          <option value="yes">Analyzované</option>
          <option value="no">Neanalyzované</option>
        </select>
        <select name="minPriority" defaultValue={filter.minPriority?.toString() ?? ""} className="select" style={{ width: 150 }}>
          <option value="">Priorita: vše</option>
          <option value="70">🔥 70+</option>
          <option value="50">50+</option>
        </select>
        <select name="sort" defaultValue={filter.sort} className="select" style={{ width: 150 }}>
          <option value="priority">↓ Priorita</option>
          <option value="need">↓ Potřeba webu</option>
          <option value="reviews">↓ Počet recenzí</option>
          <option value="created">↓ Nejnovější</option>
          <option value="name">A–Z</option>
        </select>
        {filter.searchId && <input type="hidden" name="searchId" value={filter.searchId} />}
        <button className="btn btn-primary">Filtrovat</button>
      </form>

      <LeadsTable leads={leads} />
    </div>
  );
}
