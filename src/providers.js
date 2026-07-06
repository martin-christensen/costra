/**
 * Provider presets. Each preset knows which CLI to launch, which env var
 * carries the API base URL, and which env var points the CLI at an
 * account-specific config directory (this is what isolates accounts).
 */
export const PROVIDERS = {
  anthropic: {
    cli: "claude",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    configDirEnv: "CLAUDE_CONFIG_DIR",
    configDirPrefix: ".config-claude-",
  },
  openai: {
    cli: "codex",
    baseUrlEnv: "OPENAI_BASE_URL",
    configDirEnv: "CODEX_HOME",
    configDirPrefix: ".config-codex-",
  },
};

export function getProvider(name) {
  const preset = PROVIDERS[name];
  if (!preset) {
    const known = Object.keys(PROVIDERS).join(", ");
    throw new Error(`Unknown provider "${name}". Known providers: ${known}`);
  }
  return preset;
}
