import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/shared/utils/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("wyrm_session")?.value;

  const isAuthed = token ? await verifySessionToken(token) : false;

  // Protect configuration page
  if (pathname.startsWith("/config")) {
    if (!isAuthed) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Protect agent state-changing actions
  if (
    pathname.startsWith("/api/agent/breaker") ||
    pathname.startsWith("/api/agent/strategy") ||
    pathname.startsWith("/api/agent/cycle")
  ) {
    if (req.method !== "GET" && !isAuthed) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/config/:path*", "/api/agent/:path*"],
};
