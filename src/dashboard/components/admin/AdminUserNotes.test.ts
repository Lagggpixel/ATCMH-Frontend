import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(currentDir, "AdminUserNotes.tsx"), "utf8");
const stylesSource = readFileSync(join(currentDir, "AdminUserNotes.module.css"), "utf8");

test("usernote creation stays with the filter actions", () => {
    const controls = componentSource.match(/<div className=\{styles\.adminUserNotesControls\}>([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? "";

    assert.match(controls, /adminUserNotesCreateButton/);
    assert.match(controls, /Create Usernote/);
    assert.doesNotMatch(componentSource, /adminUserNotesHeader/);
    assert.match(componentSource, /<AdminPagination[\s\S]*?variant="inline"/);
});

test("sortable table headings stay on one line in a scrollable region", () => {
    assert.match(componentSource, /className=\{styles\.adminUserNotesTable\} role="region" aria-label="User notes" tabIndex=\{0\}/);
    assert.match(componentSource, /<th scope="col" aria-sort=\{sortState\.column==="active"[\s\S]*?<button className=\{styles\.sortButton\}[\s\S]*?handleSort\("active"\)[\s\S]*?>Status/);
    assert.match(stylesSource, /\.adminUserNotesTable\s*\{[^}]*overflow-x:\s*auto;/s);
    assert.match(stylesSource, /\.sortButton\s*\{[^}]*display:\s*inline-flex;[^}]*white-space:\s*nowrap;/s);
});

test("filter actions collapse without clipping on narrow viewports", () => {
    assert.match(stylesSource, /@media \(max-width: 900px\)[\s\S]*?\.adminUserNotesControls\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
    assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]*?\.adminUserNotesControls\s*\{[^}]*grid-template-columns:\s*1fr;/s);
});
