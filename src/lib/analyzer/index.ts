import type { Lead, WebsiteAnalysis } from "../types";
import { extractEmails, parseHtml } from "./html";
import { runPageSpeed } from "./pagespeed";
import { buildIssues, needScore, priority, qualityScore } from "./score";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchPage(url: string, timeoutMs = 15_000) {
  const start = Date.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "cs,en;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const responseTimeMs = Date.now() - start;
  const html = (await res.text()).slice(0, 1_500_000);
  return { res, html, responseTimeMs };
}

export interface AnalyzeOptions {
  pageSpeed?: boolean;
  pageSpeedKey?: string;
}

export interface AnalyzeResult {
  analysis: WebsiteAnalysis;
  screenshot: string | null;
  email: string | null;
  needScore: number;
  qualityScore: number;
  priority: number;
}

export async function analyzeLead(
  lead: Pick<Lead, "website" | "reviewsCount" | "rating" | "phone" | "email">,
  opts: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const url = lead.website ? normalizeUrl(lead.website) : null;
  const base: Omit<WebsiteAnalysis, "issues"> = {
    analyzedAt: new Date().toISOString(),
    hasWebsite: !!url,
    url,
    finalUrl: null,
    reachable: false,
    httpStatus: null,
    https: false,
    responseTimeMs: null,
    title: null,
    metaDescription: null,
    hasViewport: false,
    hasOpenGraph: false,
    hasStructuredData: false,
    hasAnalytics: false,
    hasFavicon: false,
    lang: null,
    h1Count: 0,
    imagesWithoutAlt: 0,
    copyrightYear: null,
    technologies: [],
    emails: [],
    socials: [],
    pageSpeed: null,
  };

  let screenshot: string | null = null;
  let extra: { usesTableLayout?: boolean; jqueryVersion?: string | null } = {};

  if (url) {
    try {
      // Kick off PageSpeed in parallel – it's the slow part (10–40 s).
      const psiPromise = opts.pageSpeed !== false ? runPageSpeed(url, opts.pageSpeedKey) : null;

      const { res, html, responseTimeMs } = await fetchPage(url);
      const finalUrl = res.url || url;
      base.finalUrl = finalUrl;
      base.httpStatus = res.status;
      base.reachable = res.ok;
      base.https = finalUrl.startsWith("https://");
      base.responseTimeMs = responseTimeMs;

      if (res.ok) {
        const f = parseHtml(html, finalUrl);
        Object.assign(base, {
          title: f.title,
          metaDescription: f.metaDescription,
          hasViewport: f.hasViewport,
          hasOpenGraph: f.hasOpenGraph,
          hasStructuredData: f.hasStructuredData,
          hasAnalytics: f.hasAnalytics,
          hasFavicon: f.hasFavicon,
          lang: f.lang,
          h1Count: f.h1Count,
          imagesWithoutAlt: f.imagesWithoutAlt,
          copyrightYear: f.copyrightYear,
          technologies: f.technologies,
          emails: f.emails,
          socials: f.socials,
        });
        extra = { usesTableLayout: f.usesTableLayout, jqueryVersion: f.jqueryVersion };

        // No e-mail on homepage → try the contact page.
        if (f.emails.length === 0 && f.contactLinks[0]) {
          try {
            const c = await fetchPage(f.contactLinks[0], 8_000);
            if (c.res.ok) base.emails = extractEmails(c.html);
          } catch {
            /* ignore */
          }
        }
      }

      if (psiPromise) {
        const psi = await psiPromise;
        base.pageSpeed = psi.result;
        screenshot = psi.screenshot;
      }
    } catch (e) {
      base.error = (e as Error).message;
      base.reachable = false;
    }
  }

  const issues = buildIssues({ ...base, ...extra });
  const analysis: WebsiteAnalysis = { ...base, issues };
  const email = lead.email ?? base.emails[0] ?? null;
  const need = needScore(issues);
  const quality = qualityScore({ ...lead, email });
  return { analysis, screenshot, email, needScore: need, qualityScore: quality, priority: priority(need, quality) };
}
