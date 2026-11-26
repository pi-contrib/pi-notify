import { randomUUID } from "node:crypto";
import { ifOwner, type Run, redraw, resolveWindow } from "./runner.ts";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class TabStatus {
  private readonly token = randomUUID();
  private window?: string;
  private claimed = false;
  private closed = false;
  private failed = false;
  private working = false;
  private frame = 0;
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<void> = Promise.resolve();
  private initializing: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly run: Run;

  constructor(run: Run) {
    this.run = run;
  }

  startSession(pane: string): Promise<void> {
    this.initializing = this.initialize(pane);
    return this.initializing;
  }

  private async initialize(pane: string): Promise<void> {
    try {
      const window = await resolveWindow(this.run, pane);
      if (this.closed) return;
      this.window = window;
      await this.run([
        "set-option",
        "-w",
        "-t",
        window,
        "@pi_notify_owner",
        this.token,
      ]);
      this.claimed = true;
      if (!this.closed) this.settled();
    } catch {
      this.failed = true;
    }
  }

  start(): void {
    if (this.closed || this.failed || !this.claimed) return;
    this.stopTimer();
    this.working = true;
    this.generation++;
    this.frame = 0;
    this.queue(frames[this.frame++], this.generation);
    this.timer = setInterval(() => {
      // Drop ticks while a tmux command is outstanding rather than queueing stale frames.
      if (!this.working || this.busy) return;
      this.queue(frames[this.frame++ % frames.length], this.generation);
    }, 500);
  }

  private busy = false;

  settled(): void {
    if (this.closed || this.failed || !this.claimed) return;
    this.stopTimer();
    this.working = false;
    this.generation++;
    this.queue("✓", this.generation);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private queue(value: string, generation: number): void {
    this.pending = this.pending.then(async () => {
      if (
        this.closed ||
        this.failed ||
        generation !== this.generation ||
        !this.window
      )
        return;
      this.busy = true;
      try {
        await ifOwner(
          this.run,
          this.window,
          this.token,
          `set-option -w -t ${this.window} @pi_notify_status ${value}`,
        );
        // The guard is atomic with the write; subsequent redraw is harmless if superseded.
        await redraw(this.run);
      } catch {
        this.failed = true;
        this.stopTimer();
      } finally {
        this.busy = false;
      }
    });
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopTimer();
    await this.initializing;
    await this.pending;
    if (!this.claimed || !this.window) return;
    try {
      await ifOwner(
        this.run,
        this.window,
        this.token,
        `set-option -w -u -t ${this.window} @pi_notify_status`,
      );
      await ifOwner(
        this.run,
        this.window,
        this.token,
        `set-option -w -u -t ${this.window} @pi_notify_owner`,
      );
      await redraw(this.run);
    } catch {
      // A vanished tmux server or window must not block Pi shutdown.
    }
  }
}
