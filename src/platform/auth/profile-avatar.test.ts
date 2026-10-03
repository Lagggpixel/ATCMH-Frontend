import assert from "node:assert/strict";
import test from "node:test";
import {profileDisplayName, safeAvatarUrl} from "./profile-avatar.ts";
import type {DashboardAuthSession} from "@/src/dashboard/types/Account";

test("profile name prefers an active IFC identity with Discord and User fallbacks", () => {
  const session = {identities: [{provider: "discord", subject: "123", displayName: "Discord Pilot"},
    {provider: "IFC", subject: "if-id", displayName: "Forum Pilot"}]} as DashboardAuthSession;
  assert.equal(profileDisplayName(session), "Forum Pilot");
  session.identities[1].active = false;
  assert.equal(profileDisplayName(session), "Discord Pilot");
  assert.equal(profileDisplayName(null), "User");
});

test("avatars allow forum and Discourse CDN HTTPS URLs only", () => {
  for (const url of ["https://community.infiniteflight.com/a.png", "https://sea1.discourse-cdn.com/a.png",
    "https://avatars.discourse-cdn.com/v4/letter/a/123/288.png"]) assert.equal(safeAvatarUrl(url), url);
  for (const url of [null, "bad", "http://community.infiniteflight.com/a.png", "https://evil.test/a.png",
    "https://user@community.infiniteflight.com/a.png", "https://community.infiniteflight.com:444/a.png",
    "https://community.infiniteflight.com.evil.test/a.png"]) assert.equal(safeAvatarUrl(url), null);
});
