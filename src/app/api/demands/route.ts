import { NextResponse } from "next/server";
import { listDemands } from "@/lib/demands/service";
import type { DemandStatus } from "@/lib/demands/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") as DemandStatus) || undefined;
    const source = url.searchParams.get("source") || undefined;
    const minScore = url.searchParams.get("minScore")
      ? Number(url.searchParams.get("minScore"))
      : undefined;
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;

    const demands = await listDemands({ status, source, minScore, limit });
    return NextResponse.json({ ok: true, demands });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
