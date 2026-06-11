import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/agent")) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  const token = process.env.NEXT_PUBLIC_AUTH_TOKEN;

  if (!token) {
    return NextResponse.json(
      { status: "error", message: "Server misconfigured — AUTH_TOKEN not set" },
      { status: 500 }
    );
  }

  if (!authHeader || authHeader !== `Bearer ${token}`) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized — invalid or missing Bearer token" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/agent/:path*",
};
