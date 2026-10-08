import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { IconFlame, IconGlobe, IconStar, IconUsers } from "@/components/icons";
import { repo } from "@/lib/db";
import { LEAD_STATUSES, STATUS_LABELS, type LeadFilter } from "@/lib/types";
import { LeadsTable } from "./LeadsTable";

export const metadata: Metadata = { title: "Leady" };

export default async function LeadsPage(props: PageProps<"/leads">) {
  await connection();
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const isFav = s("favorite") === "1" || s("favorite") === "true";

  const filter: LeadFilter = {
    q: s("q"),
    status: (s("status") as LeadFilter["status"]) ?? "all",
    website: (s("website") as LeadFilter["website"]) ?? "all",
    analyzed: (s("analyzed") as LeadFilter["analyzed"]) ?? "all",
    minPriority: s("minPriority") ? Number(s("minPriority")) : undefined,
    searchId: s("searchId"),
    sort: (s("sort") as LeadFilter["sort"]) ?? "priority",
    favorite: isFav ? true : undefined,
  };

  const [leads, stats] = await Promise.all([repo().listLeads(filter), repo().stats()]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{isFav ? "Oblíbené leady" : "Leady"}</h1>
          <p>
            {isFav
              ? `${leads.length} ${leads.length === 1 ? "oblíbená firma" : leads.length >= 2 && leads.length <= 4 ? "oblíbené firmy" : "oblíbených firem"} připravených k oslovení.`
              : `${leads.length} firem odpovídá filtru. Řazeno podle priority (potřeba nového webu × kvalita firmy).`}
          </p>
        </div>
      </header>

      {/* Rychlé záložky */}
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Link
          href="/leads"
          className={`btn btn-sm ${!isFav && filter.status === "all" && !filter.minPriority && filter.website === "all" ? "btn-primary" : "btn-ghost"}`}
        >
          <IconUsers size={14} /> Všechny leady ({stats.total})
        </Link>
        <Link
          href="/leads?favorite=1"
          className={`btn btn-sm ${isFav ? "btn-primary" : "btn-ghost"}`}
          style={{ borderColor: isFav ? undefined : "#f59e0b", color: isFav ? undefined : "#f59e0b" }}
        >
          <IconStar size={14} style={{ color: "#f59e0b" }} />
          Oblíbené ({stats.favorites ?? 0})
        </Link>
        <Link
          href="/leads?minPriority=70"
          className={`btn btn-sm ${filter.minPriority === 70 && !isFav ? "btn-primary" : "btn-ghost"}`}
        >
          <IconFlame size={14} /> Horké 70+ ({stats.hot})
        </Link>
        <Link
          href="/leads?website=none"
          className={`btn btn-sm ${filter.website === "none" && !isFav ? "btn-primary" : "btn-ghost"}`}
        >
          <IconGlobe size={14} /> Bez webu ({stats.noWebsite})
        </Link>
      </div>

      <form className="card row" style={{ marginBottom: 16, gap: 10, padding: 14 }} id="leads-filter">
        <input name="q" defaultValue={filter.q} className="input" placeholder="Hledat název, město, obor…" style={{ flex: "1 1 220px", width: "auto" }} />
        <select name="status" defaultValue={filter.status} className="select" style={{ width: 150 }}>
          <option value="all">Všechny stavy</option>
          {LEAD_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
        </select>
        <select name="favorite" defaultValue={isFav ? "1" : ""} className="select" style={{ width: 140 }}>
          <option value="">Všechny</option>
          <option value="1">⭐ Jen oblíbené</option>
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
