import assert from "node:assert/strict";
import { test } from "node:test";
import { TmuxClient } from "./tmux/client.ts";
import { TabStatus } from "./tmux/status.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createStatus = (run) => new TabStatus(new TmuxClient(run, "%2"));

function fakeTmux() {
  const options = new Map();
  const calls = [];
  let blocked;
  let release;
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "display-message") return "@9\n";
    if (args[0] === "list-clients") return "client\n";
    if (args[0] === "set-option") {
      options.set(args[4], args[5]);
      return "";
    }
    if (args[0] === "if-shell") {
      if (blocked) {
        blocked();
        await new Promise((resolve) => {
          release = resolve;
        });
        blocked = undefined;
      }
      const owner = args[4].match(/,([^}]+)}$/)?.[1];
      if (options.get("@pi_notify_owner") !== owner) return "";
      const command = args[5].split(" ");
      if (command.includes("-u")) options.delete(command.at(-1));
      else options.set(command.at(-2), command.at(-1));
    }
    return "";
  };
  return {
    options,
    calls,
    run,
    blockNext: () =>
      new Promise((resolve) => {
        blocked = resolve;
      }),
    unblock: () => release(),
  };
}

test("location and target validation", async () => {
  assert.equal(TmuxClient.fromEnv({}), undefined);
  const client = TmuxClient.fromEnv(
    { TMUX: "/tmp/socket,123,0", TMUX_PANE: "%2" },
    (socket) => {
      assert.equal(socket, "/tmp/socket");
      return async () => "@9\n";
    },
  );
  assert.equal(client?.pane, "%2");
  await client.resolveWindow();
  assert.equal(
    TmuxClient.fromEnv({ TMUX: "/tmp/socket,123,0", TMUX_PANE: "bad" }),
    undefined,
  );
  await assert.rejects(new TmuxClient(async () => "bad", "%2").resolveWindow());
  await assert.rejects(
    new TmuxClient(async () => "", "%2").claimTabIndicator("token"),
  );
});

test("start, intermediate end, settle, and shutdown only touch owned options", async () => {
  const tmux = fakeTmux();
  const status = createStatus(tmux.run);
  await status.startSession();
  await sleep(5);
  assert.equal(tmux.options.get("@pi_notify_status"), "✓");
  status.start();
  await sleep(10);
  assert.equal(tmux.options.get("@pi_notify_status"), "□");
  await sleep(520);
  assert.equal(tmux.options.get("@pi_notify_status"), "■");
  status.settled(); // also used for aborted runs
  await sleep(10);
  assert.equal(tmux.options.get("@pi_notify_status"), "✓");
  await status.shutdown();
  assert.equal(tmux.options.size, 0);
  assert.equal(
    tmux.calls.filter((args) => args[0] === "display-message").length,
    1,
  );
  assert.ok(
    tmux.calls.some((args) => args[0] === "if-shell" && args[3] === "@9"),
  );
  assert.ok(
    tmux.calls.some(
      (args) =>
        args[0] === "refresh-client" &&
        args[1] === "-S" &&
        args[3] === "client",
    ),
  );
  assert.ok(
    tmux.calls.every(
      (args) =>
        !args.includes("window-status-format") &&
        !args.includes("automatic-rename"),
    ),
  );
});

test("late spinner cannot overwrite settled or shutdown status", async () => {
  const tmux = fakeTmux();
  const status = createStatus(tmux.run);
  await status.startSession();
  await sleep(5);
  const entered = tmux.blockNext();
  status.start();
  await entered;
  status.settled();
  tmux.unblock();
  await sleep(10);
  assert.equal(tmux.options.get("@pi_notify_status"), "✓");
  status.start();
  await status.shutdown();
  assert.equal(tmux.options.size, 0);
});

test("old instance cannot clear newer instance's status", async () => {
  const tmux = fakeTmux();
  const old = createStatus(tmux.run);
  const newer = createStatus(tmux.run);
  await old.startSession();
  await newer.startSession();
  await sleep(10);
  const owner = tmux.options.get("@pi_notify_owner");
  old.start();
  await old.shutdown();
  assert.equal(tmux.options.get("@pi_notify_owner"), owner);
  assert.equal(tmux.options.get("@pi_notify_status"), "✓");
  await newer.shutdown();
  assert.equal(tmux.options.size, 0);
});

test("failed discovery or tmux update leaves Pi usable", async () => {
  const calls = [];
  const status = createStatus(async (args) => {
    calls.push(args);
    throw new Error("no tmux");
  });
  await status.startSession();
  status.start();
  status.settled();
  await status.shutdown();
  assert.equal(calls.length, 1);
  const tmux = fakeTmux();
  const bad = createStatus(async (args) => {
    if (
      args[0] === "if-shell" &&
      args[5].includes("@pi_notify_status") &&
      !args[5].includes("-u")
    )
      throw new Error("failed");
    return tmux.run(args);
  });
  await bad.startSession();
  await sleep(5);
  await bad.shutdown();
  assert.equal(tmux.options.size, 0);
});
