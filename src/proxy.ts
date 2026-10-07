import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * 1) Audit host (e.g. audit.technologio.eu): only public audit pages are served,
 *    `/<slug>` is rewritten to `/a/<slug>`.
 * 2) App host: everything requires a session except login, public audits and cron endpoints.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const auditHost = process.env.AUDIT_HOST?.trim();

  if (auditHost && host === auditHost) {
    if (pathname === "/") {
      return NextResponse.redirect(process.env.SENDER_WEB || "https://www.technologio.eu");
    }
    if (pathname.startsWith("/a/")) return NextResponse.next();
    const slug = pathname.slice(1).split("/")[0];
    if (/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.rewrite(new URL(`/a/${slug}`, request.url));
    }
    return new NextResponse("Not found", { status: 404 });
  }

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/a/") ||
    pathname.startsWith("/api/cron/");
  if (isPublic) return NextResponse.next();

  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
