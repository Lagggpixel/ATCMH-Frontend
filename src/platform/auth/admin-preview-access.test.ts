import assert from "node:assert/strict";
import test from "node:test";
import {canAccessPilotGuide, canViewAdminPreview} from "./admin-preview-access";

test("preview navigation is available only to admins and superadmins", () => {
  assert.equal(canViewAdminPreview({role: "admin"}), true);
  assert.equal(canViewAdminPreview({role: "super_admin"}), true);
  assert.equal(canViewAdminPreview({role: "staff"}), false);
  assert.equal(canViewAdminPreview({}), false);
  assert.equal(canViewAdminPreview(undefined), false);
});

test("pilot guide access includes moderators without opening other admin previews", () => {
  const moderator = {role: "staff" as const, canManagePilotGuide: true};
  assert.equal(canAccessPilotGuide(moderator), true);
  assert.equal(canViewAdminPreview(moderator), false);
  assert.equal(canAccessPilotGuide({role: "admin"}), true);
  assert.equal(canAccessPilotGuide({role: "super_admin"}), true);
  assert.equal(canAccessPilotGuide({role: "staff", canManagePilotGuide: false}), false);
  assert.equal(canAccessPilotGuide({role: "staff"}), false);
  assert.equal(canAccessPilotGuide(undefined), false);
});
