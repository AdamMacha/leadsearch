import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  getCampaignConfig,
  saveCampaignConfig,
  getSentTodayCount,
  getCampaignRuns,
  checkWorkingHours,
} from "@/lib/campaign";

export async function GET() {
  const cookieJar = await cookies();
  const sessionToken = cookieJar.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(sessionToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [campaignConfig, sentToday, runs] = await Promise.all([
    getCampaignConfig(),
    getSentTodayCount(),
    getCampaignRuns(15),
  ]);

  const hours = checkWorkingHours();

  return NextResponse.json({
    config: campaignConfig,
    sentToday,
    runs,
    hours,
  });
}

export async function POST(request: Request) {
  const cookieJar = await cookies();
  const sessionToken = cookieJar.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(sessionToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const updated = await saveCampaignConfig(body);

  return NextResponse.json({ ok: true, config: updated });
}
