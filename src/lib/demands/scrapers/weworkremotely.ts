import "server-only";
import type { RawScrapedDemand } from "./webtrh";

export async function scrapeWeWorkRemotelyDemands(): Promise<RawScrapedDemand[]> {
  const feeds = [
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  ];
  const results: RawScrapedDemand[] = [];
  const seen = new Set<string>();

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });

      if (!res.ok) continue;
      const text = await res.text();
      const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

      for (const it of items) {
        const titleMatch = it[1].match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = it[1].match(/<link>([\s\S]*?)<\/link>/);
        const descMatch = it[1].match(/<description>([\s\S]*?)<\/description>/);
        const pubMatch = it[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/);

        const link = linkMatch ? linkMatch[1].trim() : "";
        if (!link || seen.has(link)) continue;
        seen.add(link);

        const title = titleMatch
          ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim()
          : "";

        const desc = descMatch
          ? descMatch[1]
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300)
          : "";

        const slug = link.split("/").filter(Boolean).pop() || `${Date.now()}`;

        results.push({
          source: "weworkremotely",
          externalId: `wwr-${slug}`,
          title: title.slice(0, 120),
          description: `${desc} (Zadáno na WeWorkRemotely).`,
          url: link,
          category: "Vývoj webu / IT",
          publishedAt: pubMatch
            ? new Date(pubMatch[1]).toISOString()
            : new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("[WeWorkRemotely Scraper] Chyba při stahování:", (err as Error).message);
    }
  }

  return results.slice(0, 20);
}
