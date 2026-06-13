#!/usr/bin/env node
import { parseArgs, buildConfig } from "./wyrmctl/config.mjs";
import { printUsage } from "./wyrmctl/output.mjs";
import { runCommand } from "./wyrmctl/commands.mjs";

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (!command || flags.help) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  const ctx = buildConfig(flags);
  await runCommand(ctx, command, flags);
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.status) {
    console.error(JSON.stringify(err.data, null, 2));
  }
  process.exit(1);
});
