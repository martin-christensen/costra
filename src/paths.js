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
 */
export function statePath(name, { env, legacy } = {}) {
  if (env && process.env[env]) return process.env[env];
  const target = path.join(configHome(), name);
  if (legacy) migrateLegacy(path.join(os.homedir(), legacy), target);
  return target;
}

function migrateLegacy(from, to) {
  try {
    if (fs.existsSync(to) || !fs.existsSync(from)) return;
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
