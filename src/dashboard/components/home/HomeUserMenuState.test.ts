import test from "node:test";
import assert from "node:assert/strict";
import {initialsFromDisplayName, UserMenuController} from "./HomeUserMenuState.ts";

const createController = () => {
    const states: boolean[] = [];
    let focused = 0;
    const logoutScopes: boolean[] = [];
    const controller = new UserMenuController({
        onOpenChange: (open) => states.push(open),
        focusTrigger: () => { focused += 1; },
        containsTarget: (target) => target === "inside",
        onLogout: async (all = false) => { logoutScopes.push(all); },
    });
    return {controller, states, getFocused: () => focused, logoutScopes};
};

test("user avatar initials require a display name", () => {
    assert.equal(initialsFromDisplayName("Pilot Reid"), "PR");
    assert.equal(initialsFromDisplayName("pilot"), "P");
    assert.equal(initialsFromDisplayName("  "), "");
    assert.equal(initialsFromDisplayName(undefined), "");
});

test("user menu toggles and dismisses for Escape or an outside pointer", () => {
    const {controller, states, getFocused} = createController();
    controller.toggle();
    assert.equal(controller.open, true);
    controller.handlePointerDown("inside");
    assert.equal(controller.open, true);
    controller.handleKeyDown("Escape");
    assert.equal(controller.open, false);
    assert.equal(getFocused(), 1);
    controller.toggle();
    controller.handlePointerDown("outside");
    assert.equal(controller.open, false);
    assert.equal(getFocused(), 2);
    assert.deepEqual(states, [true, false, true, false]);
});

test("user menu logs out only this session", async () => {
    const {controller, logoutScopes} = createController();
    controller.toggle();
    await controller.logout();
    assert.deepEqual(logoutScopes, [false]);
    assert.equal(controller.open, false);
});
