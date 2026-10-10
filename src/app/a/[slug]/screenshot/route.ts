import { repo } from "@/lib/db";

export async function GET(_request: Request, ctx: RouteContext<"/a/[slug]/screenshot">) {
  const { slug } = await ctx.params;
  const r = repo();
  const lead = await r.getLeadBySlug(slug);
  const shot = lead ? await r.getScreenshot(lead.id) : null;
  const m = shot?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (m) {
    return new Response(Buffer.from(m[2], "base64"), {
      headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=86400" },
    });
  }

  // Reliable fallback screenshot from thum.io if Google PageSpeed did not provide one
  if (lead?.website) {
    const rawUrl = lead.website.trim();
    const target = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;
    const fallbackUrl = `https://image.thum.io/get/width/400/crop/700/noanimate/${target}`;
    return Response.redirect(fallbackUrl, 307);
  }

  return new Response("Not found", { status: 404 });
}
