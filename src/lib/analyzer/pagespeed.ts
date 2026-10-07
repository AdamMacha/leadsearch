import type { PageSpeedResult } from "../types";

interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, { score: number | null }>;
    audits?: Record<string, { numericValue?: number; details?: { data?: string } }>;
  };
  error?: { message: string };
}

const score = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));

/**
 * Google PageSpeed Insights (mobile). Works without a key at low volume;
 * with a key the quota is 25k requests/day for free.
 */
export async function runPageSpeed(
  url: string,
  apiKey?: string,
): Promise<{ result: PageSpeedResult; screenshot: string | null }> {
  const params = new URLSearchParams({ url, strategy: "mobile", locale: "cs" });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) params.append("category", c);
  if (apiKey) params.set("key", apiKey);

  const empty: PageSpeedResult = {
    performance: null,
    seo: null,
    accessibility: null,
    bestPractices: null,
    lcpMs: null,
    cls: null,
    tbtMs: null,
    fcpMs: null,
  };

  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
    const data = (await res.json()) as PsiResponse;
    if (!res.ok || !data.lighthouseResult) {
      return { result: { ...empty, error: data.error?.message ?? `HTTP ${res.status}` }, screenshot: null };
    }
    const c = data.lighthouseResult.categories ?? {};
    const a = data.lighthouseResult.audits ?? {};
    return {
      result: {
        performance: score(c.performance?.score),
        seo: score(c.seo?.score),
        accessibility: score(c.accessibility?.score),
        bestPractices: score(c["best-practices"]?.score),
        lcpMs: a["largest-contentful-paint"]?.numericValue ?? null,
        cls: a["cumulative-layout-shift"]?.numericValue ?? null,
        tbtMs: a["total-blocking-time"]?.numericValue ?? null,
        fcpMs: a["first-contentful-paint"]?.numericValue ?? null,
      },
      screenshot: a["final-screenshot"]?.details?.data ?? null,
    };
  } catch (e) {
    return { result: { ...empty, error: (e as Error).message }, screenshot: null };
  }
}
