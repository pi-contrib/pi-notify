import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export type Run = (args: string[]) => Promise<string>;

export function tmuxRunner(socket: string): Run {
  return async (args) => {
    const { stdout } = await execFileAsync("tmux", ["-S", socket, ...args], {
      timeout: 2000,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  };
}

export function tmuxLocation(
  env: NodeJS.ProcessEnv = process.env,
): { socket: string; pane: string } | undefined {
  const match = env.TMUX?.match(/^(.*),\d+,\d+$/);
  const pane = env.TMUX_PANE;
  if (!match?.[1] || !pane || !/^%\d+$/.test(pane)) return undefined;
  return { socket: match[1], pane };
}

export async function resolveWindow(run: Run, pane: string): Promise<string> {
  const window = (
    await run(["display-message", "-p", "-t", pane, "#{window_id}"])
  ).trim();
  if (!/^@\d+$/.test(window)) throw new Error("Invalid tmux window ID");
  return window;
}

// if-shell -F evaluates a tmux format and executes a tmux command (not a shell).
// Guard each mutation atomically against a newer Pi instance taking over the window.
export async function ifOwner(
  run: Run,
  window: string,
  token: string,
  command: string,
): Promise<void> {
  await run([
    "if-shell",
    "-F",
    "-t",
    window,
    `#{==:#{@pi_notify_owner},${token}}`,
    command,
  ]);
}

export async function redraw(run: Run): Promise<void> {
  // A subprocess has no "current client"; explicitly target attached clients.
  // Detached sessions need no redraw, and redraw failure must not stop status updates.
  try {
    const clients = (await run(["list-clients", "-F", "#{client_name}"]))
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const client of clients) {
      try {
        await run(["refresh-client", "-S", "-t", client]);
      } catch {
        // Client may detach while the status is being updated.
      }
    }
  } catch {
    // A detached or exiting tmux server has no clients to refresh.
  }
}
