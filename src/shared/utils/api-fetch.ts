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
  
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  let targetUrl = url;

  if (isLocalhost) {
    let activeBackendUrl = BACKEND_URL;
    if (!activeBackendUrl) {
      activeBackendUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
    }
    targetUrl = url.startsWith("/") ? `${activeBackendUrl.replace(/\/$/, "")}${url}` : url;
  } else {
    // Relative URL: routes through the Next.js port 3000 proxy rewrite
    targetUrl = url;
  }
  
  return fetch(targetUrl, {
    cache: "no-store",
    ...init,
    headers,
  });
}
