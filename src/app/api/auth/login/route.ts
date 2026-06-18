import { NextResponse } from "next/server";
import { signSessionToken } from "@/shared/utils/auth";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }

    const token = await signSessionToken();
    const response = NextResponse.json({ success: true });
    
    response.cookies.set("wyrm_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
