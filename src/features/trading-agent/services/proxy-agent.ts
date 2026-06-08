/** Proxy agent for Bitget API requests via WebShare or any HTTP/S proxy. */
import { HttpsProxyAgent } from "https-proxy-agent";

const PROXY_URL = process.env.BITGET_PROXY; // e.g. http://user:pass@host:port

let _agent: HttpsProxyAgent<any> | null = null;
console.log(`[Proxy] PROXY configured: ${PROXY_URL ? 'YES' : 'NO'} (${PROXY_URL || '(none)'})`);

export function getProxyAgent(): HttpsProxyAgent<any> | null {
  if (!PROXY_URL) {
    console.log("[Proxy] No proxy configured, returning null");
    return null;
  }
  if (_agent) {
    console.log("[Proxy] Returning cached agent");
    return _agent;
  }
  try {
    // @ts-ignore — v6 types require generic param
    _agent = new HttpsProxyAgent(PROXY_URL);
    console.log(`[Proxy] Agent created: ${mask(PROXY_URL)}`);
    return _agent;
  } catch (err) {
    console.error("[Proxy] Agent creation failed:", err instanceof Error ? err.message : String(err));
    _agent = null;
    return null;
  }
}

function mask(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return url.slice(0, 30) + "...";
  }
}
