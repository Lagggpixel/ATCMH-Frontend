import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const catalogSource = readFileSync(join(currentDir, "ExamCatalog.tsx"), "utf8");
const catalogCss = readFileSync(join(currentDir, "ExamCatalog.module.css"), "utf8");

test("exam folders are collapsed when the catalog first opens", () => {
    assert.match(catalogSource, /useState<Set<string>>\(\(\) => new Set\(\)\)/);
    assert.doesNotMatch(catalogSource, /folders\[0\]/);
});

test("the move-folder selector is a compact action beside Edit", () => {
    assert.match(catalogSource, /className=\{styles\.quizActions\}/);
    assert.match(catalogSource, /className=\{styles\.moveSelect\}/);
    assert.match(catalogSource, /aria-label=\{`Move \$\{quiz\.title\} to another folder`\}/);
    assert.match(catalogSource, /<option value="">Move<\/option>/);
    assert.match(catalogCss, /\.moveSelect\s*\{[\s\S]*?width: 78px;[\s\S]*?min-height: 38px;[\s\S]*?border-radius: 9px;/);
});
