import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isPortInUse } from "./ports.js";

function pidFilePath(account) {
  return path.join(account.configDir, ".costra-proxy.pid");
}

export function proxyEnv(account, port) {
  return {
    ...process.env,
    PORT: String(port),
    [account.configDirEnv]: account.configDir,
  };
}

/**
 * Make sure a pxpipe proxy is listening on the account's port.
 * Starts one in the background (detached, logging to pxpipe.log in the
 * account config dir) when nothing is listening yet.
 */
export async function ensureProxy(account, port, { waitMs = 15000 } = {}) {
  if (await isPortInUse(port)) {
    return { started: false, port };
  }

  fs.mkdirSync(account.configDir, { recursive: true });
  const logPath = path.join(account.configDir, "pxpipe.log");
  const log = fs.openSync(logPath, "a");
  const child = spawn("npx", ["pxpipe-proxy"], {
    detached: true,
    stdio: ["ignore", log, log],
    env: proxyEnv(account, port),
  });
  fs.writeFileSync(pidFilePath(account), `${child.pid}\n`);
  child.unref();
  fs.closeSync(log);

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await isPortInUse(port)) {
      return { started: true, port };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `pxpipe proxy did not start listening on port ${port} within ${waitMs / 1000}s (see ${logPath})`
  );
}

/** Stop the background proxy for an account. Returns true if a process was signalled. */
export function stopProxy(account) {
  const file = pidFilePath(account);
  if (!fs.existsSync(file)) return false;
  const pid = Number(fs.readFileSync(file, "utf8").trim());
  fs.rmSync(file, { force: true });
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false; // Already gone.
  }
}
