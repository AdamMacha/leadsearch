import "server-only";
import { callGeminiApi } from "../ai/gemini";
import type { DemandAnalysis, DemandTrackerConfig } from "./types";

interface GeminiDemandResponse {
  matchScore: number;
  fitLevel: "high" | "medium" | "low";
  matchReason: string;
  keyRequirements: string[];
  estimatedBudget?: string | null;
  suggestedPitch: string;
}

export async function evaluateDemandWithAi(
  title: string,
  description: string,
  config: DemandTrackerConfig
): Promise<DemandAnalysis> {
  const prompt = `Jsi špičkový obchodní a technický poradce pro české webové studio Technologio (Bc. Adam Mácha, web: https://www.technologio.eu).

Profil a specializace studia:
${config.skillsSummary}

Silné stránky a podpis:
${config.senderProfile.strengths}

Zadání poptávky k analýze:
NÁZEV: ${title}
POPIS / ZADÁNÍ:
${description}

Tvým úkolem je:
1. Vyhodnotit SHODU (Match Score 0-100 %):
   - 80-100: Vynikající shoda (poptávka po novém webu, redesignu, e-shopu, webové aplikaci na míru, landing page).
   - 60-79: Dobrá shoda (úprava stávajícího webu, WordPress/WooCommerce, SEO, grafika, konzultace).
   - 30-59: Částečná shoda (obecné IT práce, správa sociálních sítí bez vývoje).
   - 0-29: Nízká shoda (nesouvisející obory: hardware, účetnictví, focení, interní zaměstnání na HPP nesouvisející s weby).
2. Určit úroveň "fitLevel": "high" (>=75), "medium" (50-74), "low" (<50).
3. Stručně v 1-2 větách vysvětlit "matchReason" česky (proč tato poptávka sedí či nesedí k profilu).
4. Vypíchnout 2-4 "keyRequirements" (klíčové požadavky a technologie klienta).
5. Odhadnout "estimatedBudget" (pokud je v textu zmíněn rozpočet nebo hodinová sazba, jinak null).
6. Sestavit "suggestedPitch":
   - Přesvědčivý, úderný a profesionální text nabídky v češtině (vhodný jako e-mail nebo zpráva do poptávkového systému / Facebooku).
   - Reaguj PŘÍMO na konkrétní zadání a potřeby klienta (žádné generické šablony).
   - Zmiň přínos: moderní technologie (Next.js / rychlost), skvělý vizuál, který prodává, spolehlivost a dodržení termínů.
   - Uveď podpis: ${config.senderProfile.name} | ${config.senderProfile.company} (${config.senderProfile.web}).
   - Výzva k akci: nabídka rychlého nezávazného hovoru či zaslání ukázek z portfolia.

Vrať POUZE validní JSON v tomto formátu bez markdown uvozovek:
{
  "matchScore": 85,
  "fitLevel": "high",
  "matchReason": "Klient hledá kompletní nový web s moderním designem a rychlým načítáním, což přesně odpovídá naší specializaci.",
  "keyRequirements": ["Tvorba webu na míru", "Responzivní mobilní design", "Rychlé načítání a SEO"],
  "estimatedBudget": "20 000 - 40 000 Kč",
  "suggestedPitch": "Dobrý den, ..."
}`;

  try {
    const res = await callGeminiApi<GeminiDemandResponse>(prompt);
    return {
      matchScore: Math.max(0, Math.min(100, Number(res.matchScore) || 0)),
      fitLevel: res.fitLevel || (res.matchScore >= 75 ? "high" : res.matchScore >= 50 ? "medium" : "low"),
      matchReason: res.matchReason || "Automaticky vyhodnoceno AI.",
      keyRequirements: Array.isArray(res.keyRequirements) ? res.keyRequirements : [],
      estimatedBudget: res.estimatedBudget || null,
      suggestedPitch: res.suggestedPitch || "",
    };
  } catch (err) {
    console.error("AI Demand evaluation failed:", err);
    // Fallback if AI call errors
    const isWebRelated = /web|eshop|e-shop|stránk|aplikac|redesign|shoptet|wordpress|grafik/i.test(`${title} ${description}`);
    return {
      matchScore: isWebRelated ? 70 : 30,
      fitLevel: isWebRelated ? "medium" : "low",
      matchReason: isWebRelated ? "Obsahuje klíčová slova související s tvorbou webu." : "Nízká pravděpodobnost shody.",
      keyRequirements: [title],
      estimatedBudget: null,
      suggestedPitch: `Dobrý den,\n\nzaujala mě vaše poptávka ohledně: ${title}.\n\nVěnuji se tvorbě moderních, rychlých webových stránek a systémů na míru (${config.senderProfile.web}). Rád bych vám s realizací pomohl.\n\nKdy by se vám hodil krátký nezávazný telefonát, abychom probrali detaily?\n\nS pozdravem,\n${config.senderProfile.name}\n${config.senderProfile.company}`,
    };
  }
}
