import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "costra-config-test-"));
process.env.COSTRA_CONFIG = path.join(tmp, "costra.json");

const { CONFIG_PATH, loadConfig, saveConfig, resolveAccount } = await import(
  "../src/config.js"
);

test("CONFIG_PATH honours COSTRA_CONFIG", () => {
  assert.equal(CONFIG_PATH, path.join(tmp, "costra.json"));
});

test("loadConfig returns defaults when file is missing", () => {
  const cfg = loadConfig();
  assert.deepEqual(cfg.portRange, [47800, 47899]);
  assert.deepEqual(cfg.accounts, {});
});

test("saveConfig/loadConfig roundtrip preserves accounts and overrides", () => {
  const cfg = loadConfig();
  cfg.portRange = [50000, 50010];
  cfg.accounts.work = { provider: "anthropic", model: "claude-fable-5" };
  saveConfig(cfg);

  const reloaded = loadConfig();
  assert.deepEqual(reloaded.portRange, [50000, 50010]);
  assert.deepEqual(reloaded.accounts.work, {
    provider: "anthropic",
    model: "claude-fable-5",
  });
});

test("resolveAccount merges provider preset and defaults configDir", () => {
  const cfg = loadConfig();
  cfg.accounts.work = { provider: "anthropic", model: "claude-fable-5" };
  cfg.accounts.oai = { provider: "openai" };
  saveConfig(cfg);

  const work = resolveAccount(cfg, "work");
  assert.equal(work.cli, "claude");
  assert.equal(work.baseUrlEnv, "ANTHROPIC_BASE_URL");
  assert.equal(work.configDirEnv, "CLAUDE_CONFIG_DIR");
  assert.equal(work.model, "claude-fable-5");
  assert.equal(work.configDir, path.join(os.homedir(), ".config-claude-work"));

  const oai = resolveAccount(cfg, "oai");
  assert.equal(oai.cli, "codex");
  assert.equal(oai.baseUrlEnv, "OPENAI_BASE_URL");
  assert.equal(oai.configDirEnv, "CODEX_HOME");
  assert.equal(oai.configDir, path.join(os.homedir(), ".config-codex-oai"));
});

test("resolveAccount respects cli and configDir overrides", () => {
  const cfg = loadConfig();
  cfg.accounts.custom = {
    provider: "anthropic",
    cli: "claude-nightly",
    configDir: "/tmp/custom-dir",
  };
  const custom = resolveAccount(cfg, "custom");
  assert.equal(custom.cli, "claude-nightly");
  assert.equal(custom.configDir, "/tmp/custom-dir");
});

test("resolveAccount throws for unknown account", () => {
  const cfg = loadConfig();
  assert.throws(() => resolveAccount(cfg, "nope"), /Unknown account "nope"/);
});

test("resolveAccount throws for unknown provider", () => {
  const cfg = loadConfig();
  cfg.accounts.bad = { provider: "gemini" };
  assert.throws(() => resolveAccount(cfg, "bad"), /Unknown provider "gemini"/);
});

test("loadConfig reports parse errors with the config path", () => {
  fs.writeFileSync(CONFIG_PATH, "{not json");
  assert.throws(() => loadConfig(), new RegExp(`Failed to parse .*costra\\.json`));
  fs.rmSync(CONFIG_PATH);
});
