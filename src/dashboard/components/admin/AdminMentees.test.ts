import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(currentDir, "AdminMentees.tsx"), "utf8");
const stylesSource = readFileSync(join(currentDir, "AdminMentees.module.css"), "utf8");
const paginationSource = readFileSync(join(currentDir, "AdminPagination.tsx"), "utf8");

test("mentee workspace uses a dedicated list sidebar without a summary strip", () => {
    assert.doesNotMatch(componentSource, /aria-label="Mentee overview"/);
    assert.match(stylesSource, /\.adminMenteesLayout\s*\{[^}]*grid-template-columns:\s*minmax\(300px, 340px\)\s+minmax\(0, 1fr\);/s);
    assert.match(stylesSource, /\.menteeListPanel\s*\{[^}]*height:\s*calc\(100dvh - 73px\);[^}]*border-right:\s*1px solid var\(--border-color\);/s);
    assert.match(componentSource, /menteeStateBadge/);
    assert.match(componentSource, /stateBadge/);
    assert.match(componentSource, /Profile &amp; timeline/);
});

test("mentee filters reset pagination and expose a no-results recovery state", () => {
    assert.match(componentSource, /setFilter\(event\.target\.value\);\s*menteePagination\.reset\(\);/s);
    assert.match(componentSource, /setMentorFilter\("waitlist"\);\s*menteePagination\.reset\(\);/s);
    assert.match(componentSource, /No mentees match these filters\./);
    assert.match(componentSource, /aria-label="Clear mentee search"/);
});

test("mobile mentees use a master-detail flow with compact session cards", () => {
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.menteeListPanelWithSelection\s*\{[^}]*display:\s*none;/s);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.menteeDetailPanelWithoutSelection\s*\{[^}]*display:\s*none;/s);
    assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*?\.backToMentees\s*\{[^}]*display:\s*inline-flex;/s);
    assert.match(stylesSource, /@media \(max-width: 920px\)[\s\S]*?\.sessionsTable tr\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
});

test("destructive actions and pagination expose their semantics", () => {
    assert.match(componentSource, /className=\{styles\.dangerStateAction\}/);
    assert.match(componentSource, /role="dialog" aria-modal="true"/);
    assert.match(componentSource, /className=\{styles\.dangerButton\}/);
    assert.match(paginationSource, /aria-current=\{i === page \? "page" : undefined\}/);
});
