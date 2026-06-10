const TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN ?? "";

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (TOKEN && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${TOKEN}`);
  }
  return fetch(url, { ...init, headers });
}
