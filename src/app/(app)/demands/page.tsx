import type { Metadata } from "next";
import { getDemandTrackerConfig, listDemands } from "@/lib/demands/service";
import { DemandsClient } from "./DemandsClient";

export const metadata: Metadata = {
  title: "Hlídač poptávek | LeadRadar",
  description: "Monitoring poptávkových portálů s AI vyhodnocením shody a návrhy nabídek",
};

export const dynamic = "force-dynamic";

export default async function DemandsPage() {
  const [demands, config] = await Promise.all([
    listDemands(),
    getDemandTrackerConfig(),
  ]);

  return (
    <DemandsClient
      initialDemands={demands}
      initialConfig={config}
    />
  );
}
