const TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN ?? "";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  // If running on Next.js server side (SSR), return a mock resolved response
  // to avoid Node network errors. Browser handles actual fetches post-mount.
  if (typeof window === "undefined") {
    return Promise.resolve(new Response(JSON.stringify({ status: "stopped", positions: [], trades: [], logs: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
  }

  const headers = new Headers(init?.headers);
  if (TOKEN && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${TOKEN}`);
  }
  
  // Prepend backend URL for absolute routing if it is set and the url is relative
  const targetUrl = BACKEND_URL && url.startsWith("/") ? `${BACKEND_URL.replace(/\/$/, "")}${url}` : url;
  
  return fetch(targetUrl, { ...init, headers });
}
