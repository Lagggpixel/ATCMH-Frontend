import assert from "node:assert/strict";
import test from "node:test";

import { canManageQuiz } from "./permissions";

test("a Discord-authorized mentor can manage a quiz regardless of author", () => {
  assert.equal(canManageQuiz({ id: "mentor", canManageAll: false }, "mentor"), true);
  assert.equal(canManageQuiz({ id: "mentor", canManageAll: false }, "other"), true);
});

test("an administrator can manage every quiz", () => {
  assert.equal(canManageQuiz({ id: "admin", canManageAll: true }, "other"), true);
});
