import { repo } from "@/lib/db";

/** Serves the stored PageSpeed mobile screenshot (data URI → image). */
export async function GET(_request: Request, ctx: RouteContext<"/api/leads/[id]/screenshot">) {
  const { id } = await ctx.params;
  const shot = await repo().getScreenshot(id);
  const m = shot?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600" },
  });
}
