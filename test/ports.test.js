import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "costra-ports-test-"));
process.env.COSTRA_CONFIG = path.join(tmp, "costra.json");

const { loadConfig, saveConfig, resolveAccount } = await import(
  "../src/config.js"
);
const { isPortInUse, allocatePort, readAssignedPort } = await import(
  "../src/ports.js"
);

function makeConfig() {
  const cfg = loadConfig();
  cfg.portRange = [48800, 48810]; // Away from the default range to avoid clashes.
  cfg.accounts = {
    a: { provider: "anthropic", configDir: path.join(tmp, "a") },
    b: { provider: "openai", configDir: path.join(tmp, "b") },
  };
  saveConfig(cfg);
  return cfg;
}

test("isPortInUse detects a listening server and its absence", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  assert.equal(await isPortInUse(port), true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortInUse(port), false);
});

test("allocatePort assigns distinct, stable, persisted ports", async () => {
  const cfg = makeConfig();
  const a = resolveAccount(cfg, "a");
  const b = resolveAccount(cfg, "b");

  const portA = await allocatePort(cfg, a);
  const portB = await allocatePort(cfg, b);

  assert.notEqual(portA, portB);
  assert.ok(portA >= 48800 && portA <= 48810);
  assert.ok(portB >= 48800 && portB <= 48810);

  // Stable across calls, and persisted to the port file.
  assert.equal(await allocatePort(cfg, a), portA);
  assert.equal(readAssignedPort(a), portA);
  assert.equal(readAssignedPort(b), portB);
});

test("allocatePort skips ports that are already in use", async () => {
  const cfg = makeConfig();
  cfg.accounts.c = { provider: "anthropic", configDir: path.join(tmp, "c") };
  saveConfig(cfg);
  const c = resolveAccount(cfg, "c");

  // Occupy the first port that would otherwise be picked.
  const aPort = readAssignedPort(resolveAccount(cfg, "a"));
  const bPort = readAssignedPort(resolveAccount(cfg, "b"));
  const firstFree = [48800, 48801, 48802].find(
    (p) => p !== aPort && p !== bPort
  );
  const server = net.createServer();
  await new Promise((resolve) => server.listen(firstFree, "127.0.0.1", resolve));

  const portC = await allocatePort(cfg, c);
  assert.notEqual(portC, firstFree);
  assert.notEqual(portC, aPort);
  assert.notEqual(portC, bPort);

  await new Promise((resolve) => server.close(resolve));
});

test("allocatePort throws when the range is exhausted", async () => {
  const cfg = makeConfig();
  cfg.portRange = [48800, 48800]; // Single port, already taken by account "a".
  cfg.accounts.d = { provider: "anthropic", configDir: path.join(tmp, "d") };
  const d = resolveAccount(cfg, "d");

  const aPort = readAssignedPort(resolveAccount(cfg, "a"));
  if (aPort !== 48800) {
    // Ensure the single port is reserved by another account either way.
    fs.mkdirSync(path.join(tmp, "a"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "a", ".costra-port"), "48800\n");
  }

  await assert.rejects(
    () => allocatePort(cfg, d),
    /No free ports in range 48800-48800/
  );
});
