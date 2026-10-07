import type { Issue, Lead, WebsiteAnalysis } from "../types";
import { isSiteBuilder } from "./html";

type Facts = Omit<WebsiteAnalysis, "issues" | "analyzedAt"> & {
  usesTableLayout?: boolean;
  jqueryVersion?: string | null;
};

/** Builds the list of problems with weights. Texts are written for the business owner (Czech). */
export function buildIssues(a: Facts, now = new Date()): Issue[] {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  if (!a.hasWebsite) {
    add({
      id: "no_website",
      severity: "critical",
      weight: 100,
      title: "Firma nemá vlastní web",
      description:
        "Zákazníci, kteří vás hledají na Googlu, najdou jen zápis na mapách nebo konkurenci. Vlastní web buduje důvěru a přivádí poptávky 24/7.",
    });
    return issues;
  }
  if (!a.reachable) {
    add({
      id: "unreachable",
      severity: "critical",
      weight: 95,
      title: "Web nejde načíst",
      description:
        "Při naší kontrole se web nepodařilo otevřít. Každý návštěvník, který narazí na nefunkční stránku, odchází ke konkurenci.",
    });
    return issues;
  }

  if (!a.https) {
    add({
      id: "no_https",
      severity: "high",
      weight: 20,
      title: "Chybí zabezpečení HTTPS",
      description:
        "Prohlížeče web označují jako „Nezabezpečený“. To odrazuje návštěvníky a Google takové weby znevýhodňuje ve vyhledávání.",
    });
  }
  if (!a.hasViewport) {
    add({
      id: "not_mobile",
      severity: "critical",
      weight: 25,
      title: "Web není přizpůsobený mobilům",
      description:
        "Většina návštěv dnes přichází z telefonu. Na mobilu se stránka zobrazuje zmenšeně a špatně se ovládá.",
    });
  }

  const perf = a.pageSpeed?.performance;
  if (perf != null && perf < 50) {
    add({
      id: "slow",
      severity: "high",
      weight: 20,
      title: `Web je na mobilu pomalý (skóre ${perf}/100)`,
      description:
        "Pomalé načítání výrazně zvyšuje počet lidí, kteří odejdou dřív, než web uvidí. Rychlost je i faktor hodnocení v Googlu.",
    });
  } else if (perf != null && perf < 80) {
    add({
      id: "slowish",
      severity: "medium",
      weight: 10,
      title: `Rychlost webu má rezervy (skóre ${perf}/100)`,
      description: "Optimalizací obrázků a kódu lze web výrazně zrychlit a zlepšit pozice ve vyhledávání.",
    });
  } else if (a.responseTimeMs != null && a.responseTimeMs > 3000) {
    add({
      id: "slow_server",
      severity: "medium",
      weight: 8,
      title: "Server odpovídá pomalu",
      description: `První odpověď serveru trvala ${(a.responseTimeMs / 1000).toFixed(1)} s. Doporučujeme rychlejší hosting.`,
    });
  }

  const seo = a.pageSpeed?.seo;
  if (seo != null && seo < 80) {
    add({
      id: "seo",
      severity: "medium",
      weight: 10,
      title: `Základní SEO má nedostatky (skóre ${seo}/100)`,
      description: "Google web hůře chápe a zobrazuje ho níže. Chybí základní prvky, které pomáhají ve vyhledávání.",
    });
  }
  if (!a.title || !a.metaDescription) {
    add({
      id: "meta",
      severity: "medium",
      weight: 8,
      title: "Chybí titulek nebo popis pro vyhledávače",
      description: "Ve výsledcích Googlu se pak zobrazuje náhodný text, který lidi nemotivuje kliknout.",
    });
  }

  const year = now.getFullYear();
  if (a.copyrightYear && a.copyrightYear <= year - 3) {
    add({
      id: "outdated",
      severity: "medium",
      weight: 10,
      title: `Web působí neaktualizovaně (© ${a.copyrightYear})`,
      description: "Starý letopočet v patičce budí dojem, že firma nefunguje nebo o web nepečuje.",
    });
  }

  const legacy: string[] = [];
  if (a.technologies.includes("Flash")) legacy.push("Flash");
  if (a.usesTableLayout) legacy.push("tabulkový layout");
  if (a.jqueryVersion?.startsWith("1.")) legacy.push("stará verze jQuery");
  if (legacy.length) {
    add({
      id: "legacy_tech",
      severity: "high",
      weight: 12,
      title: "Zastaralé technologie",
      description: `Web používá ${legacy.join(", ")}. To zhoršuje bezpečnost, rychlost i zobrazení na moderních zařízeních.`,
    });
  }

  if (isSiteBuilder(a.technologies)) {
    add({
      id: "site_builder",
      severity: "low",
      weight: 8,
      title: "Web je postavený na šablonovém builderu",
      description:
        "Šablonové weby mají omezené možnosti SEO, rychlosti a designu. Web na míru lépe odliší firmu od konkurence.",
    });
  }

  if (!a.hasOpenGraph) {
    add({
      id: "no_og",
      severity: "low",
      weight: 4,
      title: "Odkazy na sociálních sítích nemají náhled",
      description: "Při sdílení na Facebooku nebo WhatsAppu se nezobrazí obrázek ani popis, takže odkaz působí neprofesionálně.",
    });
  }
  if (!a.hasStructuredData) {
    add({
      id: "no_schema",
      severity: "low",
      weight: 3,
      title: "Chybí strukturovaná data",
      description: "Google nemůže zobrazit rozšířené výsledky (hodnocení, otevírací dobu, adresu).",
    });
  }
  if (!a.hasAnalytics) {
    add({
      id: "no_analytics",
      severity: "low",
      weight: 3,
      title: "Web neměří návštěvnost",
      description: "Bez měření nevíte, kolik lidí web navštíví a odkud přicházejí poptávky.",
    });
  }
  const acc = a.pageSpeed?.accessibility;
  if (acc != null && acc < 70) {
    add({
      id: "accessibility",
      severity: "low",
      weight: 5,
      title: `Nízká přístupnost (skóre ${acc}/100)`,
      description: "Kontrast, velikost písma a popisky prvků ztěžují používání webu části návštěvníků.",
    });
  }

  return issues.sort((x, y) => y.weight - x.weight);
}

/** 0–100: how badly the business needs a new website. */
export function needScore(issues: Issue[]) {
  return Math.min(100, issues.reduce((s, i) => s + i.weight, 0));
}

/** 0–100: how valuable/active the business looks (reviews, rating, contactability). */
export function qualityScore(lead: Pick<Lead, "reviewsCount" | "rating" | "phone" | "email">) {
  const reviews = lead.reviewsCount ?? 0;
  // 0 reviews → 0, 10 → ~33, 100 → ~67, 1000 → 100
  const reviewPart = Math.min(1, Math.log10(reviews + 1) / 3) * 60;
  const rating = lead.rating ?? 0;
  const ratingPart = rating >= 4.5 ? 25 : rating >= 4 ? 20 : rating >= 3.5 ? 12 : rating > 0 ? 5 : 8;
  const contactPart = (lead.phone ? 8 : 0) + (lead.email ? 7 : 0);
  return Math.round(Math.min(100, reviewPart + ratingPart + contactPart));
}

export function priority(need: number, quality: number) {
  return Math.round(need * 0.6 + quality * 0.4);
}
