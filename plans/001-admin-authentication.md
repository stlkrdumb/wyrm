# Plan: Single-Admin Passcode Authentication & UI Control Dashboard

- **Reference Commit**: `5403f66`
- **Category**: Security / UX
- **Effort**: S (about 3–4 hours)
- **Risk**: LOW (strictly guards config and admin routes behind a middleware check)

## Purpose
This plan outlines how to secure the application with a single-admin passcode system. This enables you to safely expose the Next.js frontend over a public Cloudflare Tunnel without exposing control buttons (Start/Stop/Pause) or the Parameter Tuner configuration screen to the public. Unauthenticated users will only see a read-only terminal, or get redirected to a `/login` page when attempting to access the controls.

---

## Architecture

1. **Configurable Secret**: Define an `ADMIN_PASSWORD` environment variable in `.env.local`.
2. **Session Security**: Use `jose` (edge-compatible JWT) to sign and verify an HttpOnly, Secure, SameSite=Strict cookie named `wyrm_session` containing a basic admin payload.
3. **Route Protection**: Implement Next.js Edge Middleware (`src/middleware.ts`) to intercept `/config` and state-changing API routes (`/api/agent/cycle`, `/api/agent/breaker`, etc.), responding with 401 (unauthorized) or redirecting to `/login`.
4. **Auth Routes**:
   - `POST /api/auth/login`: Verifies password and sets the HttpOnly cookie.
   - `POST /api/auth/logout`: Clears the cookie.
   - `GET /api/auth/status`: Client hook helper to check session status.
5. **Dashboard Controls**: Add Start/Pause/Stop and Manual Cycle triggers into the UI *only* when the admin is authenticated.

---

## Implementation Steps

### Step 1: Install Dependencies
Run the command to install the lightweight, Edge-compatible signing library:
```bash
npm install jose
```

### Step 2: Add Config Option to `.env.local`
Add the target secret password in your local environment file:
```env
ADMIN_PASSWORD=your-secure-passcode-here
```

### Step 3: Create Auth Utility (`src/shared/utils/auth.ts`)
Create a helper to sign and verify tokens on the edge:
```typescript
import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.ADMIN_PASSWORD || "fallback-temporary-secret-wyrm");

export async function signSessionToken() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.role === "admin";
  } catch {
    return false;
  }
}
```

### Step 4: Create Login and Logout API Routes
Create `src/app/api/auth/login/route.ts`:
```typescript
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
```

Create `src/app/api/auth/logout/route.ts`:
```typescript
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("wyrm_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
```

Create `src/app/api/auth/status/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/shared/utils/auth";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader.split("; ").find(c => c.startsWith("wyrm_session="))?.split("=")[1];
  
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true });
}
```

### Step 5: Implement Next.js Middleware (`src/middleware.ts`)
Create a middleware file in the `src/` directory to block public access to config or API changes:
```typescript
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
  if (pathname.startsWith("/api/agent/breaker") || pathname.startsWith("/api/agent/strategy")) {
    if (req.method !== "GET" && !isAuthed) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }
  }
  
  if (pathname.startsWith("/api/agent/cycle") && req.method !== "GET") {
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/config/:path*", "/api/agent/:path*"],
};
```

### Step 6: Create the Login Form Page (`src/app/login/page.tsx`)
Create a simple obsidian-themed passcode page matching the typography rules (`Azeret Mono` display and responsive spacing):
- Simple text input for the password.
- Submits JSON to `/api/auth/login`.
- If successful, redirects to `/config` or `/`.

---

## Verification & Tests
1. **Unauthenticated Check**: Verify navigating to `/config` redirects back to `/login`.
2. **API Protection Check**: Verify triggering a manual POST/PUT cycle changes via CLI curl yields a `401 Unauthorized`.
3. **Build Check**: Verify `npm run build` succeeds and typechecking returns no errors.
