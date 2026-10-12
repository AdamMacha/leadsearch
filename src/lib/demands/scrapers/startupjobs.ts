import "server-only";
import type { RawScrapedDemand } from "./webtrh";

export async function scrapeStartupJobsDemands(): Promise<RawScrapedDemand[]> {
  const url = "https://www.startupjobs.cz/nabidky?supertag=vyvoj-webu";
  const results: RawScrapedDemand[] = [];

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    if (!res.ok) return results;
    const html = await res.text();

    // Match job offer cards on StartupJobs:
    // href="/nabidka/[id]/[slug]" or similar
    const offerRegex = /href="(\/nabidka\/([^"]+))"[^>]*>([\s\S]*?)<\/a>/g;
    const seen = new Set<string>();

    let match;
    while ((match = offerRegex.exec(html)) !== null) {
      const relPath = match[1];
      const rawTitleHtml = match[3];

      // Extract clear text from inside the card
      const cleanTitle = rawTitleHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanTitle || cleanTitle.length < 5 || seen.has(relPath)) continue;
      seen.add(relPath);

      const offerUrl = `https://www.startupjobs.cz${relPath}`;
      const slug = match[2];

      results.push({
        source: "startupjobs",
        externalId: `sj-${slug}`,
        title: cleanTitle.slice(0, 120),
        description: `Nabídka vývoje na StartupJobs.cz. Pozice / projekt: ${cleanTitle}. Klikněte pro otevření detailu zadání.`,
        url: offerUrl,
        category: "Vývoj webu / IT",
        publishedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[StartupJobs Scraper] Chyba při stahování:", (err as Error).message);
  }

  return results;
}
