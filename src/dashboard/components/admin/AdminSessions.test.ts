import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const stylesSource = readFileSync(new URL("./AdminSessions.module.css", import.meta.url), "utf8");

test("sessions keep the wide table scrollable in landscape and use cards on phones", () => {
    assert.match(stylesSource, /\.adminSessionsSessionsTable\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto[^}]*-webkit-overflow-scrolling:\s*touch/s);
    assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]*?\.adminSessionsSessionsTable\s*\{[^}]*overflow:\s*visible/s);
    assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]*?\.adminSessionsDataTable,[\s\S]*?min-width:\s*0/s);
});
