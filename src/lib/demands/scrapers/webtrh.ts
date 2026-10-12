import "server-only";

export interface RawScrapedDemand {
  source: "webtrh" | "startupjobs" | "poptavej" | "manual";
  externalId: string;
  title: string;
  description: string;
  url: string;
  category?: string;
  budget?: string;
  publishedAt: string;
}

export async function scrapeWebtrhDemands(): Promise<RawScrapedDemand[]> {
  const urls = [
    "https://webtrh.cz/poptavky/",
    "https://webtrh.cz/poptavky/poptavka-programovani-vyvoj/",
    "https://webtrh.cz/poptavky/poptavka-webdesign-grafika/",
  ];

  const results: RawScrapedDemand[] = [];
  const seenUrls = new Set<string>();

  for (const pageUrl of urls) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "cs,en;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });

      if (!res.ok) continue;
      const html = await res.text();

      // Regular expression matching inquiry cards on Webtrh:
      // <a href="(https://webtrh.cz/poptavka/[^"]+)" ...
      const linkRegex =
        /<a href="(https:\/\/webtrh\.cz\/poptavka\/[^"]+)"[^>]*>[\s\S]*?<div class="title">\s*<span>([^<]+)<\/span>[\s\S]*?<div class="created">\s*([^<]+)\s*<\/div>/g;

      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const itemUrl = match[1].trim();
        const itemTitle = match[2].trim().replace(/\s+/g, " ");
        const timeAgo = match[3].trim();

        if (seenUrls.has(itemUrl)) continue;
        seenUrls.add(itemUrl);

        // Derive clean external ID from URL slug
        const slugMatch = itemUrl.match(/\/poptavka\/([^\/]+)\/?$/);
        const externalId = slugMatch ? slugMatch[1] : itemUrl;

        // Extract category if present
        let category = "Web / IT";
        if (pageUrl.includes("programovani")) category = "Vývoj a programování";
        else if (pageUrl.includes("webdesign")) category = "Webdesign a grafika";

        results.push({
          source: "webtrh",
          externalId: `webtrh-${externalId}`,
          title: itemTitle,
          description: `Poptávka na portálu Webtrh.cz (${category}). Zveřejněno: ${timeAgo}. Klikněte pro otevření detailu zadání na Webtrhu.`,
          url: itemUrl,
          category,
          budget: undefined,
          publishedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[Webtrh Scraper] Chyba při stahování ${pageUrl}:`, (err as Error).message);
    }
  }

  return results;
}
