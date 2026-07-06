import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  CONFIG_PATH,
  loadConfig,
  saveConfig,
  resolveAccount,
} from "./config.js";
import { PROVIDERS, getProvider } from "./providers.js";
import { allocatePort, readAssignedPort, isPortInUse } from "./ports.js";
import { ensureProxy, stopProxy, proxyEnv } from "./proxy.js";
import { launchCli } from "./launch.js";
import { openInBrowser } from "./browser.js";

const HELP = `costra — run multiple Claude Code / Codex accounts behind pxpipe proxies

Usage:
  costra <account> [--no-open] [--no-proxy] [-- <cli args...>]
                                        Start proxy (if needed), open its URL in
                                        the browser, and launch the CLI
  costra add <account> [options]        Register an account in ${CONFIG_PATH}
  costra remove <account>               Unregister an account (config dir is kept)
  costra list                           List configured accounts
  costra status                         Show ports and proxy state per account
  costra stop <account>                 Stop the account's background proxy
  costra proxy <account>                Run the account's proxy in the foreground
  costra help                           Show this help

Options for launching an account:
  --no-open                       Don't open the pxpipe proxy URL in the browser
  --no-proxy                      Launch the CLI directly, without a pxpipe proxy

Options for "add":
  --provider <anthropic|openai>   Provider preset (default: anthropic)
  --model <model>                 Model passed to the CLI via --model
  --cli <binary>                  Override the CLI binary (claude / codex / ...)
  --config-dir <path>             Override the account's config directory

Examples:
  costra add work --provider anthropic --model claude-fable-5
  costra add oai --provider openai
  costra work
  costra work -- --resume
`;

function pkgVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(
    fs.readFileSync(path.join(here, "..", "package.json"), "utf8")
  );
  return pkg.version;
}

function parseFlags(args, spec) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = spec[arg];
      if (!key) throw new Error(`Unknown option "${arg}"`);
      const value = args[++i];
      if (value === undefined) throw new Error(`Option "${arg}" needs a value`);
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

async function cmdAdd(args) {
  const { flags, positional } = parseFlags(args, {
    "--provider": "provider",
    "--model": "model",
    "--cli": "cli",
    "--config-dir": "configDir",
  });
  const name = positional[0];
  if (!name) throw new Error('Usage: costra add <account> [options]');
  const provider = flags.provider ?? "anthropic";
  getProvider(provider); // Validate early.

  const cfg = loadConfig();
  const existed = Boolean(cfg.accounts[name]);
  cfg.accounts[name] = {
    provider,
    ...(flags.model ? { model: flags.model } : {}),
    ...(flags.cli ? { cli: flags.cli } : {}),
    ...(flags.configDir ? { configDir: path.resolve(flags.configDir) } : {}),
  };
  saveConfig(cfg);
  const account = resolveAccount(cfg, name);
  console.log(
    `${existed ? "Updated" : "Added"} account "${name}" (provider: ${provider}, cli: ${account.cli})`
  );
  console.log(`Config dir: ${account.configDir}`);
}

async function cmdRemove(args) {
  const name = args[0];
  if (!name) throw new Error("Usage: costra remove <account>");
  const cfg = loadConfig();
  if (!cfg.accounts[name]) throw new Error(`Unknown account "${name}"`);
  const account = resolveAccount(cfg, name);
  stopProxy(account);
  delete cfg.accounts[name];
  saveConfig(cfg);
  console.log(`Removed account "${name}" (config dir kept: ${account.configDir})`);
}

async function cmdList() {
  const cfg = loadConfig();
  const names = Object.keys(cfg.accounts);
  if (names.length === 0) {
    console.log(`No accounts configured. Add one: costra add <account> --provider anthropic|openai`);
    return;
  }
  for (const name of names) {
    const account = resolveAccount(cfg, name);
    const model = account.model ? `, model: ${account.model}` : "";
    console.log(`${name}  (${account.provider} → ${account.cli}${model})`);
  }
}

async function cmdStatus() {
  const cfg = loadConfig();
  const names = Object.keys(cfg.accounts);
  if (names.length === 0) {
    console.log("No accounts configured.");
    return;
  }
  for (const name of names) {
    const account = resolveAccount(cfg, name);
    const port = readAssignedPort(account);
    if (port === null) {
      console.log(`${name}  port: -  proxy: not allocated`);
      continue;
    }
    const running = await isPortInUse(port);
    console.log(`${name}  port: ${port}  proxy: ${running ? "running" : "stopped"}`);
  }
}

async function cmdStop(args) {
  const name = args[0];
  if (!name) throw new Error("Usage: costra stop <account>");
  const cfg = loadConfig();
  const account = resolveAccount(cfg, name);
  const stopped = stopProxy(account);
  console.log(stopped ? `Stopped proxy for "${name}"` : `No running proxy found for "${name}"`);
}

async function cmdProxy(args) {
  const name = args[0];
  if (!name) throw new Error("Usage: costra proxy <account>");
  const cfg = loadConfig();
  const account = resolveAccount(cfg, name);
  const port = await allocatePort(cfg, account);
  if (await isPortInUse(port)) {
    throw new Error(`Something is already listening on port ${port}`);
  }
  console.log(`Starting pxpipe proxy for "${name}" on port ${port} (Ctrl-C to stop)`);
  const child = spawn("npx", ["pxpipe-proxy"], {
    stdio: "inherit",
    env: proxyEnv(account, port),
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function cmdRun(name, rest) {
  let args = rest;
  let open = true;
  let proxy = true;
  while (args[0] === "--no-open" || args[0] === "--no-proxy") {
    if (args[0] === "--no-open") open = false;
    if (args[0] === "--no-proxy") proxy = false;
    args = args.slice(1);
  }
  const extraArgs = args[0] === "--" ? args.slice(1) : args;
  const cfg = loadConfig();
  const account = resolveAccount(cfg, name);
  if (!proxy) {
    console.log(`Launching "${name}" without a pxpipe proxy`);
    launchCli(account, null, extraArgs);
    return;
  }
  const port = await allocatePort(cfg, account);
  const { started } = await ensureProxy(account, port);
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `${started ? "Started" : "Reusing"} pxpipe proxy for "${name}" at ${url}`
  );
  if (open) {
    openInBrowser(url);
  }
  launchCli(account, port, extraArgs);
}

export async function main(argv) {
  if (argv.length === 0 || ["help", "--help", "-h"].includes(argv[0])) {
    console.log(HELP);
    return;
  }
  if (["--version", "-v"].includes(argv[0])) {
    console.log(pkgVersion());
    return;
  }
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "add":
      return cmdAdd(rest);
    case "remove":
    case "rm":
      return cmdRemove(rest);
    case "list":
    case "ls":
      return cmdList();
    case "status":
      return cmdStatus();
    case "stop":
      return cmdStop(rest);
    case "proxy":
      return cmdProxy(rest);
    default:
      return cmdRun(cmd, rest);
  }
}
