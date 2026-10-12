import { NextResponse } from "next/server";
import { getDemandTrackerConfig, saveDemandTrackerConfig } from "@/lib/demands/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getDemandTrackerConfig();
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const patch = await request.json();
    const updated = await saveDemandTrackerConfig(patch);
    return NextResponse.json({ ok: true, config: updated });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
