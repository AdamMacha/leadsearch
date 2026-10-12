import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { config } from "@/lib/config";
import { scanAndProcessDemands } from "@/lib/demands/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  const authHeader = request.headers.get("authorization");
  const expectedSecret = config.cronSecret;

  // 1. Cron secret check
  const isCronAuthorized =
    Boolean(expectedSecret) &&
    (authHeader === `Bearer ${expectedSecret}` || key === expectedSecret);

  // 2. Admin session check
  const cookieJar = await cookies();
  const sessionToken = cookieJar.get(SESSION_COOKIE)?.value;
  const isOwner = await verifySessionToken(sessionToken);

  // 3. Vercel Cron user-agent check
  const userAgent = request.headers.get("user-agent") || "";
  const isVercelCron = userAgent.includes("vercel-cron");

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
    const result = await scanAndProcessDemands();
    return NextResponse.json({ ok: true, result });
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
