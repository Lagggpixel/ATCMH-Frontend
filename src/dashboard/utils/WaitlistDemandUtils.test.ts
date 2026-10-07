import assert from "node:assert/strict";
import test from "node:test";
import {demandSlotLabel} from "./WaitlistDemandUtils";

test("slot labels make UTC and the midnight end boundary explicit", () => {
    assert.equal(demandSlotLabel({weekday: 0, hour: 9}), "Monday 09:00–10:00 UTC");
    assert.equal(demandSlotLabel({weekday: 6, hour: 23}), "Sunday 23:00–24:00 UTC");
});
