import { repo } from "@/lib/db";

export async function GET(_request: Request, ctx: RouteContext<"/a/[slug]/screenshot">) {
  const { slug } = await ctx.params;
  const r = repo();
  const lead = await r.getLeadBySlug(slug);
  const shot = lead ? await r.getScreenshot(lead.id) : null;
  const m = shot?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=86400" },
  });
}
