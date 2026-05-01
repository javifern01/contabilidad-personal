/**
 * Auth proxy (Next.js 16 convention — previously named "middleware").
 * File is named proxy.ts per Next.js 16 (middleware.ts is deprecated, triggers build warning).
 *
 * Public paths: /login, /api/auth/*, /api/health, static assets.
 * Everything else requires a session — unauthenticated requests are
 * redirected to /login?next=<original path>.
 *
 * Node.js runtime: Next.js 16 Proxy always runs on Node.js (no Edge runtime config needed).
 * This means Buffer, node:crypto, and other Node builtins in the import graph work correctly.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Route guard. Session validation is DB-backed (cookieCache: { enabled: false })
 * so every authenticated request hits the session table — instant revocation per D-06.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths — no auth required
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname === "/robots.txt" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match everything except Next.js internal assets (_next/static, _next/image)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
