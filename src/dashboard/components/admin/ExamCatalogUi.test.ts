import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const catalogSource = readFileSync(join(currentDir, "ExamCatalog.tsx"), "utf8");
const catalogCss = readFileSync(join(currentDir, "ExamCatalog.module.css"), "utf8");

test("the first populated folder opens and saved quizzes reveal their folder", () => {
    assert.match(catalogSource, /folders\.find\(folder => folder\.quizzes\.length > 0\)\?\.id/);
    assert.match(catalogSource, /revealQuizId/);
});

test("private quiz actions expose unlocks and moving without crowding the ledger", () => {
    assert.match(catalogSource, /className=\{styles\.quizActions\}/);
    assert.match(catalogSource, /canUnlock && quiz\.isPrivate/);
    assert.match(catalogSource, /Manage unlocks/);
    assert.match(catalogSource, /unlocks\?quiz=/);
    assert.match(catalogSource, /className=\{styles\.actionMenu\}/);
    assert.match(catalogSource, /className=\{styles\.moveSelect\}/);
    assert.match(catalogSource, /aria-label=\{`Move \$\{quiz\.title\} to another folder`\}/);
    assert.match(catalogCss, /\.actionMenuPanel\s*\{/);
});
