import assert from "node:assert/strict";
import test from "node:test";
import {registeredRecruiter} from "./recruiter-selection";

test("recruiter lookup restores canonical spelling without extracting names from free text", () => {
    const names = ["PilotA350", "Syncline"];
    assert.equal(registeredRecruiter(" pilota350 ", names), "PilotA350");
    assert.equal(registeredRecruiter("Sam (username: PilotA350)", names), undefined);
    assert.equal(registeredRecruiter("", names), undefined);
    assert.equal(registeredRecruiter("PilotA350", ["Syncline"]), undefined);
});
