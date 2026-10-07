export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function auditSlugFor(name: string) {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${slugify(name) || "firma"}-${rand}`;
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
