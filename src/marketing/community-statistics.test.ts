import assert from "node:assert/strict";
import test from "node:test";
import {formatCommunityCount, parseCommunityStatistics} from "./community-statistics.ts";

test("member counts round down to hundreds and graduates to fifties", () => {
    for (const [count, members, graduates] of [[0, "0+", "0+"], [49, "0+", "0+"], [50, "0+", "50+"], [99, "0+", "50+"], [100, "100+", "100+"], [749, "700+", "700+"], [750, "700+", "750+"], [780, "700+", "750+"], [800, "800+", "800+"]] as const) {
        assert.equal(formatCommunityCount(count, "members"), members);
        assert.equal(formatCommunityCount(count, "graduates"), graduates);
    }
});

test("only valid complete Discord count responses are shown", () => {
    assert.deepEqual(parseCommunityStatistics({members: 780, graduates: 275}), {members: 780, graduates: 275});
    for (const value of [null, {}, {members: "780", graduates: 200}, {members: 780}, {members: -1, graduates: 0}, {members: 780.5, graduates: 200}, {members: 20, graduates: 50}, {members: 780, graduates: -1}]) {
        assert.throws(() => parseCommunityStatistics(value));
    }
});
