import * as cheerio from "cheerio";

export interface HtmlFacts {
  title: string | null;
  metaDescription: string | null;
  hasViewport: boolean;
  hasOpenGraph: boolean;
  hasStructuredData: boolean;
  hasAnalytics: boolean;
  hasFavicon: boolean;
  lang: string | null;
  h1Count: number;
  imagesWithoutAlt: number;
  copyrightYear: number | null;
  technologies: string[];
  emails: string[];
  socials: string[];
  contactLinks: string[];
  usesTableLayout: boolean;
  jqueryVersion: string | null;
}

const TECH_SIGNATURES: [string, RegExp][] = [
  ["WordPress", /\/wp-content\/|\/wp-includes\//i],
  ["WooCommerce", /woocommerce/i],
  ["Elementor", /elementor/i],
  ["Divi", /et_pb_|divi/i],
  ["Wix", /static\.wixstatic\.com|wix\.com|_wixCIDX/i],
  ["Webnode", /webnode\./i],
  ["Estránky", /estranky\.cz/i],
  ["Webareal", /webareal/i],
  ["Shoptet", /shoptet/i],
  ["Upgates", /upgates/i],
  ["Squarespace", /squarespace/i],
  ["Shopify", /cdn\.shopify\.com/i],
  ["Joomla", /\/media\/jui\/|joomla/i],
  ["Drupal", /drupal/i],
  ["PrestaShop", /prestashop/i],
  ["Next.js", /\/_next\/static|__NEXT_DATA__/],
  ["Nuxt", /\/_nuxt\/|__NUXT__/],
  ["Gatsby", /___gatsby/],
  ["Angular", /ng-version=/],
  ["Bootstrap", /bootstrap(\.min)?\.(css|js)/i],
  ["Tailwind", /tailwind/i],
  ["Flash", /\.swf|application\/x-shockwave-flash/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm/i],
  ["Google Analytics", /google-analytics\.com|gtag\/js/i],
  ["Meta Pixel", /connect\.facebook\.net\/.+fbevents/i],
];

const SITE_BUILDERS = ["Wix", "Webnode", "Estránky", "Webareal", "Squarespace"];
export const isSiteBuilder = (tech: string[]) => tech.some((t) => SITE_BUILDERS.includes(t));

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,15}/gi;
const IGNORED_EMAIL =
  /(sentry|wixpress|example\.|domain\.|domena\.|vas@email\.cz|^email@email\.cz$|^mail@|\.png$|\.jpg$|\.jpeg$|\.webp$|\.svg$|\.gif$|\.css$|\.js$|@2x)/i;

export function sanitizeEmail(raw: string): string | null {
  let e = raw
    .trim()
    .toLowerCase()
    .replace(/^[.,;:!?)(\]"'\s]+|[.,;:!?)(\]"'\s/]+$/g, "");
  // Strip leading phone number digits glued to common Czech inbox names
  e = e.replace(
    /^\d{2,}(info|kontakt|office|obchod|prodejna|recepce|ordinace|studio|podpora|poptavky|servis|objednavky|sekretariat|rezervace)@/i,
    "$1@"
  );
  // Strip trailing text glued to .cz / .sk / .eu (no valid TLD starts with .cz/.sk/.eu followed by letters)
  e = e.replace(/\.(cz|sk|eu)[a-z]+$/i, ".$1");
  // Strip trailing Czech words glued to .com (except .company / .community)
  if (/\.com[a-z]+$/i.test(e) && !/\.(company|community)$/i.test(e)) {
    e = e.replace(/\.com[a-z]+$/i, ".com");
  }
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,15}$/i.test(e)) return null;
  if (IGNORED_EMAIL.test(e) || e.length >= 80 || e.length < 6) return null;
  const domain = e.split("@")[1];
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
  return e;
}

export function extractEmails(html: string, $?: cheerio.CheerioAPI): string[] {
  const found = new Set<string>();
  const q = $ ?? cheerio.load(html);
  q('a[href^="mailto:"]').each((_, el) => {
    const v = (q(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0].trim();
    if (v) {
      try {
        const clean = sanitizeEmail(decodeURIComponent(v));
        if (clean) found.add(clean);
      } catch {
        const clean = sanitizeEmail(v);
        if (clean) found.add(clean);
      }
    }
  });
  // Replace HTML tags with spaces so adjacent elements never concatenate into the email
  const spacedText = html.slice(0, 400_000).replace(/<[^>]+>/g, " ");
  for (const m of spacedText.match(EMAIL_RE) ?? []) {
    const clean = sanitizeEmail(m);
    if (clean) found.add(clean);
  }
  return [...found].slice(0, 5);
}

export function parseHtml(html: string, baseUrl: string): HtmlFacts {
  const $ = cheerio.load(html);
  const lower = html.toLowerCase();

  const technologies = TECH_SIGNATURES.filter(([, re]) => re.test(html)).map(([n]) => n);
  const generator = $('meta[name="generator"]').attr("content");
  if (generator) {
    const g = generator.split(/[\s;]/)[0];
    if (g && !technologies.some((t) => t.toLowerCase() === g.toLowerCase())) technologies.push(g);
  }

  const jq = html.match(/jquery[.-]?(\d+\.\d+(\.\d+)?)(\.min)?\.js/i);
  const jqueryVersion = jq ? jq[1] : null;
  if (jqueryVersion || /jquery/i.test(html)) technologies.push("jQuery");

  // Copyright year: take the max year that appears near ©/copyright
  let copyrightYear: number | null = null;
  const text = $("footer").text() + " " + $("body").text().slice(-5000);
  const cy = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)];
  for (const m of cy) {
    const y = parseInt(m[1], 10);
    if (y > 1995 && y <= new Date().getFullYear() + 1) copyrightYear = Math.max(copyrightYear ?? 0, y);
  }

  const socials = new Set<string>();
  const contactLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (/facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com/i.test(href)) {
      socials.add(href.split("?")[0]);
    }
    const label = ($(el).text() + " " + href).toLowerCase();
    if (/kontakt|contact/.test(label) && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      try {
        const u = new URL(href, baseUrl);
        if (u.hostname === new URL(baseUrl).hostname) contactLinks.add(u.toString());
      } catch {
        /* ignore */
      }
    }
  });

  const tables = $("table").length;
  const usesTableLayout = tables > 3 && $("table table").length > 0;

  return {
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    hasViewport: $('meta[name="viewport"]').length > 0,
    hasOpenGraph: $('meta[property^="og:"]').length > 0,
    hasStructuredData: $('script[type="application/ld+json"]').length > 0 || /itemtype=/.test(lower),
    hasAnalytics: technologies.some((t) => ["Google Tag Manager", "Google Analytics", "Meta Pixel"].includes(t)),
    hasFavicon: $('link[rel*="icon"]').length > 0,
    lang: $("html").attr("lang") ?? null,
    h1Count: $("h1").length,
    imagesWithoutAlt: $("img").filter((_, el) => !$(el).attr("alt")).length,
    copyrightYear,
    technologies: [...new Set(technologies)],
    emails: extractEmails(html, $),
    socials: [...socials].slice(0, 6),
    contactLinks: [...contactLinks].slice(0, 2),
    usesTableLayout,
    jqueryVersion,
  };
}
