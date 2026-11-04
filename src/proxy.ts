import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Optimistic check only: no cookie at all → straight to the login page.
 * The real check (valid signature, account active, permissions) happens on
 * the server in every page and action via getCtx().
 */
export function proxy(req: NextRequest) {
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL("/login", req.url);
  if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, public careers pages, and static files.
  matcher: ["/((?!login|careers|_next/static|_next/image|favicon.ico).*)"],
};
