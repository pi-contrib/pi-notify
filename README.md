# Pi Notify

> An animated tmux tab indicator for [Pi](https://pi.dev) — see when Pi is working or ready without changing your tmux window name or tab styling.

[![CI](https://github.com/pi-contrib/pi-notify/actions/workflows/ci.yml/badge.svg)](https://github.com/pi-contrib/pi-notify/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/pi-contrib/pi-notify)](https://github.com/pi-contrib/pi-notify/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## How it works

Pi Notify updates only the window-scoped tmux option `@pi_notify_status`. It cycles through `⣷ ⣯ ⣟ ⡿ ⢿ ⣻ ⣽ ⣾` while Pi works (including retries and queued work) and shows `⣿` when the run settles or is aborted. During a blocking extension UI prompt it shows a steady `❯`; after the prompt closes, it resumes the spinner if Pi is still working or returns to `⣿` if idle. On exit, session switch, or `/reload`, it clears its option value. The extension never edits tmux formats or window titles; you choose where the placeholder appears in your tab. OS notifications and terminal-title changes are not part of v1.

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

**One-time tmux setup:** Add the status option to **both** `window-status-format` and `window-status-current-format`. Put the separating space inside a tmux conditional so an empty indicator leaves no extra space. For example, in `~/.tmux.conf`:

```tmux
set -g window-status-format '#I:#W#{?#{@pi_notify_status}, #{@pi_notify_status},}'
set -g window-status-current-format '#I:#W#{?#{@pi_notify_status}, #{@pi_notify_status},}'
```

The example replaces both formats. If you've customized them, append `#{?#{@pi_notify_status}, #{@pi_notify_status},}` to your **existing** formats instead so your styling remains intact. Do not add a space before the conditional: it supplies one only when the option has a value. Reload with `tmux source-file ~/.tmux.conf`. Without the status option in the formats Pi still updates it, but nothing appears in the tab.

## Configuration

Tmux integration is active whenever this extension is loaded inside tmux. To turn it off, use Pi's built-in `pi config` command to disable the Pi Notify extension, then restart Pi or run `/reload`. Re-enable it the same way. On reload or exit, Pi Notify clears its tab status; the conditional placeholder stays in your tmux format but displays nothing and adds no space. Outside tmux, Pi runs normally without updating tabs.

If you previously created `${XDG_CONFIG_HOME:-~/.config}/pi-notify/config.json`, you can delete it; Pi Notify no longer reads it.

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

Run `npm run format` to apply Biome formatting, import sorting, and safe lint fixes. For a manual check, start Pi inside an attached tmux session with the placeholder in both tab formats: submit a prompt and confirm the spinner animates, remains active across intermediate work, changes to `❯` during an extension UI prompt, becomes `⣿` after settle or abort, and disappears on exit. Test `/reload` after disabling or re-enabling the extension with `pi config`.

Release Please creates release PRs. Merging one tags the release and publishes the npm package to GitHub Packages. The repository must allow Actions to create pull requests, and the organization must allow the workflow to publish packages.

## License

MIT.
