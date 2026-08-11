import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "costra-pxpipe-test-"));
process.env.COSTRA_PXPIPE_CACHE = path.join(tmp, "pxpipe.json");
delete process.env.COSTRA_PXPIPE_VERSION;
delete process.env.COSTRA_NO_UPDATE_CHECK;

const {
  PXPIPE_PACKAGE,
  PXPIPE_STATE_PATH,
  readPxpipeState,
  writePxpipeState,
  pxpipeSpec,
  resolvePxpipeSpec,
  pxpipeNotice,
} = await import("../src/pxpipe.js");

// A fresh, up-to-date state so resolvePxpipeSpec never touches the network.
function seed(state) {
  writePxpipeState({ checkedAt: Date.now(), ...state });
}

const yes = async () => true;
const no = async () => false;
const explode = async () => {
  throw new Error("prompt should not be called");
};

test("PXPIPE_STATE_PATH honours COSTRA_PXPIPE_CACHE", () => {
  assert.equal(PXPIPE_STATE_PATH, path.join(tmp, "pxpipe.json"));
});

test("write/readPxpipeState roundtrip", () => {
  writePxpipeState({ pinned: "0.13.0", latest: "0.13.0", checkedAt: 123 });
  const state = readPxpipeState();
  assert.equal(state.pinned, "0.13.0");
  assert.equal(state.checkedAt, 123);
});

test("readPxpipeState returns null when absent", () => {
  fs.rmSync(PXPIPE_STATE_PATH, { force: true });
  assert.equal(readPxpipeState(), null);
});

test("pxpipeSpec builds pinned / bare / env-forced targets", () => {
  assert.equal(pxpipeSpec({ pinned: "0.13.0" }), "pxpipe-proxy@0.13.0");
  assert.equal(pxpipeSpec({}), PXPIPE_PACKAGE);
  process.env.COSTRA_PXPIPE_VERSION = "9.9.9";
  assert.equal(pxpipeSpec({ pinned: "0.13.0" }), "pxpipe-proxy@9.9.9");
  delete process.env.COSTRA_PXPIPE_VERSION;
});

test("COSTRA_PXPIPE_VERSION forces the spec and skips checks", async () => {
  process.env.COSTRA_PXPIPE_VERSION = "1.2.3";
  const spec = await resolvePxpipeSpec({ interactive: true, prompt: explode });
  assert.equal(spec, "pxpipe-proxy@1.2.3");
  delete process.env.COSTRA_PXPIPE_VERSION;
});

test("no newer version available → keeps pin, never prompts", async () => {
  seed({ pinned: "0.14.0", latest: "0.14.0" });
  const spec = await resolvePxpipeSpec({ interactive: true, prompt: explode });
  assert.equal(spec, "pxpipe-proxy@0.14.0");
});

test("interactive accept re-pins to the newer version", async () => {
  seed({ pinned: "0.13.0", latest: "0.14.0" });
  const spec = await resolvePxpipeSpec({ interactive: true, prompt: yes });
  assert.equal(spec, "pxpipe-proxy@0.14.0");
  assert.equal(readPxpipeState().pinned, "0.14.0");
});

test("interactive decline keeps pin and records the declined version", async () => {
  seed({ pinned: "0.13.0", latest: "0.14.0" });
  const spec = await resolvePxpipeSpec({ interactive: true, prompt: no });
  assert.equal(spec, "pxpipe-proxy@0.13.0");
  const state = readPxpipeState();
  assert.equal(state.pinned, "0.13.0");
  assert.equal(state.declined, "0.14.0");

  // Already declined → do not prompt again for the same version.
  const again = await resolvePxpipeSpec({ interactive: true, prompt: explode });
  assert.equal(again, "pxpipe-proxy@0.13.0");
});

test("non-interactive keeps the pin without prompting", async () => {
  seed({ pinned: "0.13.0", latest: "0.14.0" });
  const spec = await resolvePxpipeSpec({ interactive: false, prompt: explode });
  assert.equal(spec, "pxpipe-proxy@0.13.0");
  assert.equal(readPxpipeState().pinned, "0.13.0");
});

test("pxpipeNotice mentions both versions and the update command", () => {
  const notice = pxpipeNotice("0.13.0", "0.14.0");
  assert.match(notice, /0\.13\.0/);
  assert.match(notice, /0\.14\.0/);
  assert.match(notice, /costra proxy update/);
});
