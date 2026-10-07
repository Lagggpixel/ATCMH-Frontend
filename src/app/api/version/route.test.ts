import test from "node:test";
import assert from "node:assert/strict";
import {GET} from "./route.ts";
import {createRequire} from "node:module";

test("version metadata returns the actual frontend package version without operational data", async () => {
    const response = GET();
    const require = createRequire(import.meta.url);
    assert.deepEqual(await response.json(), {version: require("../../../../package.json").version});
    assert.equal(response.headers.get("Cache-Control"), "no-store");
});
