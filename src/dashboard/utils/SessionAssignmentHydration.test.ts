import test from "node:test";
import assert from "node:assert/strict";
import type {AdminAssignment} from "../types/AdminAssignment.ts";
import type {SessionAssignment} from "../types/SessionAssignment.ts";
import {
    chooseSessionAssignmentTemplateId,
    parseSessionAssignmentSlots,
} from "./SessionAssignmentHydration.ts";

const assignments: AdminAssignment[] = [
    {
        id: 1,
        ownerId: "10",
        airport: "KJFK",
        runways: "04L",
        patternAltitude: "1500",
        serverType: "Training",
        title: "Default",
        description: "",
        template: "",
        footer: "",
        active: true,
        groups: [],
    },
    {
        id: 9,
        ownerId: "10",
        airport: "KLAX",
        runways: "24R",
        patternAltitude: "1800",
        serverType: "Training",
        title: "Saved",
        description: "",
        template: "",
        footer: "",
        active: true,
        groups: [],
    },
];

test("chooses the saved assignment template when it is still available", () => {
    const existingAssignment = {
        assignmentTemplateId: 9,
    } as SessionAssignment;

    assert.equal(chooseSessionAssignmentTemplateId(existingAssignment, assignments, 1), 9);
});

test("falls back to the default assignment when the saved template is unavailable", () => {
    const existingAssignment = {
        assignmentTemplateId: 20,
    } as SessionAssignment;

    assert.equal(chooseSessionAssignmentTemplateId(existingAssignment, assignments, 1), 1);
});

test("parses saved slot assignments and ignores malformed values", () => {
    assert.deepEqual(parseSessionAssignmentSlots('{"11":100,"12":null,"13":"300","14":200}'), {
        "11": "100",
        "13": "300",
        "14": "200",
    });
});

test("ignores unsafe numeric Discord IDs because precision is already lost", () => {
    assert.deepEqual(parseSessionAssignmentSlots('{"11":1210021410110447637,"12":"1210021410110447637"}'), {
        "12": "1210021410110447637",
    });
});

test("returns undefined for invalid saved slot assignments", () => {
    assert.equal(parseSessionAssignmentSlots("not json"), undefined);
    assert.equal(parseSessionAssignmentSlots("[]"), undefined);
});
