import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { config } from "@/lib/config";
import { runAutonomousCampaign } from "@/lib/campaign";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const force = url.searchParams.get("force") === "1";
  const limitOverride = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;

  const authHeader = request.headers.get("authorization");
  const expectedSecret = config.cronSecret;

  // 1. Cron secret check (Bearer token from Vercel or ?key= query param)
  const isCronAuthorized =
    Boolean(expectedSecret) &&
    (authHeader === `Bearer ${expectedSecret}` || key === expectedSecret);

  // 2. Admin session check (when triggered from the admin UI)
  const cookieJar = await cookies();
  const sessionToken = cookieJar.get(SESSION_COOKIE)?.value;
  const isOwner = await verifySessionToken(sessionToken);

  // 3. Vercel Cron caller check (Vercel automatically sets User-Agent: vercel-cron/1.0)
  const userAgent = request.headers.get("user-agent") || "";
  const isVercelCron = userAgent.includes("vercel-cron");

  // If no CRON_SECRET is set yet, allow in dev, if owner logged in, or if called by Vercel Cron
  const isAllowed =
    isCronAuthorized ||
    isOwner ||
    (!expectedSecret && (process.env.NODE_ENV !== "production" || isVercelCron));

  if (!isAllowed) {
    return NextResponse.json(
      { error: "Neautorizovaný přístup. Nastav CRON_SECRET nebo se přihlas." },
      { status: 401 }
    );
  }

  try {
    const result = await runAutonomousCampaign({
      force,
      trigger: isOwner ? "manual" : "cron",
      limitOverride,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
