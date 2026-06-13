import { DEFAULT_BASE_URL } from "./config.mjs";

export function print(data, raw) {
  if (raw) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

export function printUsage() {
  console.log(`
wyrmctl — control the Wyrm trading agent without curl

Usage: wyrmctl <command> [options]

Global options:
  -u, --base-url <url>   Agent API base URL (default: ${DEFAULT_BASE_URL})
  -t, --token <token>    Bearer token (defaults to NEXT_PUBLIC_AUTH_TOKEN)
  -r, --raw              Output raw JSON only
  -h, --help             Show this help

Commands:
  status                       Get full agent state
  start                        Start auto-cycling
  pause                        Pause auto-cycling
  stop                         Stop auto-cycling and flatten positions
  cycle                        Run one manual cycle
  ws-start                     Initialize market WebSocket
  stream                       Listen to SSE price stream
  config                       Show agent config
  sentiment [-s <symbol>]      Get market sentiment
  history [-s <symbol>]        Get trade history
  news [-l <limit>]            Get latest news
  strategy                     Get current strategy
  strategy-set -f <file>       Update strategy from JSON file
  strategy-set --persona ... --instructions ... [--pct ...]
                               Update strategy from flags
  breaker-reset                Reset circuit breaker
  breaker-threshold -p <pct>   Update circuit breaker threshold
  backtest [-e <equity>]       Run backtest
  reset                        Reset all agent state
`);
}
