import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { tmuxLocation, tmuxRunner } from "./tmux/runner.ts";
import { TabStatus } from "./tmux/status.ts";

export default function (pi: ExtensionAPI): void {
  let status: TabStatus | undefined;

  pi.on("session_start", async () => {
    const location = tmuxLocation();
    if (!location) return;
    status = new TabStatus(tmuxRunner(location.socket));
    await status.startSession(location.pane);
  });

  pi.on("agent_start", () => status?.start());
  // agent_end may be followed by retries or queued work; wait for final settlement.
  pi.on("agent_settled", () => status?.settled());
  pi.on("session_shutdown", async () => {
    const current = status;
    status = undefined;
    await current?.shutdown();
  });
}
