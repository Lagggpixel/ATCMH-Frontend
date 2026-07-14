import test from "node:test";
import assert from "node:assert/strict";
import {accountAuthErrorMessage} from "./AccountPageState.ts";

test("declined policy consent leaves the user safely signed out", () => {
    assert.equal(
        accountAuthErrorMessage("consent_declined"),
        "You did not agree to the required policies, so you remain signed out. You can sign in again when ready.",
    );
});

test("invalid policy consent asks the user to restart sign-in without exposing internals", () => {
    assert.equal(
        accountAuthErrorMessage("invalid_consent"),
        "This policy agreement request is invalid. Please start sign-in again.",
    );
});

test("expired policy consent asks the user to restart sign-in", () => {
    assert.equal(
        accountAuthErrorMessage("consent_expired"),
        "This policy agreement request has expired. Please start sign-in again.",
    );
});
