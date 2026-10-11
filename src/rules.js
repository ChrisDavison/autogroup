// Rule storage and matching. Pure functions here are shared by the background
// worker and the options page, and are unit-tested under Node.

export const GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

export const MATCH_FIELDS = ["url", "title", "either"];

export const DEFAULT_SETTINGS = {
  enabled: true,
  // When a match would pull the tab you're looking at into another window,
  // wait until you switch away from it before moving it.
  deferActiveMoves: true,
};

export function newRule() {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    group: "",
    color: "blue",
    domain: "",
    pattern: "",
    field: "either",
  };
}

// Returns a list of human-readable problems; empty means the rule is valid.
export function validateRule(rule) {
  const errors = [];
  if (!rule.group.trim()) errors.push("Group name is required.");
  if (!rule.domain.trim() && !rule.pattern.trim()) {
    errors.push("Set a domain, a pattern, or both.");
  }
  if (rule.pattern.trim()) {
    try {
      new RegExp(rule.pattern, "i");
    } catch (e) {
      errors.push(`Invalid pattern: ${e.message}`);
    }
  }
  if (!GROUP_COLORS.includes(rule.color)) errors.push("Unknown colour.");
  if (!MATCH_FIELDS.includes(rule.field)) errors.push("Unknown match field.");
  return errors;
}

// "youtube.com" matches youtube.com and any subdomain (www., m., music.).
export function hostMatches(url, domain) {
  domain = domain.trim().toLowerCase().replace(/^\*?\./, "");
  if (!domain) return true;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === domain || host.endsWith(`.${domain}`);
}

export function ruleMatches(rule, { url = "", title = "" }) {
  if (!rule.enabled || validateRule(rule).length) return false;
  if (!hostMatches(url, rule.domain)) return false;
  if (!rule.pattern.trim()) return true;
  const re = new RegExp(rule.pattern, "i");
  switch (rule.field) {
    case "url":
      return re.test(url);
    case "title":
      return re.test(title);
    default:
      return re.test(url) || re.test(title);
  }
}

// Rules are ordered; the first match wins.
export function findMatchingRule(rules, tab) {
  return rules.find((rule) => ruleMatches(rule, tab)) ?? null;
}

export async function loadConfig() {
  const { rules = [], settings = {} } = await chrome.storage.sync.get([
    "rules",
    "settings",
  ]);
  return { rules, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

export async function saveConfig({ rules, settings }) {
  await chrome.storage.sync.set({ rules, settings });
}
