/** Proxy agent for Bitget API requests via WebShare or any HTTP/S proxy. */
import { HttpsProxyAgent } from "https-proxy-agent";

const PROXY_URL = process.env.BITGET_PROXY; // e.g. http://user:pass@host:port

let _agent: HttpsProxyAgent<any> | null = null;

export function getProxyAgent(): HttpsProxyAgent<any> | null {
  if (!PROXY_URL) return null;
  if (!_agent) {
    try {
      // @ts-ignore — v6 types require generic param, but works fine at runtime
      _agent = new HttpsProxyAgent(PROXY_URL);
      console.log(`[Proxy] WebShare proxy configured: ${mask(PROXY_URL)}`);
    } catch (err) {
      console.error("[Proxy] Failed to create agent:", err instanceof Error ? err.message : String(err));
      _agent = null;
    }
  }
  return _agent;
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
