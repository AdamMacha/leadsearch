export function slugify(s: string) {
  const cleaned = s
    .replace(/[,.]?\s*(s\.?\s*r\.?\s*o\.?|spol\.?\s*s\s*r\.?\s*o\.?|a\.?\s*s\.?|v\.?\s*o\.?\s*s\.?|z\.?\s*s\.?)\s*$/i, "")
    .trim();

  return (cleaned || s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45);
}

export function auditSlugFor(name: string, city?: string | null) {
  const baseName = slugify(name);
  const baseCity = city ? slugify(city) : "";
  if (baseCity && !baseName.includes(baseCity)) {
    return `${baseName}-${baseCity}`.slice(0, 50);
  }
  return (baseName || "firma").slice(0, 50);
}

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function scoreTone(v: number | null | undefined, invert = false) {
  if (v == null) return "muted";
  const x = invert ? 100 - v : v;
  return x >= 70 ? "good" : x >= 45 ? "warn" : "bad";
}

export function hostname(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(/^https?:/.test(url) ? url : `http://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
