import { NextResponse } from "next/server";
import { updateDemandStatus } from "@/lib/demands/service";
import type { DemandStatus } from "@/lib/demands/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const status = body.status as DemandStatus;

    if (!status || !["new", "saved", "contacted", "dismissed"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Neplatný stav poptávky" }, { status: 400 });
    }

    const updated = await updateDemandStatus(id, status);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Poptávka nenalezena" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, demand: updated });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
