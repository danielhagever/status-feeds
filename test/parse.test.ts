// Tests run against real responses captured on 2026-10-01 (test/fixtures), so they check the
// parsers against what the vendors actually send. google-ongoing-derived.json is a real incident
// with its `end` removed, to exercise the ongoing path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStatuspage, parseSlack, parseGoogle, parseMicrosoft, resolve, check } from "../src/index.ts";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));

test("Statuspage: GitHub minor indicator is degraded, with affected components", () => {
  const s = parseStatuspage(fx("statuspage-github"), "GitHub");
  assert.equal(s.health, "degraded");
  assert.match(s.summary, /Partially Degraded Service/);
});

test("Statuspage: Zoom incidents carry titles and an update", () => {
  const s = parseStatuspage(fx("statuspage-zoom"), "Zoom");
  assert.equal(s.health, "degraded");
  assert.ok(s.incidents.length >= 1);
  assert.ok(s.incidents[0].title.length > 0);
});

test("Slack: an active incident without outage type is degraded", () => {
  const s = parseSlack(fx("slack"));
  assert.equal(s.health, "degraded");
  assert.equal(s.incidents.length, 1);
  assert.match(s.incidents[0].title, /Free Plan/);
});

test("Google: all incidents closed means operational", () => {
  const s = parseGoogle(fx("google"));
  assert.equal(s.health, "operational");
  assert.equal(s.incidents.length, 0);
});

test("Google: an incident without end is ongoing", () => {
  const s = parseGoogle(fx("google-ongoing-derived"));
  assert.notEqual(s.health, "operational");
  assert.equal(s.incidents.length, 1);
  assert.ok(s.incidents[0].title.includes(":"));
});

test("Microsoft: Outlook.com row is operational", () => {
  const s = parseMicrosoft(fx("microsoft"), "Outlook.com");
  assert.equal(s.health, "operational");
});

test("Microsoft: unknown service is reported, not guessed", () => {
  assert.equal(parseMicrosoft(fx("microsoft"), "Nope").health, "unknown");
});

test("resolve maps everyday names to feeds", () => {
  assert.equal(resolve("Jira"), "atlassian");
  assert.equal(resolve("my gmail is broken"), "google");
  assert.equal(resolve("ChatGPT"), "openai");
  assert.equal(resolve("fax machine"), null);
});

test("check never throws when the network fails", async () => {
  const s = await check("zoom", (async () => { throw new Error("offline"); }) as any);
  assert.equal(s.health, "unknown");
  assert.match(s.summary, /offline/);
});
