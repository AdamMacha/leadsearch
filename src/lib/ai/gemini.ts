import "server-only";
import { auditUrl, config } from "../config";
import type { AuditContent, Lead, OutreachContent } from "../types";

async function gemini<T>(prompt: string): Promise<T> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiKey! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini: ${data?.error?.message ?? res.statusText}`);
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini vrátil prázdnou odpověď");
  return JSON.parse(text.replace(/^```json\s*|```$/g, "")) as T;
}

function leadContext(lead: Lead) {
  const a = lead.analysis;
  return JSON.stringify(
    {
      firma: lead.name,
      obor: lead.category,
      mesto: lead.city,
      hodnoceni_google: lead.rating,
      pocet_recenzi: lead.reviewsCount,
      web: lead.website ?? "nemá web",
      problemy: a?.issues.map((i) => `${i.title} – ${i.description}`) ?? [],
      pagespeed_mobil: a?.pageSpeed
        ? { vykon: a.pageSpeed.performance, seo: a.pageSpeed.seo, pristupnost: a.pageSpeed.accessibility }
        : null,
      technologie: a?.technologies ?? [],
    },
    null,
    2,
  );
}

const SENDER = () =>
  `${config.sender.name}, ${config.sender.company} (${config.sender.web})` +
  (config.sender.phone ? `, tel. ${config.sender.phone}` : "") +
  (config.sender.email ? `, ${config.sender.email}` : "");

export async function generateAudit(lead: Lead): Promise<AuditContent> {
  if (!config.geminiKey) return templateAudit(lead);
  const out = await gemini<Omit<AuditContent, "generatedAt" | "model">>(`
Jsi zkušený webový konzultant. Napiš stručný, lidský a konkrétní audit webu pro majitele firmy v češtině.
Nepoužívej technický žargon, mluv o dopadu na zákazníky a tržby. Žádné přehánění ani vymyšlená čísla.
Tykání ne – vykej. Délka summary max 3 věty.

Data o firmě:
${leadContext(lead)}

Vrať JSON:
{
  "headline": "krátký titulek auditu (max 8 slov)",
  "summary": "shrnutí stavu webu a hlavní příležitosti",
  "recommendations": [{"title": "...", "description": "1–2 věty"}],   // 3–5 doporučení seřazených podle dopadu
  "benefits": ["přínos 1", "přínos 2", "přínos 3"]                       // co firma získá novým webem
}`);
  return { ...out, generatedAt: new Date().toISOString(), model: config.geminiModel };
}

export async function generateOutreach(lead: Lead): Promise<OutreachContent> {
  if (!config.geminiKey) return templateOutreach(lead);
  const link = lead.auditSlug ? auditUrl(lead.auditSlug) : null;
  const out = await gemini<Omit<OutreachContent, "generatedAt" | "model">>(`
Jsi freelance webový vývojář a píšeš osobní (ne hromadný) první kontakt konkrétní firmě v češtině.
Pravidla:
- Krátce, věcně, přátelsky, vykat. E-mail max 120 slov.
- Zmiň 1–2 nejdůležitější konkrétní zjištění o JEJICH webu (nebo že web nemají).
- Žádné fráze typu "doufám, že se máte dobře", žádný nátlak, žádné vymyšlené statistiky.
- Výzva k akci: krátký nezávazný hovor (15 min).
${link ? `- Do e-mailu vlož odkaz na připravený audit: ${link}` : ""}
- Na konec přidej větu, že pokud nemají zájem, stačí odepsat a už se neozveš.
- Podpis: ${SENDER()}

Data o firmě:
${leadContext(lead)}

Vrať JSON:
{
  "subject": "předmět e-mailu (max 7 slov, bez clickbaitu)",
  "email": "text e-mailu včetně oslovení a podpisu",
  "callScript": "scénář na telefonát – úvod, 2–3 body, otázka na závěr (odrážky)",
  "linkedin": "krátká zpráva na LinkedIn (max 300 znaků)"
}`);
  return { ...out, generatedAt: new Date().toISOString(), model: config.geminiModel };
}

/* ---------- Fallback templates (no AI key) ---------- */

function templateAudit(lead: Lead): AuditContent {
  const issues = lead.analysis?.issues ?? [];
  const noWeb = !lead.website;
  return {
    headline: noWeb ? `${lead.name}: čas na vlastní web` : `Audit webu ${lead.name}`,
    summary: noWeb
      ? `Firma ${lead.name} má na Googlu ${lead.reviewsCount ?? 0} recenzí, ale žádný vlastní web. Zákazníci, kteří vás hledají, tak nemají kde zjistit víc ani poslat poptávku.`
      : `Prošli jsme web ${lead.website} a našli ${issues.length} oblastí ke zlepšení. Nejdůležitější: ${issues
          .slice(0, 2)
          .map((i) => i.title.toLowerCase())
          .join(" a ")}.`,
    recommendations: issues.slice(0, 5).map((i) => ({ title: i.title, description: i.description })),
    benefits: [
      "Více poptávek z Googlu i z mobilů",
      "Profesionální dojem, který odpovídá kvalitě vašich služeb",
      "Web, který si snadno upravíte a který roste s firmou",
    ],
    generatedAt: new Date().toISOString(),
    model: "template",
  };
}

function templateOutreach(lead: Lead): OutreachContent {
  const top = lead.analysis?.issues.slice(0, 2).map((i) => i.title.toLowerCase()) ?? [];
  const link = lead.auditSlug ? auditUrl(lead.auditSlug) : null;
  const finding = !lead.website
    ? `všiml jsem si, že ${lead.name} má na Google Mapách ${lead.reviewsCount ?? "řadu"} recenzí, ale nemá vlastní web`
    : `prošel jsem váš web ${lead.website} a všiml si, že ${top.join(" a ") || "má prostor ke zlepšení"}`;
  const email = `Dobrý den,

${finding}. To vás může stát část zákazníků, kteří vás hledají na mobilu nebo na Googlu.
${link ? `\nPřipravil jsem pro vás krátký nezávazný audit: ${link}\n` : ""}
Tvořím moderní weby na míru pro firmy jako ta vaše. Měli byste chuť na krátký 15minutový hovor, kde vám ukážu, co by se dalo zlepšit?

Pokud nemáte zájem, stačí odepsat a už se neozvu.

S pozdravem
${SENDER()}`;
  return {
    subject: lead.website ? `Pár postřehů k webu ${lead.name}` : `Web pro ${lead.name}?`,
    email,
    callScript: `• Dobrý den, tady ${config.sender.name} z ${config.sender.company}, dělám weby pro firmy v okolí.
• ${finding[0].toUpperCase() + finding.slice(1)}.
• Připravil jsem krátký audit – můžu vám ho poslat e-mailem?
• Otázka: Kolik poptávek vám teď chodí přes internet?`,
    linkedin: `Dobrý den, ${finding}. Připravil jsem krátký audit${link ? ` (${link})` : ""} – pokud by vás zajímal, rád ho proberu.`,
    generatedAt: new Date().toISOString(),
    model: "template",
  };
}
