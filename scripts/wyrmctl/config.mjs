import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

export const DEFAULT_BASE_URL = "http://localhost:3000";

function env(key, fallback) {
  const value = process.env[key];
  return value === undefined ? fallback : value;
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--raw" || arg === "-r") {
      flags.raw = true;
    } else if (arg === "--base-url" || arg === "-u") {
      flags.baseUrl = args[++i];
    } else if (arg === "--token" || arg === "-t") {
      flags.token = args[++i];
    } else if (arg === "--file" || arg === "-f") {
      flags.file = args[++i];
    } else if (arg === "--symbol" || arg === "-s") {
      flags.symbol = args[++i];
    } else if (arg === "--limit" || arg === "-l") {
      flags.limit = args[++i];
    } else if (arg === "--equity" || arg === "-e") {
      flags.equity = args[++i];
    } else if (arg === "--pct" || arg === "-p") {
      flags.pct = args[++i];
    } else if (arg === "--persona") {
      flags.persona = args[++i];
    } else if (arg === "--instructions") {
      flags.instructions = args[++i];
    } else if (arg.startsWith("--")) {
      const [key, value] = arg.split("=");
      flags[key.slice(2)] = value ?? true;
    } else if (arg.startsWith("-")) {
      flags[arg.slice(1)] = args[++i];
    } else {
      positional.push(arg);
    }
  }

  return { command: positional[0] ?? null, subargs: positional.slice(1), flags };
}

export function buildConfig(flags) {
  const baseUrl = (flags.baseUrl || env("AGENT_BASE_URL", DEFAULT_BASE_URL)).replace(/\/$/, "");
  const token = flags.token || env("NEXT_PUBLIC_AUTH_TOKEN", "");
  if (!token) {
    throw new Error("NEXT_PUBLIC_AUTH_TOKEN is not set. Add it to .env.local or pass --token.");
  }
  return { baseUrl, token };
}
