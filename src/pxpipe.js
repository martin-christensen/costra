// pxpipe-proxy version management.
//
// costra launches the proxy through `npx pxpipe-proxy`. Bare `npx <pkg>` reuses
// whatever it first cached and never re-checks the registry, so an account can
// silently freeze on a stale pxpipe-proxy. To stay in sync we pin an explicit
// version (`npx pxpipe-proxy@<pinned>`) and, when a newer one is published,
// pause and let the user choose to update before the proxy starts.
//
// The pin is deliberately NOT hard-coded in source — costra works with any
// pxpipe-proxy version. It lives in a small state file under costra's config
// dir (or is forced via COSTRA_PXPIPE_VERSION), so upgrades never require a
// costra release.

import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { fetchNpmLatest, isNewer } from "./version.js";
import { ensureDir, statePath } from "./paths.js";

export const PXPIPE_PACKAGE = "pxpipe-proxy";

export const PXPIPE_STATE_PATH = statePath("pxpipe.json", {
  env: "COSTRA_PXPIPE_CACHE",
  legacy: ".costra-pxpipe.json",
});

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check npm at most once a day.

export function readPxpipeState() {
  try {
    const state = JSON.parse(fs.readFileSync(PXPIPE_STATE_PATH, "utf8"));
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

export function writePxpipeState(state) {
  ensureDir(PXPIPE_STATE_PATH);
  fs.writeFileSync(
    PXPIPE_STATE_PATH,
    `${JSON.stringify(state, null, 2)}\n`
  );
  return state;
}

/**
 * The npx target to launch. An explicit COSTRA_PXPIPE_VERSION always wins;
 * otherwise the pinned version from state. Falls back to the bare package name
 * only before anything has ever been pinned (first run, resolved immediately).
 */
export function pxpipeSpec(state = readPxpipeState()) {
  const version = process.env.COSTRA_PXPIPE_VERSION || state?.pinned;
  return version ? `${PXPIPE_PACKAGE}@${version}` : PXPIPE_PACKAGE;
}

function isFresh(state) {
  return (
    state &&
    Number.isFinite(state.checkedAt) &&
    Date.now() - state.checkedAt < CHECK_INTERVAL_MS
  );
}

/**
 * Best-effort refresh of the cached `latest`. Never throws: on a registry
 * hiccup we keep the previously known `latest` but still stamp `checkedAt` so
 * we don't hammer the network on every command.
 */
async function refreshLatest(state) {
  try {
    const latest = await fetchNpmLatest(PXPIPE_PACKAGE);
    return writePxpipeState({ ...state, latest, checkedAt: Date.now() });
  } catch {
    return writePxpipeState({ ...state, checkedAt: Date.now() });
  }
}

export function pxpipeNotice(pinned, latest) {
  return `costra: pxpipe-proxy update available ${pinned} → ${latest} — run: costra proxy update`;
}

async function defaultPrompt(pinned, latest) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(
      `costra: pxpipe-proxy ${pinned} → ${latest} is available. Update now? [Y/n] `
    );
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "" || trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Resolve the pxpipe-proxy spec to launch (`pxpipe-proxy@x.y.z`), keeping the
 * pin in sync with npm.
 *
 *   - COSTRA_PXPIPE_VERSION forces a version and skips all checks.
 *   - First ever run resolves `latest` and pins it (deterministic launches).
 *   - When a newer version is published:
 *       * interactive → prompt; on "yes" re-pin, on "no" remember the decline
 *         (so we don't nag again until an even newer version ships);
 *       * non-interactive → print a one-line notice, keep the current pin.
 *
 * Never throws and never blocks on the network beyond the daily check; offline
 * launches proceed on the current pin.
 *
 * @returns {Promise<string>} the npx target argument.
 */
export async function resolvePxpipeSpec({
  interactive = false,
  prompt = defaultPrompt,
  force = false,
} = {}) {
  if (process.env.COSTRA_PXPIPE_VERSION) return pxpipeSpec();

  let state = readPxpipeState() || {};

  // First run: pin whatever is current so future launches are deterministic.
  if (!state.pinned) {
    state = await refreshLatest(state);
    if (state.latest) state = writePxpipeState({ ...state, pinned: state.latest });
    return pxpipeSpec(state);
  }

  const checkDisabled = process.env.COSTRA_NO_UPDATE_CHECK;
  if (force || (!checkDisabled && !isFresh(state))) {
    state = await refreshLatest(state);
  }

  const { pinned, latest, declined } = state;
  if (latest && isNewer(latest, pinned) && (force || latest !== declined)) {
    if (interactive) {
      if (await prompt(pinned, latest)) {
        writePxpipeState({ ...state, pinned: latest, declined: null });
        return `${PXPIPE_PACKAGE}@${latest}`;
      }
      writePxpipeState({ ...state, declined: latest });
    } else if (!checkDisabled) {
      console.error(pxpipeNotice(pinned, latest));
    }
  }
  return `${PXPIPE_PACKAGE}@${pinned}`;
}

/**
 * Explicit, forced check-and-update used by `costra proxy update`. Resolves the
 * newest published version and re-pins to it. Returns {from, to, changed}.
 */
export async function updatePxpipeNow() {
  const before = readPxpipeState() || {};
  const latest = await fetchNpmLatest(PXPIPE_PACKAGE);
  const from = before.pinned ?? null;
  writePxpipeState({
    ...before,
    pinned: latest,
    latest,
    declined: null,
    checkedAt: Date.now(),
  });
  return { from, to: latest, changed: from !== latest };
}
