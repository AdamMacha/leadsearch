import { NextResponse } from "next/server";
import { runSearch } from "@/lib/services";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string; location?: string; pages?: number };
    const query = body.query?.trim();
    if (!query) return NextResponse.json({ error: "Zadej obor nebo hledaný výraz." }, { status: 400 });
    const pages = Math.min(3, Math.max(1, Number(body.pages) || 1));
    const result = await runSearch(query, body.location?.trim() ?? "", pages);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
