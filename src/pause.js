// Per-tab and per-window pauses. Tab and window IDs only mean something until
// the browser restarts, so pauses live in session storage and end with it.

const KEYS = { tab: "pausedTabs", window: "pausedWindows" };

async function getIds(kind) {
  const { [KEYS[kind]]: ids = [] } = await chrome.storage.session.get(KEYS[kind]);
  return new Set(ids);
}

export async function setPaused(kind, id, paused) {
  const ids = await getIds(kind);
  if (ids.has(id) === paused) return;
  paused ? ids.add(id) : ids.delete(id);
  await chrome.storage.session.set({ [KEYS[kind]]: [...ids] });
}

export async function getPauseState(tab) {
  const [tabs, windows] = await Promise.all([getIds("tab"), getIds("window")]);
  return { tab: tabs.has(tab.id), window: windows.has(tab.windowId) };
}

export async function isPaused(tab) {
  const state = await getPauseState(tab);
  return state.tab || state.window;
}

export function isPauseChange(changes) {
  return Object.values(KEYS).some((key) => key in changes);
}
