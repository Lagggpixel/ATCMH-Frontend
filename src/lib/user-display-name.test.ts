import test from "node:test";
import assert from "node:assert/strict";
import {availableUserName, formatUserName, matchesUserSearch} from "./user-display-name.ts";

const id = "123456789012345";

test("unavailable names use a contextual fallback, then identify the user by ID", () => {
    for (const name of [undefined, null, "", "   ", "NA", "n/a", " N/A "]) {
        assert.equal(availableUserName(name), undefined);
        assert.equal(formatUserName(id, name), `User (${id})`);
        assert.equal(formatUserName(id, name, "Historical name"), "Historical name");
        assert.equal(formatUserName(id, name, " N/A "), `User (${id})`);
    }
    assert.equal(formatUserName(null, "N/A", "  "), "System");
});

test("valid current names take precedence over historical names", () => {
    assert.equal(formatUserName(id, "  Current member  ", "Historical name"), "Current member");
    assert.equal(formatUserName(id, null, "  Legacy member  "), "Legacy member");
});

test("a backend ID placeholder does not hide a known IFC or historical name", () => {
    assert.equal(formatUserName(id, `User (${id})`, "Known IFC name"), "Known IFC name");
    assert.equal(formatUserName(id, `User (${id})`), `User (${id})`);
});

test("search matches IDs even when names are unavailable without matching placeholder labels", () => {
    for (const name of [undefined, null, " ", "NA", "N/A"]) {
        assert.equal(matchesUserSearch(id, name, "678901"), true);
        assert.equal(matchesUserSearch(id, name, "N/A"), false);
    }
    assert.equal(matchesUserSearch(id, "Current Member", "CURRENT"), true);
    assert.equal(matchesUserSearch(id, "Current Member", "not present"), false);
});
