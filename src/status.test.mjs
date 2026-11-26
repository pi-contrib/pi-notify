import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configPath, tmuxEnabled } from "./config.ts";
import { resolveWindow, tmuxLocation } from "./tmux/runner.ts";
import { TabStatus } from "./tmux/status.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

test("config defaults on and only explicit false disables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-notify-"));
  const path = join(dir, "config.json");
  assert.equal(
    configPath({ XDG_CONFIG_HOME: dir }),
    join(dir, "pi-notify", "config.json"),
  );
  assert.equal(await tmuxEnabled(path), true);
  for (const [text, expected] of [
    ['{"tmux":{"enabled":false}}', false],
    ['{"tmux":{"enabled":true}}', true],
    ["{}", true],
    ["broken", true],
  ]) {
    await writeFile(path, text);
    assert.equal(await tmuxEnabled(path), expected);
  }
});

test("location and target validation", async () => {
  assert.equal(tmuxLocation({}), undefined);
  assert.deepEqual(
    tmuxLocation({ TMUX: "/tmp/socket,123,0", TMUX_PANE: "%2" }),
    { socket: "/tmp/socket", pane: "%2" },
  );
  assert.equal(
    tmuxLocation({ TMUX: "/tmp/socket,123,0", TMUX_PANE: "bad" }),
    undefined,
  );
  await assert.rejects(resolveWindow(async () => "bad", "%2"));
});

test("start, intermediate end, settle, and shutdown only touch owned options", async () => {
  const tmux = fakeTmux();
  const status = new TabStatus(tmux.run);
  await status.startSession("%2");
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
  const status = new TabStatus(tmux.run);
  await status.startSession("%2");
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
  const old = new TabStatus(tmux.run);
  const newer = new TabStatus(tmux.run);
  await old.startSession("%2");
  await newer.startSession("%2");
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
  const status = new TabStatus(async (args) => {
    calls.push(args);
    throw new Error("no tmux");
  });
  await status.startSession("%2");
  status.start();
  status.settled();
  await status.shutdown();
  assert.equal(calls.length, 1);
  const tmux = fakeTmux();
  const bad = new TabStatus(async (args) => {
    if (
      args[0] === "if-shell" &&
      args[5].includes("@pi_notify_status") &&
      !args[5].includes("-u")
    )
      throw new Error("failed");
    return tmux.run(args);
  });
  await bad.startSession("%2");
  await sleep(5);
  await bad.shutdown();
  assert.equal(tmux.options.size, 0);
});
