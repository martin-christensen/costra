import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The directory that holds costra's own config/state files.
 *
 * Follows the XDG Base Directory spec so everything lives together under one
 * roof (`~/.config/costra` by default), with two escape hatches:
 *   - `COSTRA_HOME`      - point costra's whole config dir somewhere else.
 *   - `XDG_CONFIG_HOME`  - honoured when absolute (spec says relative = ignore).
 */
export function configHome() {
  if (process.env.COSTRA_HOME) return process.env.COSTRA_HOME;
  const xdg = process.env.XDG_CONFIG_HOME;
  const base =
    xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "costra");
}

/** Make sure a file's parent directory exists before we write to it. */
export function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/**
 * Resolve one of costra's state files.
 *
 * An explicit `env` override always wins (used by tests and power users). When
 * we fall through to the default `<configHome>/<name>` location we also do a
 * one-time, best-effort migration of the legacy `~/.<legacy>` dotfile so old
 * installs move themselves on the first run without ever losing data.
 *
 * `isEmpty(raw)` is an optional predicate that reports whether a file's
 * contents are effectively empty/default. When given, a target that already
 * exists but is empty/default is still overwritten from a non-empty legacy
 * file — so a stray blank config left behind by an aborted run can't
 * permanently strand real data in the legacy location.
 */
export function statePath(name, { env, legacy, isEmpty } = {}) {
  if (env && process.env[env]) return process.env[env];
  const target = path.join(configHome(), name);
  if (legacy) migrateLegacy(path.join(os.homedir(), legacy), target, isEmpty);
  return target;
}

/** Read a file and run the emptiness predicate, defaulting on any failure. */
function readIsEmpty(file, isEmpty, onError) {
  try {
    return isEmpty(fs.readFileSync(file, "utf8"));
  } catch {
    return onError;
  }
}

function migrateLegacy(from, to, isEmpty) {
  try {
    if (!fs.existsSync(from)) return;
    if (fs.existsSync(to)) {
      // Target already present. Normally we leave it untouched. But if the
      // caller can tell an empty/default target apart from a real one, adopt
      // the legacy file when the target is empty and the legacy has data —
      // conservatively, we never overwrite a target that already holds data.
      if (!isEmpty) return;
      const targetEmpty = readIsEmpty(to, isEmpty, false);
      const legacyEmpty = readIsEmpty(from, isEmpty, true);
      if (!targetEmpty || legacyEmpty) return;
    }
    ensureDir(to);
    try {
      fs.renameSync(from, to);
    } catch (err) {
      // Different filesystem (EXDEV) or similar: fall back to copy + unlink.
      if (err && err.code === "EXDEV") {
        fs.copyFileSync(from, to);
        fs.rmSync(from, { force: true });
      } else {
        throw err;
      }
    }
  } catch {
    // Migration is best-effort: never let it break a real command.
  }
}
