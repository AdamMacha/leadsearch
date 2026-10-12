import { NextResponse } from "next/server";
import { processLeadAutopilot } from "@/lib/autopilot";

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/autopilot">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const res = await processLeadAutopilot(id, {
    autoSend: Boolean(body.autoSend),
    fastMode: Boolean(body.fastMode),
    minNeedScore: typeof body.minNeedScore === "number" ? body.minNeedScore : 35,
    skipNoEmail: body.skipNoEmail !== false,
    modelOverride: typeof body.modelOverride === "string" ? body.modelOverride.trim() : undefined,
    sourceTrigger: "batch",
  });

  const statusCode = res.ok ? 200 : res.status === "error" ? 500 : 400;
  return NextResponse.json(res, { status: statusCode });
}
