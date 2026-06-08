/** Proxy HTTP client using subprocess curl — works reliably with WebShare. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function proxyFetch<T>(url: string, proxyUrl: string): Promise<T> {
  const result = await exec("curl", [
    "-sS",
    "--max-time", "12",
    "-x", proxyUrl,
    "--user-agent", "curl/7.81.0",
    "--header", "Accept: application/json",
    url,
  ]);

  const body = result.stdout;
  if (!body.trim()) throw new Error("Empty response from proxy");

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${body.slice(0, 100)}`);
  }
}
