# Autogroup

A Brave (or Chrome) extension that moves tabs into named tab groups using
rules, e.g. "YouTube pages with *ASMR* in the title go to the **Media** group".

## Install

1. Open `brave://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `src/` folder.
3. Click the extension's toolbar icon (or **Details → Extension options**) to
   add rules.

After changing code, click the reload button on the extension's card.

## How rules work

Each rule has:

- **Group name** and **colour**. The colour is only used when the extension
  creates the group.
- **Domain** (optional). `youtube.com` also matches subdomains like
  `www.youtube.com`.
- **Pattern** (optional). A case-insensitive regular expression tested against
  the tab's **URL**, **title**, or **either**. Match on the title when the
  thing you care about isn't in the URL: a YouTube video's URL is just
  `watch?v=…`.

A rule needs a domain, a pattern, or both. Rules are checked top to bottom, and
the first match wins.

When a tab's URL or title changes and a rule matches:

- If a group with that exact name is open, the tab joins it, even if the
  group is in a different window. Groups in the tab's own window are
  preferred.
- Otherwise, a new group is created in the tab's current window.
- Pinned tabs, tabs that match no rule, and tabs in popup or app windows are
  left alone.

If a match would move the tab you're looking at into another window, the move
waits until you switch to a different tab. You can turn this off in the
options.

Groups are found by name, so there's nothing to set up. To keep "Media" in its
own window, drag the group into a window once. From then on, new matches go
there. This also holds after a restart, as long as Brave is set to reopen your
previous tabs, because it restores groups with their names.

**Apply rules to open tabs** on the options page runs the rules over every
tab you already have open.

## Development

```sh
npm test   # unit tests for rule matching (Node 20+)
```

- `src/rules.js` holds rule validation, matching, and storage. Rules are
  stored in `chrome.storage.sync`.
- `src/background.js` is the service worker that watches tabs and moves them.
- `src/options.*` is the rules editor.
