import "server-only";
import type { DemandTrackerConfig } from "../types";
import { type RawScrapedDemand, scrapeWebtrhDemands } from "./webtrh";
import { scrapeStartupJobsDemands } from "./startupjobs";

export async function fetchActiveDemands(
  config: DemandTrackerConfig
): Promise<RawScrapedDemand[]> {
  const tasks: Promise<RawScrapedDemand[]>[] = [];

  if (config.sources.webtrh) {
    tasks.push(scrapeWebtrhDemands());
  }

  if (config.sources.startupjobs) {
    tasks.push(scrapeStartupJobsDemands());
  }

  const results = await Promise.allSettled(tasks);
  const combined: RawScrapedDemand[] = [];

  for (const res of results) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      combined.push(...res.value);
    }
  }

  return combined;
}
