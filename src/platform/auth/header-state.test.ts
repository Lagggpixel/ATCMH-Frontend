import assert from "node:assert/strict";
import test from "node:test";
import {headerAuthState} from "./header-state";

const state = (overrides: Partial<Parameters<typeof headerAuthState>[0]> = {}) => headerAuthState({
  loading: false,
  hasDashboardSession: false,
  hasAdminPermission: false,
  dashboardUnavailable: false,
  hasExamsSession: false,
  ...overrides,
});

test("shared header distinguishes every authentication and capability state", () => {
  assert.equal(state({loading: true}), "loading");
  assert.equal(state(), "signed-out");
  assert.equal(state({hasDashboardSession: true}), "account");
  assert.equal(state({hasDashboardSession: true, hasAdminPermission: true}), "admin");
  assert.equal(state({dashboardUnavailable: true}), "unavailable");
  assert.equal(state({hasExamsSession: true}), "exams-only");
});

test("Dashboard permission cannot surface without a live Dashboard session", () => {
  assert.equal(state({hasAdminPermission: true}), "signed-out");
  assert.equal(state({hasAdminPermission: true, dashboardUnavailable: true}), "unavailable");
});
