# Pi Notify

An animated tmux tab indicator for [Pi](https://pi.dev). See when Pi is working or ready without changing your tmux window name or tab styling. OS notifications and terminal-title changes are not part of v1.

## How it works

Pi Notify updates only the window-scoped tmux option `@pi_notify_status`. It shows a Unicode spinner while Pi works (including retries and queued work), then `✓` when the run settles or is aborted. On exit, session switch, or `/reload`, it clears its option value. The extension never edits tmux formats or window titles; you choose where the placeholder appears in your tab.

A tmux window shared by multiple Pi panes has **one** tab placeholder. V1 supports one active Pi instance per window: the newest instance owns it, and an older instance will not clear the newer instance's status. Force-killing Pi can leave a stale value; starting Pi again in that window replaces it.

## Requirements

- Pi 1.6.0 (the version checked in CI)
- tmux and a terminal/font supporting the Unicode spinner glyphs

## Installation

Install the latest code from GitHub without a registry login:

```sh
pi install git:github.com/pi-contrib/pi-notify
```

Or, after configuring npm authentication for `npm.pkg.github.com` and the `@pi-contrib` scope, install the latest release from GitHub Packages:

```sh
pi install npm:@pi-contrib/pi-notify
```

For a reproducible install, append a release tag (for GitHub) or a version (for npm). Restart Pi or run `/reload`.

**One-time tmux setup:** Add `#{@pi_notify_status}` wherever you want the indicator in **both** `window-status-format` and `window-status-current-format`. For example, in `~/.tmux.conf`:

```tmux
set -g window-status-format '#I:#W #{@pi_notify_status}'
set -g window-status-current-format '#I:#W #{@pi_notify_status}'
```

The example replaces both formats. If you've customized them, add the placeholder to your existing formats instead so your styling remains intact. Reload with `tmux source-file ~/.tmux.conf`. Without the placeholder Pi still updates its option, but nothing appears in the tab.

## Configuration

Tmux integration is enabled by default. To disable it, create `${XDG_CONFIG_HOME:-~/.config}/pi-notify/config.json`:

```json
{ "tmux": { "enabled": false } }
```

Set `enabled` to `true` (or remove the file) to re-enable. Restart Pi or run `/reload` after a change. Disabling clears the reloading instance's value; the placeholder stays in your format but displays nothing. Invalid or missing config defaults to enabled. Outside tmux, Pi runs normally without updating tabs.

## Development

Use Node.js 22 locally or enter the Nix dev shell with `nix develop`:

```sh
npm ci --ignore-scripts
npm run check
npm run lint
npm test
npm pack --dry-run
pi -e ./src/index.ts
```

Run `npm run format` to apply Biome formatting, import sorting, and safe lint fixes. For a manual check, start Pi inside an attached tmux session with the placeholder in both tab formats: submit a prompt and confirm the spinner animates, remains active across intermediate work, becomes `✓` after settle or abort, and disappears on exit. Test `/reload` after toggling the config.

Release Please creates release PRs. Merging one tags the release and publishes the npm package to GitHub Packages. The repository must allow Actions to create pull requests, and the organization must allow the workflow to publish packages.

## License

MIT.
