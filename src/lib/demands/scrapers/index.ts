import "server-only";
import type { DemandTrackerConfig } from "../types";
import { type RawScrapedDemand, scrapeWebtrhDemands } from "./webtrh";
import { scrapeStartupJobsDemands } from "./startupjobs";
import { scrapeFreelancerDemands } from "./freelancer";
import { scrapeWeWorkRemotelyDemands } from "./weworkremotely";

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

  if (config.sources.freelancer) {
    tasks.push(scrapeFreelancerDemands());
  }

  if (config.sources.weworkremotely) {
    tasks.push(scrapeWeWorkRemotelyDemands());
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
