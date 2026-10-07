import test from "node:test";
import assert from "node:assert/strict";
import type {AtcmhUser} from "../types/AtcmhUser.ts";
import {useUserLookup} from "./useAdminShared.ts";

const user = (id: string, username: string | null | undefined): AtcmhUser =>
    ({id, username: username as string, allTimeAttendance: 3, recentAttendance: 1});

test("dashboard lookup retains current names and resolves unavailable names without hiding IDs", () => {
    const lookup = useUserLookup([
        user("100", "Current member"),
        user("200", "N/A"),
        user("300", ""),
        user("400", undefined),
    ]);
    assert.equal(lookup.getUserName("100"), "Current member");
    for (const id of ["200", "300", "400", "500"]) {
        assert.equal(lookup.getUserName(id), `User (${id})`);
    }
    assert.equal(lookup.getUserNameOrFallback("200", "Historic member"), "Historic member");
    assert.equal(lookup.getUserNameOrFallback("100", "Historic member"), "Current member");
    assert.equal(lookup.getUserNameOrFallback("500", "NA"), "User (500)");
    assert.equal(lookup.getUserNameOrFallback(null, "Historical actor"), "Historical actor");
    assert.equal(lookup.getUserNameOrFallback(null, "N/A"), "System");
});
