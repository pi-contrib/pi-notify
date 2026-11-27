import { randomUUID } from "node:crypto";
import type { TmuxClient } from "./client.ts";

const frames = ["⣷", "⣯", "⣟", "⡿", "⢿", "⣻", "⣽", "⣾"];

export class TabStatus {
  private readonly token = randomUUID();
  private claimed = false;
  private closed = false;
  private failed = false;
  private working = false;
  private waiting = false;
  private frame = 0;
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<void> = Promise.resolve();
  private initializing: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly tmux: TmuxClient;

  constructor(tmux: TmuxClient) {
    this.tmux = tmux;
  }

  startSession(): Promise<void> {
    this.initializing = this.initialize();
    return this.initializing;
  }

  private async initialize(): Promise<void> {
    try {
      await this.tmux.resolveWindow();
      if (this.closed) return;
      await this.tmux.claimTabIndicator(this.token);
      this.claimed = true;
      this.render();
    } catch {
      this.failed = true;
    }
  }

  start(): void {
    if (this.closed || this.failed) return;
    this.working = true;
    this.frame = 0;
    this.render();
  }

  private busy = false;

  settled(): void {
    if (this.closed || this.failed) return;
    this.working = false;
    this.render();
  }

  waitingStarted(): void {
    if (this.closed || this.failed || this.waiting) return;
    this.waiting = true;
    this.render();
  }

  waitingEnded(): void {
    if (this.closed || this.failed || !this.waiting) return;
    this.waiting = false;
    this.render();
  }

  private render(): void {
    if (this.closed || this.failed || !this.claimed) return;
    this.stopTimer();
    this.generation++;
    if (this.waiting) {
      this.queue("❯", this.generation);
    } else if (this.working) {
      this.queue(frames[this.frame++ % frames.length], this.generation);
      this.timer = setInterval(() => {
        // Drop ticks while a tmux command is outstanding rather than queueing stale frames.
        if (!this.working || this.waiting || this.busy) return;
        this.queue(frames[this.frame++ % frames.length], this.generation);
      }, 100);
    } else {
      this.queue("⣿", this.generation);
    }
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private queue(value: string, generation: number): void {
    this.pending = this.pending.then(async () => {
      if (this.closed || this.failed || generation !== this.generation) return;
      this.busy = true;
      try {
        await this.tmux.setTabIndicator(this.token, value);
        // The guard is atomic with the write; subsequent redraw is harmless if superseded.
        await this.tmux.refreshStatus();
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
    if (!this.claimed) return;
    try {
      await this.tmux.clearTabIndicator(this.token);
      await this.tmux.refreshStatus();
    } catch {
      // A vanished tmux server or window must not block Pi shutdown.
    }
  }
}
