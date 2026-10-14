import "server-only";
import type { RawScrapedDemand } from "./webtrh";

export async function scrapeFreelancerDemands(): Promise<RawScrapedDemand[]> {
  const query = "website";
  const url = `https://www.freelancer.com/api/projects/0.1/projects/active?query=${encodeURIComponent(query)}&compact=true&limit=15`;
  const results: RawScrapedDemand[] = [];

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    if (!res.ok) return results;
    const data = await res.json();
    const rawProjects = data.result?.projects || [];

    for (const p of rawProjects) {
      const min = p.budget?.minimum;
      const max = p.budget?.maximum;
      const curr = p.currency?.code || "USD";
      const budgetStr =
        min && max
          ? `${min} – ${max} ${curr}`
          : min
          ? `od ${min} ${curr}`
          : null;

      results.push({
        source: "freelancer",
        externalId: `fl-${p.id}`,
        title: p.title,
        description: `${p.preview_description || "Zakázka na tvorbu webu"} (Rozpočet: ${budgetStr || "dohodou"}).`,
        url: p.seo_url ? `https://www.freelancer.com/projects/${p.seo_url}` : `https://www.freelancer.com/projects/${p.id}`,
        category: "Tvorba webů a e-shopů",
        budget: budgetStr || undefined,
        publishedAt: new Date(
          (p.time_submitted || Date.now() / 1000) * 1000
        ).toISOString(),
      });
    }
  } catch (err) {
    console.warn("[Freelancer Scraper] Chyba při stahování:", (err as Error).message);
  }

  return results;
}
