import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("another active application is rendered as a normal blocking state", () => {
    const page = source("./ApplicationPage.tsx");
    const types = source("../dashboard/types/ApplicationQuestion.ts");

    assert.match(types, /"DIFFERENT_APPLICATION_IN_PROGRESS"/);
    assert.match(page, /DIFFERENT_APPLICATION_IN_PROGRESS: \{title: "Another application is already in progress"/);
    assert.match(page, /`\$\{activeType\.label\} application already in progress`/);
    assert.match(page, /You cannot start a second application/);
});
