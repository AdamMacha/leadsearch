import "server-only";

import type { DemandSource } from "../types";

export interface RawScrapedDemand {
  source: DemandSource;
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
    "https://webtrh.cz/poptavky/strana/2/",
    "https://webtrh.cz/poptavky/strana/3/",
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

        // Extract smart category based on title keywords
        let category = "Web / IT";
        const lowerTitle = itemTitle.toLowerCase();
        if (/web|eshop|e-shop|stránk|bizbox|shoptet|landing|presta/i.test(lowerTitle)) {
          category = "Tvorba webů a e-shopů";
        } else if (/design|ux|ui|grafik|logo|banner/i.test(lowerTitle)) {
          category = "Webdesign a grafika";
        } else if (/program|kód|develop|react|next|php|wordpress|plugin|api|backend|frontend/i.test(lowerTitle)) {
          category = "Vývoj a programování";
        } else if (/marketing|seo|reklam|ads|ppc|facebook|meta|discover/i.test(lowerTitle)) {
          category = "Online marketing & SEO";
        } else if (/foto|kamer|dron|video/i.test(lowerTitle)) {
          category = "Foto a video";
        }

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
