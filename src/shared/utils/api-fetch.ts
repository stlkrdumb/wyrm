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
  
  // Dynamically resolve target backend host interface
  let activeBackendUrl = BACKEND_URL;
  if (!activeBackendUrl) {
    // Fallback: assume backend is on port 3001 of the current page host
    activeBackendUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
  } else if (activeBackendUrl.includes("localhost") && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    // Swap localhost with current network IP interface (e.g. 192.168.x.x) to avoid CORS block
    activeBackendUrl = activeBackendUrl.replace("localhost", window.location.hostname);
  }

  const targetUrl = url.startsWith("/") ? `${activeBackendUrl.replace(/\/$/, "")}${url}` : url;
  
  return fetch(targetUrl, {
    cache: "no-store",
    ...init,
    headers,
  });
}
