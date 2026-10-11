import { getPauseState, isPauseChange, isPaused, setPaused } from "./pause.js";
import { findMatchingRule, loadConfig } from "./rules.js";

// Tab events arrive in bursts (URL, then title, then title again), so all
// grouping work runs one task at a time. Without this, two tabs matching the
// same rule could each create their own copy of a group that doesn't exist yet.
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((e) => console.error("autogroup:", e));
  return queue;
}

// Tab IDs whose cross-window move is waiting for the user to switch away.
// Session storage survives the service worker being suspended.
async function getDeferred() {
  const { deferred = [] } = await chrome.storage.session.get("deferred");
  return new Set(deferred);
}

async function setDeferred(tabId, isDeferred) {
  const deferred = await getDeferred();
  if (deferred.has(tabId) === isDeferred) return;
  isDeferred ? deferred.add(tabId) : deferred.delete(tabId);
  await chrome.storage.session.set({ deferred: [...deferred] });
}

// Tab edits fail while the user is dragging a tab; retry briefly.
async function retry(fn, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !/cannot be edited right now/i.test(e.message)) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 200 * i));
    }
  }
}

async function findGroup(title, tab) {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const eligible = new Set(
    windows.filter((w) => w.incognito === tab.incognito).map((w) => w.id),
  );
  const groups = (await chrome.tabGroups.query({})).filter(
    (g) => g.title === title && eligible.has(g.windowId),
  );
  // Prefer a group in the tab's own window, so nothing jumps windows needlessly.
  return groups.find((g) => g.windowId === tab.windowId) ?? groups[0] ?? null;
}

// Returns true if the tab was moved into a group.
async function processTab(tab, config) {
  const { rules, settings } = config;
  if (!settings.enabled || tab.pinned || (await isPaused(tab))) {
    await setDeferred(tab.id, false);
    return false;
  }

  const win = await chrome.windows.get(tab.windowId);
  if (win.type !== "normal") return false;

  const rule = findMatchingRule(rules, tab);
  if (!rule) {
    await setDeferred(tab.id, false);
    return false;
  }

  if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    const current = await chrome.tabGroups.get(tab.groupId);
    if (current.title === rule.group) {
      await setDeferred(tab.id, false);
      return false;
    }
  }

  const target = await findGroup(rule.group, tab);
  const crossWindow = target && target.windowId !== tab.windowId;
  if (crossWindow && tab.active && settings.deferActiveMoves) {
    await setDeferred(tab.id, true);
    return false;
  }
  await setDeferred(tab.id, false);

  if (target) {
    if (crossWindow) {
      await retry(() =>
        chrome.tabs.move(tab.id, { windowId: target.windowId, index: -1 }),
      );
    }
    await retry(() => chrome.tabs.group({ groupId: target.id, tabIds: tab.id }));
  } else {
    const groupId = await retry(() =>
      chrome.tabs.group({
        tabIds: tab.id,
        createProperties: { windowId: tab.windowId },
      }),
    );
    await chrome.tabGroups.update(groupId, {
      title: rule.group,
      color: rule.color,
    });
  }
  return true;
}

async function processTabId(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    await setDeferred(tabId, false); // Closed before we got to it.
    return false;
  }
  return processTab(tab, await loadConfig());
}

async function processDeferred() {
  for (const tabId of await getDeferred()) await processTabId(tabId);
}

async function processAllTabs() {
  const config = await loadConfig();
  const tabs = await chrome.tabs.query({ windowType: "normal" });
  let moved = 0;
  for (const tab of tabs) {
    try {
      if (await processTab(tab, config)) moved++;
    } catch (e) {
      console.error("autogroup:", tab.url, e);
    }
  }
  return moved;
}

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url || change.title || change.pinned === false) {
    enqueue(() => processTabId(tabId));
  }
});

// Switching tabs is the cue to carry out moves that were waiting on the
// previously active tab.
chrome.tabs.onActivated.addListener(() => enqueue(processDeferred));

chrome.tabs.onRemoved.addListener((tabId) =>
  enqueue(async () => {
    await setDeferred(tabId, false);
    await setPaused("tab", tabId, false);
  }),
);

chrome.windows.onRemoved.addListener((windowId) =>
  enqueue(() => setPaused("window", windowId, false)),
);

// The toolbar badge reads "off" on tabs that autogroup will leave alone.
async function updateBadge(tab) {
  const { settings } = await loadConfig();
  const state = await getPauseState(tab);
  const off = !settings.enabled || state.tab || state.window;
  await chrome.action.setBadgeText({ tabId: tab.id, text: off ? "off" : "" });
}

async function updateActiveBadges() {
  for (const tab of await chrome.tabs.query({ active: true })) {
    await updateBadge(tab).catch(() => {});
  }
}

chrome.action.setBadgeBackgroundColor({ color: "#777" });
chrome.tabs.onActivated.addListener(updateActiveBadges);
chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
  if (change.status === "loading") updateBadge(tab).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" ? "settings" in changes : isPauseChange(changes)) {
    updateActiveBadges();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "applyAll") {
    enqueue(async () => sendResponse({ moved: await processAllTabs() }));
    return true; // Keep the channel open for the async response.
  }
});
