import {
  GROUP_COLORS,
  findMatchingRule,
  loadConfig,
  newRule,
  saveConfig,
  validateRule,
} from "./rules.js";

const $ = (id) => document.getElementById(id);

let config;
let saveTimer;

function scheduleSave() {
  clearTimeout(saveTimer);
  $("status").textContent = "Saving…";
  saveTimer = setTimeout(async () => {
    await saveConfig(config);
    $("status").textContent = "Saved";
  }, 300);
}

function updateRuleState(li, rule) {
  const errors = validateRule(rule);
  li.querySelector(".errors").textContent = errors.join(" ");
  li.classList.toggle("invalid", errors.length > 0);
  li.classList.toggle("disabled", !rule.enabled);
}

function renderRules() {
  const list = $("rules");
  list.replaceChildren();
  $("empty").hidden = config.rules.length > 0;

  config.rules.forEach((rule, index) => {
    const li = $("ruleTemplate").content.firstElementChild.cloneNode(true);

    const colors = li.querySelector('[data-field="color"]');
    for (const color of GROUP_COLORS) colors.add(new Option(color, color));

    for (const input of li.querySelectorAll("[data-field]")) {
      const key = input.dataset.field;
      if (input.type === "checkbox") input.checked = rule[key];
      else input.value = rule[key];

      input.addEventListener("input", () => {
        rule[key] = input.type === "checkbox" ? input.checked : input.value;
        updateRuleState(li, rule);
        updateTest();
        scheduleSave();
      });
    }

    li.querySelector('[data-action="up"]').disabled = index === 0;
    li.querySelector('[data-action="down"]').disabled =
      index === config.rules.length - 1;
    li.addEventListener("click", (e) => {
      const action = e.target.dataset?.action;
      if (!action) return;
      const rules = config.rules;
      if (action === "delete") rules.splice(index, 1);
      else {
        const to = action === "up" ? index - 1 : index + 1;
        [rules[index], rules[to]] = [rules[to], rules[index]];
      }
      renderRules();
      updateTest();
      scheduleSave();
    });

    updateRuleState(li, rule);
    list.append(li);
  });
}

function updateTest() {
  const url = $("testUrl").value.trim();
  const title = $("testTitle").value.trim();
  const result = $("testResult");
  if (!url && !title) {
    result.textContent = "Enter a URL and/or title to see which rule matches.";
    return;
  }
  const rule = findMatchingRule(config.rules, { url, title });
  if (!rule) {
    result.textContent = "No rule matches; the tab would be left alone.";
    return;
  }
  const n = config.rules.indexOf(rule) + 1;
  result.textContent = `Rule ${n} matches → group "${rule.group}".`;
}

async function init() {
  config = await loadConfig();

  for (const key of ["enabled", "deferActiveMoves"]) {
    $(key).checked = config.settings[key];
    $(key).addEventListener("change", () => {
      config.settings[key] = $(key).checked;
      scheduleSave();
    });
  }

  $("add").addEventListener("click", () => {
    config.rules.push(newRule());
    renderRules();
    $("rules").lastElementChild.querySelector(".group").focus();
    scheduleSave();
  });

  $("apply").addEventListener("click", async () => {
    $("apply").disabled = true;
    try {
      const { moved } = await chrome.runtime.sendMessage({ type: "applyAll" });
      $("status").textContent = `Grouped ${moved} tab${moved === 1 ? "" : "s"}`;
    } finally {
      $("apply").disabled = false;
    }
  });

  $("testUrl").addEventListener("input", updateTest);
  $("testTitle").addEventListener("input", updateTest);

  renderRules();
  updateTest();
}

init();
