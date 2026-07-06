import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const UPDATE_CACHE_PATH =
  process.env.COSTRA_UPDATE_CACHE ||
  path.join(os.homedir(), ".costra-update.json");

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check npm at most once a day.
const FETCH_TIMEOUT_MS = 5000;

function readPkg() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    fs.readFileSync(path.join(here, "..", "package.json"), "utf8")
  );
}

export function pkgVersion() {
  return readPkg().version;
}

export function pkgName() {
  return readPkg().name;
}

/**
 * True when `latest` is a strictly newer x.y.z version than `current`.
 * Prerelease suffixes are ignored; malformed input is treated as "not newer".
 */
export function isNewer(latest, current) {
  if (typeof latest !== "string" || typeof current !== "string") return false;
  const parse = (v) => v.trim().split("-")[0].split(".").map(Number);
  const a = parse(latest);
  const b = parse(current);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export function updateNotice(latest, current = pkgVersion()) {
  if (!isNewer(latest, current)) return null;
  return `costra: update available ${current} → ${latest} — run: npm install -g ${pkgName()}`;
}

export function readUpdateCache() {
  try {
    const cache = JSON.parse(fs.readFileSync(UPDATE_CACHE_PATH, "utf8"));
    return cache && typeof cache === "object" ? cache : null;
  } catch {
    return null;
  }
}

export function writeUpdateCache(latest) {
  fs.writeFileSync(
    UPDATE_CACHE_PATH,
    `${JSON.stringify({ latest, checkedAt: Date.now() }, null, 2)}\n`
  );
}

export async function fetchLatestVersion() {
  const name = pkgName().replace("/", "%2f"); // Scoped: @scope%2fname
  const res = await fetch(`https://registry.npmjs.org/${name}/latest`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`npm registry responded ${res.status}`);
  const { version } = await res.json();
  if (typeof version !== "string") {
    throw new Error("npm registry response had no version");
  }
  return version;
}

/** Fetch the latest published version and record it in the cache. */
export async function refreshUpdateCache() {
  const latest = await fetchLatestVersion();
  writeUpdateCache(latest);
  return latest;
}

/**
 * Passive update check, run on every command. Never blocks and never throws:
 * prints a notice (stderr) when the cached npm version is newer than ours,
 * and refreshes the cache in a detached background process when it is older
 * than a day. Set COSTRA_NO_UPDATE_CHECK=1 to disable entirely.
 */
export function maybeNotifyUpdate() {
  if (process.env.COSTRA_NO_UPDATE_CHECK) return;
  try {
    const cache = readUpdateCache();
    const notice = cache && updateNotice(cache.latest);
    if (notice) console.error(notice);
    const fresh =
      cache &&
      Number.isFinite(cache.checkedAt) &&
      Date.now() - cache.checkedAt < CHECK_INTERVAL_MS;
    if (fresh) return;
    const worker = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "update-check.js"
    );
    spawn(process.execPath, [worker], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    }).unref();
  } catch {
    // The update check must never break a real command.
  }
}
