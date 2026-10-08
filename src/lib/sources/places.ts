import "server-only";
import { config } from "../config";
import type { NewLead } from "../types";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");

interface PlacesResponse {
  places?: {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    addressComponents?: { longText: string; types?: string[] }[];
    websiteUri?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    primaryTypeDisplayName?: { text: string };
    businessStatus?: string;
  }[];
  nextPageToken?: string;
  error?: { message: string };
}

/** Websites that are not the company's own site (social profiles, directories). */
const NOT_A_WEBSITE = /(facebook\.com|instagram\.com|firmy\.cz|google\.com|business\.site|linktr\.ee|wa\.me|booksy\.com|reservio|youtube\.com|tiktok\.com|linkedin\.com)/i;

/**
 * Google Places API (New) – Text Search. One request = up to 20 results.
 * `pages` controls how many pages (max 3 → 60 results) to fetch.
 */
export async function searchPlaces(
  query: string,
  location: string,
  pages = 1,
): Promise<Omit<NewLead, "searchId">[]> {
  if (!config.googlePlacesKey) {
    throw new Error("Chybí GOOGLE_PLACES_API_KEY – nastav ho v .env.local (viz README).");
  }
  const textQuery = [query, location].filter(Boolean).join(" ");
  const results: Omit<NewLead, "searchId">[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < Math.min(pages, 3); page++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googlePlacesKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "cs",
        regionCode: "CZ",
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
      cache: "no-store",
    });
    const data = (await res.json()) as PlacesResponse;
    if (!res.ok) throw new Error(`Google Places: ${data.error?.message ?? res.statusText}`);

    for (const p of data.places ?? []) {
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      const city =
        p.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ??
        p.addressComponents?.find((c) => c.types?.includes("administrative_area_level_2"))?.longText ??
        p.addressComponents?.find((c) => c.types?.includes("postal_town"))?.longText ??
        null;
      const website = p.websiteUri && !NOT_A_WEBSITE.test(p.websiteUri) ? p.websiteUri : null;
      results.push({
        placeId: p.id,
        source: "google_places",
        name: p.displayName?.text ?? "Bez názvu",
        address: p.formattedAddress ?? null,
        city,
        phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
        website,
        googleMapsUrl: p.googleMapsUri ?? null,
        category: p.primaryTypeDisplayName?.text ?? null,
        rating: p.rating ?? null,
        reviewsCount: p.userRatingCount ?? null,
        businessStatus: p.businessStatus ?? null,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return results;
}
