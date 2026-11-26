import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(
    env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "pi-notify",
    "config.json",
  );
}

export async function tmuxEnabled(path = configPath()): Promise<boolean> {
  try {
    const config: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof config !== "object" || config === null) return true;
    const tmux = (config as Record<string, unknown>).tmux;
    if (typeof tmux !== "object" || tmux === null) return true;
    return (tmux as Record<string, unknown>).enabled !== false;
  } catch {
    // A missing or invalid file must never prevent Pi from starting.
    return true;
  }
}
