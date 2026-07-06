import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { resolveAccount } from "./config.js";

/** True if something is listening on 127.0.0.1:port. */
export function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

export function portFilePath(account) {
  return path.join(account.configDir, ".costra-port");
}

export function readAssignedPort(account) {
  const file = portFilePath(account);
  if (!fs.existsSync(file)) return null;
  const port = Number(fs.readFileSync(file, "utf8").trim());
  return Number.isInteger(port) && port > 0 ? port : null;
}

/**
 * Return the account's stable port, allocating the first free one in the
 * configured range on first use. Ports already assigned to other accounts
 * are skipped even when their proxies are not currently running.
 */
export async function allocatePort(cfg, account) {
  const existing = readAssignedPort(account);
  if (existing !== null) return existing;

  const reserved = new Set();
  for (const name of Object.keys(cfg.accounts)) {
    if (name === account.name) continue;
    try {
      const other = resolveAccount(cfg, name);
      const port = readAssignedPort(other);
      if (port !== null) reserved.add(port);
    } catch {
      // Ignore misconfigured accounts while scanning.
    }
  }

  const [lo, hi] = cfg.portRange;
  for (let port = lo; port <= hi; port++) {
    if (reserved.has(port)) continue;
    if (await isPortInUse(port)) continue;
    fs.mkdirSync(account.configDir, { recursive: true });
    fs.writeFileSync(portFilePath(account), `${port}\n`);
    return port;
  }
  throw new Error(`No free ports in range ${lo}-${hi}`);
}
