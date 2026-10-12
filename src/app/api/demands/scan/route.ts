import { NextResponse } from "next/server";
import { scanAndProcessDemands } from "@/lib/demands/service";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await scanAndProcessDemands();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
