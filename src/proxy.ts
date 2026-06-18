import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/shared/utils/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Protect configuration page (requires browser session)
  if (pathname.startsWith("/config")) {
    const token = req.cookies.get("wyrm_session")?.value;
    const isAuthed = token ? await verifySessionToken(token) : false;
    if (!isAuthed) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // 2. Protect agent control and data endpoints
  if (
    pathname.startsWith("/api/agent/breaker") ||
    pathname.startsWith("/api/agent/strategy") ||
    pathname.startsWith("/api/agent/cycle") ||
    pathname.startsWith("/api/agent/close")
  ) {
    // GET requests (viewing state/logs) are public-facing, but POST/PUT are state-changing
    if (req.method !== "GET") {
      // Allow browser session
      const sessionToken = req.cookies.get("wyrm_session")?.value;
      const isSessionAuthed = sessionToken ? await verifySessionToken(sessionToken) : false;

      if (isSessionAuthed) {
        return NextResponse.next();
      }

      // Allow programmatic Bearer token or URL token parameter (from proxy.ts)
      const apiToken = process.env.NEXT_PUBLIC_AUTH_TOKEN;
      if (!apiToken) {
        return NextResponse.json(
          { status: "error", message: "Server misconfigured — AUTH_TOKEN not set" },
          { status: 500 }
        );
      }

      const authHeader = req.headers.get("authorization");
      const queryToken = req.nextUrl.searchParams.get("token");

      if (authHeader !== `Bearer ${apiToken}` && queryToken !== apiToken) {
        return NextResponse.json(
          { status: "error", message: "Unauthorized — invalid or missing credentials" },
          { status: 401 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/config/:path*", "/api/agent/:path*"],
};
export default proxy;
