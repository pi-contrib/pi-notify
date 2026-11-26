# Pi Notify

A small [Pi](https://pi.dev) extension showing activity in your tmux window tab. No OS notifications or terminal-title changes in v1.

## Setup

Requires Pi 1.6+, tmux, and a terminal/font supporting Unicode spinner glyphs. Install with:

```sh
pi install git:github.com/pi-contrib/pi-notify
```

Or install from GitHub Packages (after configuring npm authentication for `@pi-contrib`):

```sh
pi install npm:@pi-contrib/pi-notify
```

Add **`#{@pi_notify_status}`** in both tmux tab formats, wherever you want the indicator. For example, in `~/.tmux.conf`:

```tmux
set -g window-status-format '#I:#W #{@pi_notify_status}'
set -g window-status-current-format '#I:#W #{@pi_notify_status}'
```

These examples replace the formats; if you already customized them, **append the placeholder to your own formats instead**. Then reload your tmux config (`tmux source-file ~/.tmux.conf`) and restart Pi or run `/reload`. Pi never edits formats or window names. With no placeholder the extension still updates its window option, but nothing appears in the tab.

The tab shows `✓` when Pi is ready, and an animated spinner while it is working (including retries and queued work). An aborted run returns to `✓`. On exit, session switch, or `/reload`, the extension removes its value and owner token, leaving the placeholder empty. A tmux window shared by multiple Pi panes has **one** tab placeholder: v1 supports one active Pi instance per window; the newest instance owns it and older instances will not clear its status. A crashed or force-killed Pi cannot run cleanup; starting Pi again in the window replaces the stale value.

## Configuration

By default tmux integration is enabled. To disable it, create `${XDG_CONFIG_HOME:-~/.config}/pi-notify/config.json`:

```json
{ "tmux": { "enabled": false } }
```

Set `enabled` to `true` (or remove the file) to re-enable. Restart Pi or run `/reload` after changes. Disabling removes a status owned by the reloading instance; the placeholder remains in your tmux format but displays nothing. Invalid/missing config defaults to enabled. Outside tmux, Pi runs normally without updating tabs.

## Development

With Node.js 22+:

```sh
npm ci --ignore-scripts
npm run check
npm run lint
npm test
npm pack --dry-run
```

For a manual check, start a real tmux session with the placeholder in both tab formats, run `pi -e ./src/index.ts` inside it, submit a prompt, and confirm the spinner moves while Pi runs, persists between low-level runs, becomes `✓` on settle/abort, and disappears on exit. Also test `/reload` after toggling the config. The extension only calls `display-message`, `set-option`, `if-shell`, and `refresh-client` on tmux; it never modifies tab formats or titles.

## License

MIT.
