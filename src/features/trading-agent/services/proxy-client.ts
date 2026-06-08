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

/** Execute curl via a single proxy, returns JSON body */
async function _fetchVia(proxy: string, url: string): Promise<any> {
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

/** Fetch with rotation — tries proxies one at a time until success */
export async function proxyFetch<T>(url: string): Promise<T> {
  if (PROXIES.length === 0) throw new Error("No proxies configured — set BITGET_PROXY");

  const tried = new Set<string>();
  let lastError: string | null = null;

  while (tried.size < PROXIES.length) {
    // Pick next proxy via round-robin
    _index = (_index + 1) % PROXIES.length;
    const proxy = PROXIES[_index];

    try {
      const body = await _fetchVia(proxy, url);
      console.log(`[Proxy] ${mask(proxy)} ✓`);
      return body as T;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      tried.add(proxy);
      console.warn(`[Proxy] ${mask(proxy)} failed: ${lastError.split('\n')[0].slice(0, 100)}`);
    }
  }

  throw new Error(`All ${PROXIES.length} proxies failed: ${lastError}`);
}
