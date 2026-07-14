import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(currentDir, "AdminAuditLogs.tsx"), "utf8");
const stylesSource = readFileSync(join(currentDir, "AdminAuditLogs.module.css"), "utf8");

test("audit log details open in a popup instead of expanding a table row", () => {
    assert.match(componentSource, /role="dialog"/);
    assert.match(componentSource, /selectedLogId/);
    assert.doesNotMatch(componentSource, /expandedLogId/);
    assert.doesNotMatch(componentSource, /detailsRow/);
});

test("audit log view button is kept on one line", () => {
    assert.match(stylesSource, /\.detailsToggle\s*\{[^}]*white-space:\s*nowrap;/s);
    assert.match(stylesSource, /\.auditTable th:nth-child\(7\),\s*\.auditTable td:nth-child\(7\)\s*\{[^}]*min-width:\s*\d+px;/s);
});

test("audit filters use server-provided options and include a date range", () => {
    assert.match(componentSource, /ApiUtils\.getAuditLogFilters\(token\)/);
    assert.match(componentSource, /<select name="actorId"/);
    assert.match(componentSource, /<select name="action"/);
    assert.match(componentSource, /<select name="targetType"/);
    assert.match(componentSource, /type="datetime-local"/);
    assert.match(componentSource, /name="from"/);
    assert.match(componentSource, /name="to"/);
    assert.doesNotMatch(componentSource, /<input name="action"/);
    assert.doesNotMatch(componentSource, /<input name="actorId"/);
    assert.doesNotMatch(componentSource, /<input name="targetType"/);
});
