import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { statePath } from "../src/paths.js";

// A minimal emptiness predicate mirroring the one config.js uses: a JSON blob
// with no `accounts` is "empty".
const isEmpty = (raw) => {
  try {
    const accounts = JSON.parse(raw)?.accounts;
    return !accounts || Object.keys(accounts).length === 0;
  } catch {
    return false;
  }
};

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "costra-paths-home-"));
  const legacyHome = fs.mkdtempSync(path.join(os.tmpdir(), "costra-paths-legacy-"));
  // migrateLegacy resolves the legacy file under os.homedir(); point HOME at a
  // scratch dir so we never touch the real dotfiles.
  const prevHome = process.env.HOME;
  const prevCostraHome = process.env.COSTRA_HOME;
  process.env.HOME = legacyHome;
  process.env.COSTRA_HOME = home;
  return {
    home,
    legacy: path.join(legacyHome, ".costra.json"),
    target: path.join(home, "config.json"),
    restore() {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevCostraHome === undefined) delete process.env.COSTRA_HOME;
      else process.env.COSTRA_HOME = prevCostraHome;
    },
  };
}

const WITH_ACCOUNTS = JSON.stringify({ accounts: { oda: { provider: "anthropic" } } });
const NO_ACCOUNTS = JSON.stringify({ accounts: {} });

test("migrates a legacy file when no target exists yet", () => {
  const s = sandbox();
  try {
    fs.writeFileSync(s.legacy, WITH_ACCOUNTS);
    const resolved = statePath("config.json", { legacy: ".costra.json", isEmpty });
    assert.equal(resolved, s.target);
    assert.equal(fs.readFileSync(s.target, "utf8"), WITH_ACCOUNTS);
    assert.equal(fs.existsSync(s.legacy), false, "legacy file is moved, not left behind");
  } finally {
    s.restore();
  }
});

test("adopts the legacy file when the target exists but is empty", () => {
  const s = sandbox();
  try {
    fs.mkdirSync(s.home, { recursive: true });
    fs.writeFileSync(s.target, NO_ACCOUNTS); // stray blank config from an aborted run
    fs.writeFileSync(s.legacy, WITH_ACCOUNTS);
    statePath("config.json", { legacy: ".costra.json", isEmpty });
    assert.equal(fs.readFileSync(s.target, "utf8"), WITH_ACCOUNTS);
    assert.equal(fs.existsSync(s.legacy), false);
  } finally {
    s.restore();
  }
});

test("never overwrites a target that already has accounts", () => {
  const s = sandbox();
  try {
    const existing = JSON.stringify({ accounts: { keep: { provider: "openai" } } });
    fs.mkdirSync(s.home, { recursive: true });
    fs.writeFileSync(s.target, existing);
    fs.writeFileSync(s.legacy, WITH_ACCOUNTS);
    statePath("config.json", { legacy: ".costra.json", isEmpty });
    assert.equal(fs.readFileSync(s.target, "utf8"), existing);
    assert.equal(fs.existsSync(s.legacy), true, "legacy is left untouched when target has data");
  } finally {
    s.restore();
  }
});

test("does not adopt when both target and legacy are empty", () => {
  const s = sandbox();
  try {
    fs.mkdirSync(s.home, { recursive: true });
    fs.writeFileSync(s.target, NO_ACCOUNTS);
    fs.writeFileSync(s.legacy, NO_ACCOUNTS);
    statePath("config.json", { legacy: ".costra.json", isEmpty });
    // legacy must survive: an empty legacy carries no data worth migrating.
    assert.equal(fs.existsSync(s.legacy), true);
  } finally {
    s.restore();
  }
});

test("without isEmpty, an existing target is left untouched (unchanged behaviour)", () => {
  const s = sandbox();
  try {
    fs.mkdirSync(s.home, { recursive: true });
    fs.writeFileSync(s.target, NO_ACCOUNTS);
    fs.writeFileSync(s.legacy, WITH_ACCOUNTS);
    statePath("config.json", { legacy: ".costra.json" });
    assert.equal(fs.readFileSync(s.target, "utf8"), NO_ACCOUNTS);
    assert.equal(fs.existsSync(s.legacy), true);
  } finally {
    s.restore();
  }
});
