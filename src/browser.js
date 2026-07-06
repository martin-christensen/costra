import { spawn } from "node:child_process";

/**
 * Open a URL in the default browser (best effort, non-blocking).
 * Failures are ignored — a missing opener must never break the launch.
 */
export function openInBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}
