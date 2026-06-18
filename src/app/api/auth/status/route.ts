import { NextResponse } from "next/server";
import { verifySessionToken } from "@/shared/utils/auth";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/wyrm_session=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;
  
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true });
}
