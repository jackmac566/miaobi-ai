import assert from "node:assert/strict";
import test from "node:test";

import { changelog } from "../lib/changelog.ts";
import { capabilitiesFor, hasActiveMembership, MEMBERSHIP_TIERS } from "../lib/membership.ts";

test("free and member tiers have materially different enforced capabilities", () => {
  const free = capabilitiesFor(false, true);
  const member = capabilitiesFor(true, true);

  assert.deepEqual(free, { ...MEMBERSHIP_TIERS.free, premiumModel: true });
  assert.equal(free.dailyLimit, 10);
  assert.equal(member.dailyLimit, 100);
  assert.equal(member.versions, 6);
  assert.equal(member.inputChars, 12000);
  assert.equal(member.historyItems, 100);
  assert.equal(member.advancedControls, true);
  assert.equal(member.batchExport, true);
  assert.equal(member.premiumModel, true);
});

test("expired or free plans never receive membership access", () => {
  const now = Date.parse("2026-07-20T12:00:00Z");
  assert.equal(hasActiveMembership("free", null, now), false);
  assert.equal(hasActiveMembership("monthly", now - 1, now), false);
  assert.equal(hasActiveMembership("monthly", now + 1, now), true);
  assert.equal(hasActiveMembership("annual", null, now), true);
});

test("public changelog is newest first and contains the current release", () => {
  assert.equal(changelog[0].version, "V1.4.5");
  assert.equal(changelog[0].current, true);
  assert.ok(changelog[0].highlights.some(item => item.includes("Project Name")));
  assert.ok(changelog[0].fixes?.some(item => item.includes("already exists")));
  assert.equal(changelog.at(-1)?.version, "V1.0.0");
  assert.deepEqual([...changelog].map(item => item.date), [...changelog].map(item => item.date).sort().reverse());
});
