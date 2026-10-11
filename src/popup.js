import { getPauseState, setPaused } from "./pause.js";
import { findMatchingRule, loadConfig, saveConfig } from "./rules.js";

const $ = (id) => document.getElementById(id);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const config = await loadConfig();
  const paused = await getPauseState(tab);

  const render = () => {
    const off = !config.settings.enabled;
    $("pauseTab").disabled = off;
    $("pauseWindow").disabled = off;

    const rule = findMatchingRule(config.rules, tab);
    $("match").textContent = rule
      ? `This tab matches the "${rule.group}" rule.`
      : "This tab matches no rule.";
  };

  $("enabled").checked = config.settings.enabled;
  $("enabled").addEventListener("change", async () => {
    config.settings.enabled = $("enabled").checked;
    await saveConfig(config);
    render();
  });

  $("pauseTab").checked = paused.tab;
  $("pauseTab").addEventListener("change", () =>
    setPaused("tab", tab.id, $("pauseTab").checked),
  );

  $("pauseWindow").checked = paused.window;
  $("pauseWindow").addEventListener("change", () =>
    setPaused("window", tab.windowId, $("pauseWindow").checked),
  );

  $("options").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });

  render();
}

init();
