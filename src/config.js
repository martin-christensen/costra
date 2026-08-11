import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getProvider } from "./providers.js";
import { ensureDir, statePath } from "./paths.js";

export const CONFIG_PATH = statePath("config.json", {
  env: "COSTRA_CONFIG",
  legacy: ".costra.json",
});

const DEFAULTS = {
  portRange: [47800, 47899],
  accounts: {},
};

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return structuredClone(DEFAULTS);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    throw new Error(`Failed to parse ${CONFIG_PATH}: ${err.message}`);
  }
  return {
    ...structuredClone(DEFAULTS),
    ...raw,
    accounts: raw.accounts ?? {},
  };
}

export function saveConfig(cfg) {
  ensureDir(CONFIG_PATH);
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`);
}

/**
 * Merge an account entry with its provider preset into a fully resolved
 * account object: { name, provider, cli, model, baseUrlEnv, configDirEnv, configDir }.
 */
export function resolveAccount(cfg, name) {
  const entry = cfg.accounts[name];
  if (!entry) {
    throw new Error(
      `Unknown account "${name}". Add it first: costra add ${name} --provider anthropic|openai`
    );
  }
  const preset = getProvider(entry.provider);
  return {
    name,
    provider: entry.provider,
    cli: entry.cli ?? preset.cli,
    model: entry.model,
    baseUrlEnv: preset.baseUrlEnv,
    configDirEnv: preset.configDirEnv,
    configDir:
      entry.configDir ??
      path.join(os.homedir(), `${preset.configDirPrefix}${name}`),
  };
}
