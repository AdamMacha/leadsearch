import { NextResponse } from "next/server";
import { analyzeManualDemandText } from "@/lib/demands/service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = body.text?.trim();
    const title = body.title?.trim();

    if (!text) {
      return NextResponse.json({ ok: false, error: "Text poptávky nesmí být prázdný" }, { status: 400 });
    }

    const demand = await analyzeManualDemandText(text, title);
    return NextResponse.json({ ok: true, demand });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
