import type { Metadata } from "next";
import { config } from "@/lib/config";
import {
  getCampaignConfig,
  getCampaignRuns,
  getSentTodayCount,
  checkWorkingHours,
} from "@/lib/campaign";
import { CampaignClient } from "./CampaignClient";

export const metadata: Metadata = {
  title: "Autopilot Kampaň (Úroveň 2)",
  description: "Plně autonomní získávání klientů na pozadí",
};

export const dynamic = "force-dynamic";

export default async function CampaignPage() {
  const [campaignConfig, sentToday, runs] = await Promise.all([
    getCampaignConfig(),
    getSentTodayCount(),
    getCampaignRuns(20),
  ]);

  const hoursInfo = checkWorkingHours();

  const placesReady = Boolean(config.googlePlacesKey);
  const emailReady = Boolean(config.smtpUser && config.smtpPass);

  const baseUrl = config.auditBaseUrl || "https://web.technologio.eu";

  return (
    <CampaignClient
      initialConfig={campaignConfig}
      initialSentToday={sentToday}
      initialRuns={runs}
      hoursInfo={hoursInfo}
      placesReady={placesReady}
      emailReady={emailReady}
      cronSecret={config.cronSecret}
      baseUrl={baseUrl}
    />
  );
}
