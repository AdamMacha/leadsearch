import "server-only";
import { auditUrl, config } from "../config";
import type { AuditContent, Lead, OutreachContent } from "../types";
import { DEFAULT_AI_MODEL } from "./models";

async function callGeminiApi<T>(prompt: string, model: string): Promise<T> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
  if (!res.ok) {
    const rawMsg = data?.error?.message ?? res.statusText;
    const isRateLimit = res.status === 429 || /quota|exhausted|rate limit/i.test(rawMsg);
    const err = new Error(
      isRateLimit
        ? `Limit dotazů pro model ${model} byl vyčerpán (429 Rate Limit / Quota). Přepni na jiný model (např. gemini-3.5-flash-lite).`
        : `Gemini (${model}): ${rawMsg}`
    );
    (err as unknown as { status?: number; isRateLimit?: boolean }).status = res.status;
    (err as unknown as { status?: number; isRateLimit?: boolean }).isRateLimit = isRateLimit;
    throw err;
  }
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini (${model}) vrátil prázdnou odpověď`);
  return JSON.parse(text.replace(/^```json\s*|```$/g, "")) as T;
}

export async function testAiModel(model: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (!config.geminiKey) return { ok: false, latencyMs: 0, error: "Chybí GEMINI_API_KEY" };
  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Odpověz pouze: OK" }] }],
        }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );
    const data = await res.json();
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const rawMsg = data?.error?.message ?? res.statusText;
      const isRateLimit = res.status === 429 || /quota|exhausted|rate limit/i.test(rawMsg);
      return {
        ok: false,
        latencyMs,
        error: isRateLimit
          ? `Limit dotazů pro model ${model} je vyčerpán (429 Rate Limit). Zvol jiný model.`
          : `Chyba ${res.status}: ${rawMsg}`,
      };
    }
    return { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

async function gemini<T>(prompt: string, requestedModel?: string): Promise<{ data: T; modelUsed: string }> {
  const preferred = requestedModel?.trim() || config.geminiModel || DEFAULT_AI_MODEL;
  const candidates = [preferred];
  if (preferred !== "gemini-3.5-flash-lite") candidates.push("gemini-3.5-flash-lite");
  if (preferred !== "gemini-3.5-flash") candidates.push("gemini-3.5-flash");

  let lastError: Error | null = null;
  for (const model of candidates) {
    try {
      const data = await callGeminiApi<T>(prompt, model);
      const modelUsed = model === preferred ? model : `${model} (fallback z ${preferred})`;
      return { data, modelUsed };
    } catch (err: unknown) {
      lastError = err as Error;
      const isRateLimit = (err as { isRateLimit?: boolean })?.isRateLimit;
      if (isRateLimit && candidates.length > 1) {
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Gemini volání selhalo");
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

const SENDER = () => {
  const phone = config.sender.phone
    ? config.sender.phone.replace(/^(\+?\d{3})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4")
    : "";
  return `${config.sender.name}\n${config.sender.company} (${config.sender.web})` +
    (phone ? `\ntel. ${phone}` : "") +
    (config.sender.email ? `\n${config.sender.email}` : "");
};

export async function generateAudit(lead: Lead, modelOverride?: string): Promise<AuditContent> {
  if (!config.geminiKey) return templateAudit(lead);
  const defaultHeadline = lead.website
    ? `Jak z webu získat více zákazníků pro ${lead.name}`
    : `Návrh nového webu pro ${lead.name}`;
  const { data: out, modelUsed } = await gemini<Omit<AuditContent, "generatedAt" | "model">>(`
Jsi zkušený webový konzultant. Napiš stručný, lidský a konkrétní rozbor webu pro majitele firmy v češtině.
Nepoužívej technický žargon, mluv o dopadu na zákazníky a tržby. Žádné přehánění ani vymyšlená čísla.
Tykání ne – vykej. Délka summary max 3 věty.
Pravidla pro titulek ("headline"):
- Vždy použij přesně: "${defaultHeadline}". Nikdy nepoužívej slovo "audit", neskloňuj název firmy a nepřidávej města.

Data o firmě:
${leadContext(lead)}

Vrať JSON:
{
  "headline": "${defaultHeadline}",
  "summary": "shrnutí stavu webu a hlavní příležitosti (max 3 věty)",
  "recommendations": [{"title": "...", "description": "1–2 věty"}],   // 3–5 doporučení seřazených podle dopadu
  "benefits": ["přínos 1", "přínos 2", "přínos 3"]                       // co firma získá novým webem
}`, modelOverride);
  const cleanHeadline = out.headline && !/audit/i.test(out.headline) ? out.headline : defaultHeadline;
  return { ...out, headline: cleanHeadline, generatedAt: new Date().toISOString(), model: modelUsed };
}

export async function generateOutreach(lead: Lead, modelOverride?: string): Promise<OutreachContent> {
  if (!config.geminiKey) return templateOutreach(lead);
  const link = lead.auditSlug ? auditUrl(lead.auditSlug) : null;
  const { data: out, modelUsed } = await gemini<Omit<OutreachContent, "generatedAt" | "model">>(`
Jsi zkušený webový vývojář a píšeš osobní (ne hromadný) první kontakt konkrétní firmě v češtině.
Pravidla:
- Krátce, věcně, přátelsky, vykat. E-mail max 120 slov.
- Zmiň 1–2 nejdůležitější konkrétní zjištění o JEJICH webu (nebo že web nemají).
- Žádné klišé typu "doufám, že se máte dobře", žádný nátlak, žádné vymyšlené statistiky.
${link ? `- Do e-mailu přirozeně vlož odkaz na připravený rozbor / ukázku webu: ${link} (např. "Připravil jsem pro vás krátký rozbor s konkrétními tipy: ${link}" nebo "Sepsal jsem k tomu rychlé shrnutí: ${link}")` : ""}
- Výzva k akci (přirozená, vstřícná a přátelská):
  Zeptej se např.: "Dávalo by vám smysl se na to na 10–15 minut nezávazně podívat? Rád vám ukážu konkrétní nápady na vylepšení a co by to vaší firmě přineslo."
  (Nikdy nepoužívej negativní, mentorské nebo úřední formulace jako "možnosti nápravy", "napravit chyby" apod.).
- Závěrečná věta (zdvořilý a respektující opt-out):
  Napiš přesně nebo ve stylu: "Pokud pro vás nový web teď není téma, stačí dát krátce vědět – plně to respektuji a nebudu vás dál rušit."
  (Nikdy nepiš drsné nebo neomalené formulace jako "už se neozvu").
- Podpis:
${SENDER()}

Data o firmě:
${leadContext(lead)}

Vrať JSON:
{
  "subject": "předmět e-mailu (max 7 slov, bez clickbaitu)",
  "email": "text e-mailu včetně oslovení a podpisu",
  "callScript": "scénář na telefonát – úvod, 2–3 body, otázka na závěr (odrážky)",
  "linkedin": "krátká zpráva na LinkedIn (max 300 znaků)"
}`, modelOverride);
  return { ...out, generatedAt: new Date().toISOString(), model: modelUsed };
}

/* ---------- Fallback templates (no AI key) ---------- */

function templateAudit(lead: Lead): AuditContent {
  const issues = lead.analysis?.issues ?? [];
  const noWeb = !lead.website;
  return {
    headline: noWeb
      ? `Návrh nového webu pro ${lead.name}`
      : `Jak z webu získat více zákazníků pro ${lead.name}`,
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
${link ? `\nPřipravil jsem pro vás stručný nezávazný rozbor s konkrétními tipy:\n${link}\n` : ""}
Dávalo by vám smysl se na to na 10–15 minut nezávazně podívat? Rád vám ukážu konkrétní nápady na vylepšení a co by to vaší firmě přineslo.

Pokud pro vás nový web teď není téma, stačí dát krátce vědět – plně to respektuji a nebudu vás dál rušit.

S pozdravem,
${SENDER()}`;
  return {
    subject: lead.website ? `Pár postřehů k webu ${lead.name}` : `Web pro ${lead.name}?`,
    email,
    callScript: `• Dobrý den, tady ${config.sender.name} z ${config.sender.company}, dělám weby pro firmy v okolí.
• ${finding[0].toUpperCase() + finding.slice(1)}.
• Připravil jsem k tomu krátký rozbor – můžu vám poslat odkaz e-mailem?
• Otázka: Kolik poptávek vám teď chodí přes internet?`,
    linkedin: `Dobrý den, ${finding}. Připravil jsem k tomu krátký rozbor s konkrétními tipy${link ? ` (${link})` : ""} – pokud by vás zajímal, rád ho pošlu nebo proberu.`,
    generatedAt: new Date().toISOString(),
    model: "template",
  };
}
