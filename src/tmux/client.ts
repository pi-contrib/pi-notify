import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export type Run = (args: string[]) => Promise<string>;

function tmuxRunner(socket: string): Run {
  return async (args) => {
    const { stdout } = await execFileAsync("tmux", ["-S", socket, ...args], {
      timeout: 2000,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  };
}

export class TmuxClient {
  private window?: string;
  readonly pane: string;
  private readonly run: Run;

  constructor(run: Run, pane: string) {
    this.run = run;
    this.pane = pane;
  }

  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    runFactory: (socket: string) => Run = tmuxRunner,
  ): TmuxClient | undefined {
    const match = env.TMUX?.match(/^(.*),\d+,\d+$/);
    const pane = env.TMUX_PANE;
    if (!match?.[1] || !pane || !/^%\d+$/.test(pane)) return undefined;
    return new TmuxClient(runFactory(match[1]), pane);
  }

  async resolveWindow(): Promise<void> {
    const window = (
      await this.run(["display-message", "-p", "-t", this.pane, "#{window_id}"])
    ).trim();
    if (!/^@\d+$/.test(window)) throw new Error("Invalid tmux window ID");
    this.window = window;
  }

  private windowId(): string {
    if (!this.window) throw new Error("tmux window has not been resolved");
    return this.window;
  }

  async claimTabIndicator(token: string): Promise<void> {
    await this.run([
      "set-option",
      "-w",
      "-t",
      this.windowId(),
      "@pi_notify_owner",
      token,
    ]);
  }

  // if-shell -F evaluates a tmux format and executes a tmux command (not a shell).
  // Guard each mutation atomically against a newer Pi instance taking over the window.
  private async ifOwner(token: string, command: string): Promise<void> {
    await this.run([
      "if-shell",
      "-F",
      "-t",
      this.windowId(),
      `#{==:#{@pi_notify_owner},${token}}`,
      command,
    ]);
  }

  async setTabIndicator(token: string, value: string): Promise<void> {
    const window = this.windowId();
    await this.ifOwner(
      token,
      `set-option -w -t ${window} @pi_notify_status ${value}`,
    );
  }

  async clearTabIndicator(token: string): Promise<void> {
    const window = this.windowId();
    await this.ifOwner(
      token,
      `set-option -w -u -t ${window} @pi_notify_status`,
    );
    await this.ifOwner(token, `set-option -w -u -t ${window} @pi_notify_owner`);
  }

  async refreshStatus(): Promise<void> {
    // A subprocess has no "current client"; explicitly target attached clients.
    // Detached sessions need no redraw, and redraw failure must not stop status updates.
    try {
      const clients = (await this.run(["list-clients", "-F", "#{client_name}"]))
        .trim()
        .split("\n")
        .filter(Boolean);
      for (const client of clients) {
        try {
          await this.run(["refresh-client", "-S", "-t", client]);
        } catch {
          // Client may detach while the status is being updated.
        }
      }
    } catch {
      // A detached or exiting tmux server has no clients to refresh.
    }
  }
}
