import assert from "node:assert/strict";
import test from "node:test";
import {canViewAdminPreview} from "./admin-preview-access";

test("preview navigation is available only to admins and superadmins", () => {
  assert.equal(canViewAdminPreview({role: "admin"}), true);
  assert.equal(canViewAdminPreview({role: "super_admin"}), true);
  assert.equal(canViewAdminPreview({role: "staff"}), false);
  assert.equal(canViewAdminPreview({}), false);
  assert.equal(canViewAdminPreview(undefined), false);
});
