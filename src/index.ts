import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TmuxClient } from "./tmux/client.ts";
import { TabStatus } from "./tmux/status.ts";

export default function (pi: ExtensionAPI): void {
  let status: TabStatus | undefined;

  pi.on("session_start", async () => {
    const tmux = TmuxClient.fromEnv();
    if (!tmux) return;
    status = new TabStatus(tmux);
    await status.startSession();
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
