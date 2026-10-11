import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findMatchingRule,
  hostMatches,
  newRule,
  ruleMatches,
  validateRule,
} from "../src/rules.js";

const rule = (overrides) => ({ ...newRule(), ...overrides });

const asmr = rule({ group: "Media", domain: "youtube.com", pattern: "asmr" });

test("hostMatches accepts the domain and its subdomains only", () => {
  assert.ok(hostMatches("https://youtube.com/watch?v=1", "youtube.com"));
  assert.ok(hostMatches("https://www.youtube.com/", "youtube.com"));
  assert.ok(hostMatches("https://m.youtube.com/", "*.youtube.com"));
  assert.ok(!hostMatches("https://notyoutube.com/", "youtube.com"));
  assert.ok(!hostMatches("https://youtube.com.evil.io/", "youtube.com"));
  assert.ok(!hostMatches("not a url", "youtube.com"));
  assert.ok(hostMatches("not a url", ""));
});

test("a pattern matches the title when the URL lacks it", () => {
  const tab = {
    url: "https://www.youtube.com/watch?v=abc123",
    title: "Relaxing ASMR for sleep - YouTube",
  };
  assert.ok(ruleMatches(asmr, tab));
  assert.ok(!ruleMatches({ ...asmr, field: "url" }, tab));
  assert.ok(ruleMatches({ ...asmr, field: "title" }, tab));
});

test("the domain restricts where the pattern applies", () => {
  const tab = { url: "https://reddit.com/r/asmr", title: "r/asmr" };
  assert.ok(!ruleMatches(asmr, tab));
});

test("a domain-only rule matches every page on that domain", () => {
  const docs = rule({ group: "Docs", domain: "developer.chrome.com" });
  assert.ok(ruleMatches(docs, { url: "https://developer.chrome.com/x" }));
});

test("disabled and invalid rules never match", () => {
  const tab = { url: "https://youtube.com/", title: "ASMR" };
  assert.ok(!ruleMatches({ ...asmr, enabled: false }, tab));
  assert.ok(!ruleMatches({ ...asmr, pattern: "(" }, tab));
});

test("validateRule reports missing fields and bad regex", () => {
  assert.deepEqual(validateRule(asmr), []);
  assert.equal(validateRule(rule({ group: "", pattern: "x" })).length, 1);
  assert.equal(validateRule(rule({ group: "G" })).length, 1);
  assert.match(validateRule({ ...asmr, pattern: "[" })[0], /Invalid pattern/);
});

test("findMatchingRule returns the first match in order", () => {
  const all = rule({ group: "YouTube", domain: "youtube.com" });
  const tab = { url: "https://youtube.com/watch", title: "ASMR" };
  assert.equal(findMatchingRule([asmr, all], tab).group, "Media");
  assert.equal(findMatchingRule([all, asmr], tab).group, "YouTube");
  assert.equal(findMatchingRule([asmr], { url: "https://x.com" }), null);
});
