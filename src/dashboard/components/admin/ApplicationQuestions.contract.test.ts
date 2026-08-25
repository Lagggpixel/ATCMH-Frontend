import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("application question management has its own moderator capability and route", () => {
    const navigation = source("./AdminNavigation.ts");
    const routes = source("../../route-map.ts");
    const dashboard = source("../../DashboardRoute.tsx");
    assert.match(navigation, /canManageApplicationQuestions[^\n]+\/dashboard\/application-questions/);
    assert.match(routes, /\["application-questions", "application-questions"\]/);
    assert.match(dashboard, /case "application-questions"[^\n]+<AdminApplicationQuestions/);
});

test("the editor exposes content and ordering without allowing question semantics to drift", () => {
    const editor = source("./AdminApplicationQuestions.tsx");
    assert.match(editor, /Only Moderators and Super Admins/);
    assert.doesNotMatch(editor, /Question keys, response types, and conditional rules are fixed/);
    assert.match(editor, /prompt: question\.prompt/);
    assert.match(editor, /helpText: question\.helpText/);
    assert.match(editor, /sortOrder: question\.sortOrder/);
    assert.match(editor, /active: question\.active/);
    assert.doesNotMatch(editor, /setForm[^\n]+inputType/);
    assert.doesNotMatch(editor, /setForm[^\n]+dependsOn/);
});

test("switching to Discord is an explicit destructive restart, never a resume", () => {
    const application = source("../../../apply/ApplicationPage.tsx");
    assert.match(application, /Restart the entire application in Discord\?/);
    assert.match(application, /permanently discards the website draft and all answers entered here/);
    assert.match(application, /cannot resume this website progress/);
    assert.match(application, /Discard draft and restart/);
});
