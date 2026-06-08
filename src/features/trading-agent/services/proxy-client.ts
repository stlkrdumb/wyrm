/** Proxy HTTP client using subprocess curl with round-robin rotation. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Parse all proxy URLs from BITGET_PROXY env var (pipe-separated or newline)
const RAW = process.env.BITGET_PROXY || "";
export const PROXIES: string[] = RAW.split(/[|\n]/).map(p => p.trim()).filter(Boolean);
console.log(`[Proxy] Loaded ${PROXIES.length} proxies:`);
PROXIES.forEach((p, i) => console.log(`  ${i + 1}. ${mask(p)}`));

// Round-robin index
let _index = 0;

/** Mask password from logs */
function mask(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch { return url.slice(0, 30) + "..."; }
}

/** Execute curl via a single proxy */
async function _fetchVia(proxy: string, url: string): Promise<string> {
  const result = await exec("curl", [
    "-sS", "--max-time", "10",
    "-x", proxy,
    "--user-agent", "curl/7.81.0",
    "--header", "Accept: application/json",
    url,
  ]);
  return result.stdout.trim();
}

/** Fetch with rotation: try preferred first, then round-robin on failure */
export async function proxyFetch<T>(url: string, preferredProxy?: string): Promise<T> {
  if (PROXIES.length === 0) throw new Error("No proxies configured — set BITGET_PROXY");

  const tried = new Set<string>();
  let lastError: string | null = null;

  // Try preferred first if provided and not in list yet
  if (preferredProxy && !tried.has(preferredProxy)) {
    tried.add(preferredProxy);
    try {
      return JSON.parse(await _fetchVia(preferredProxy, url)) as T;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Proxy] ${preferredProxy}: ${lastError}`);
    }
  }

  // Round-robin through all proxies until one works
  let attempts = 0;
  while (tried.size < PROXIES.length) {
    _index = (_index + 1) % PROXIES.length;
    const proxy = PROXIES[_index];
    tried.add(proxy);

    try {
      const body = await _fetchVia(proxy, url);
      if (!body) throw new Error("Empty response");
      console.log(`[Proxy] ${mask(proxy)} ✓`);
      return JSON.parse(body) as T;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Proxy] ${mask(proxy)}: ${lastError}`);
    }

    // Prevent infinite loops
    if (++attempts >= PROXIES.length) break;
  }

  throw new Error(`All ${PROXIES.length} proxies failed: ${lastError}`);
}
