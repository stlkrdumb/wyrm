/** Proxy HTTP client using subprocess curl with round-robin rotation. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HttpsProxyAgent } from "https-proxy-agent";

const exec = promisify(execFile);

// Parse all proxy URLs from BITGET_PROXY env var (pipe-separated or newline)
const RAW = process.env.BITGET_PROXY || "";
export const PROXIES: string[] = RAW.split(/[|\n]/).map(p => p.trim()).filter(Boolean);

console.log(`[Proxy] Loaded ${PROXIES.length} proxies.`);

// Round-robin index
let _index = 0;

/** Mask password from logs */
export function mask(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch { return url.slice(0, 30) + "..."; }
}

/** Execute curl via a single proxy, returns JSON body */
async function _fetchVia(proxy: string, url: string): Promise<unknown> {
  const result = await exec("curl", [
    "-sS", "--max-time", "10",
    "-x", proxy,
    "--user-agent", "curl/7.81.0",
    "--header", "Accept: application/json",
    url,
  ]);

  const body = result.stdout.trim();
  if (!body) throw new Error("Empty response");
  return JSON.parse(body);
}

/** Fetch with rotation — tries proxies one at a time until success. Falls back to native fetch if no proxies are configured. */
export async function optionalFetch<T>(url: string): Promise<T> {
  if (PROXIES.length === 0) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return (await res.json()) as T;
  }

  const tried = new Set<string>();
  let lastError: string | null = null;

  while (tried.size < PROXIES.length) {
    // Pick next proxy via round-robin
    const proxy = PROXIES[_index];
    _index = (_index + 1) % PROXIES.length;

    try {
      const body = await _fetchVia(proxy, url);
      return body as T;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      tried.add(proxy);
      console.warn(`[Proxy] ${mask(proxy)} failed: ${lastError.split('\n')[0].slice(0, 100)}`);
    }
  }

  throw new Error(`All ${PROXIES.length} proxies failed. Last error: ${lastError}`);
}

/** Get HttpsProxyAgent for WebSocket connection. Returns null if no proxies configured. */
export function getProxyAgentForWS(index: number): HttpsProxyAgent<string> | null {
  if (PROXIES.length === 0) return null;
  const proxyUrl = PROXIES[index % PROXIES.length];
  try {
    return new HttpsProxyAgent(proxyUrl);
  } catch (err) {
    console.error(`[Proxy] Agent creation failed for ${mask(proxyUrl)}:`, err);
    return null;
  }
}
