import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "costra-version-test-"));
process.env.COSTRA_UPDATE_CACHE = path.join(tmp, "update.json");
process.env.COSTRA_NO_UPDATE_CHECK = "1"; // Keep tests offline/hermetic.

const {
  UPDATE_CACHE_PATH,
  pkgVersion,
  pkgName,
  isNewer,
  updateNotice,
  readUpdateCache,
  writeUpdateCache,
  maybeNotifyUpdate,
} = await import("../src/version.js");

test("UPDATE_CACHE_PATH honours COSTRA_UPDATE_CACHE", () => {
  assert.equal(UPDATE_CACHE_PATH, path.join(tmp, "update.json"));
});

test("pkgVersion/pkgName read package.json", () => {
  assert.match(pkgVersion(), /^\d+\.\d+\.\d+/);
  assert.equal(pkgName(), "@martin-christensen/costra");
});

test("isNewer compares semver-ish versions", () => {
  assert.equal(isNewer("1.0.1", "1.0.0"), true);
  assert.equal(isNewer("1.1.0", "1.0.9"), true);
  assert.equal(isNewer("2.0.0", "1.9.9"), true);
  assert.equal(isNewer("1.0.0", "1.0.0"), false);
  assert.equal(isNewer("1.0.0", "1.0.1"), false);
  assert.equal(isNewer("1.0.0-beta.1", "1.0.0"), false); // Prerelease ignored.
  assert.equal(isNewer("1.0", "1.0.0"), false); // Short form pads with zeros.
  assert.equal(isNewer("1.1", "1.0.5"), true);
  assert.equal(isNewer(null, "1.0.0"), false);
  assert.equal(isNewer("garbage", "1.0.0"), false);
});

test("updateNotice mentions both versions and the install command", () => {
  const notice = updateNotice("99.0.0", "1.0.0");
  assert.match(notice, /1\.0\.0/);
  assert.match(notice, /99\.0\.0/);
  assert.match(notice, /npm install -g @martin-christensen\/costra/);
  assert.equal(updateNotice("1.0.0", "1.0.0"), null);
  assert.equal(updateNotice("0.9.0", "1.0.0"), null);
});

test("writeUpdateCache/readUpdateCache roundtrip", () => {
  writeUpdateCache("2.3.4");
  const cache = readUpdateCache();
  assert.equal(cache.latest, "2.3.4");
  assert.ok(Number.isFinite(cache.checkedAt));
  assert.ok(Math.abs(Date.now() - cache.checkedAt) < 5000);
});

test("readUpdateCache returns null for missing or corrupt cache", () => {
  fs.rmSync(UPDATE_CACHE_PATH, { force: true });
  assert.equal(readUpdateCache(), null);
  fs.writeFileSync(UPDATE_CACHE_PATH, "not json");
  assert.equal(readUpdateCache(), null);
});

test("maybeNotifyUpdate is a no-op when COSTRA_NO_UPDATE_CHECK is set", () => {
  fs.rmSync(UPDATE_CACHE_PATH, { force: true });
  maybeNotifyUpdate(); // Would spawn a background worker if enabled.
  assert.equal(fs.existsSync(UPDATE_CACHE_PATH), false);
});
