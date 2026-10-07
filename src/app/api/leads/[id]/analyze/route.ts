import { NextResponse } from "next/server";
import { analyzeAndSave } from "@/lib/services";

// PageSpeed can take 10–40 s per site.
export const maxDuration = 120;

export async function POST(_request: Request, ctx: RouteContext<"/api/leads/[id]/analyze">) {
  const { id } = await ctx.params;
  try {
    const lead = await analyzeAndSave(id);
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
