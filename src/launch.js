import { spawn } from "node:child_process";

/**
 * Launch the account's CLI (claude, codex, ...) wired to the local proxy.
 * Inherits stdio and mirrors the child's exit code.
 */
export function launchCli(account, port, extraArgs = []) {
  const env = {
    ...process.env,
    [account.configDirEnv]: account.configDir,
    [account.baseUrlEnv]: `http://127.0.0.1:${port}`,
  };
  const args = [
    ...(account.model ? ["--model", account.model] : []),
    ...extraArgs,
  ];
  const child = spawn(account.cli, args, { stdio: "inherit", env });
  child.on("error", (err) => {
    console.error(`costra: failed to launch "${account.cli}": ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}
