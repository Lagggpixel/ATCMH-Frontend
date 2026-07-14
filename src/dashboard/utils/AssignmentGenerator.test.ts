import test from "node:test";
import assert from "node:assert/strict";
import {
    autoFillAssignmentSlots,
    generateAssignmentText,
} from "./AssignmentGenerator.ts";
import type {AdminAssignment} from "../types/AdminAssignment.ts";

const assignment: AdminAssignment = {
    id: 1,
    ownerId: "10",
    airport: "EDDK",
    runways: "32L and 32R",
    patternAltitude: "1800",
    serverType: "Training",
    title: "EDDK training",
    description: "Practice session",
    template: "Airport: **{{airport}}**\n\nRunways: **{{runways}}**\n\nPattern Altitude: **{{patternAltitude}}**\n\n{{groups}}\n\n{{footer}}",
    footer: "Thanks for helping out today!",
    active: true,
    groups: [
        {
            name: "Ground",
            slots: [
                {id: 11, label: "Cargo Apron Stand F21", details: "Pushback conflict with BELOW"},
                {id: 12, label: "Cargo Apron Stand F23", details: "Pushback conflict with ABOVE"},
            ],
        },
        {
            name: "Inbound",
            slots: [
                {id: 13, label: "EDKZ", details: "Runway 25 | Transition"},
            ],
        },
    ],
};

test("auto-fill maps attendees to slots in slot order", () => {
    assert.deepEqual(autoFillAssignmentSlots(assignment, ["100", "200"]), {
        "11": "100",
        "12": "200",
    });
});

test("auto-fill uses fallback keys for unsaved slots and never duplicates attendees", () => {
    const unsavedAssignment: AdminAssignment = {
        ...assignment,
        groups: [
            {
                name: "Ground",
                slots: [
                    {id: 0, label: "Cargo Apron Stand F21", details: ""},
                    {id: 0, label: "Cargo Apron Stand F23", details: ""},
                    {id: 0, label: "Cargo Apron Stand W34", details: ""},
                ],
            },
        ],
    };

    assert.deepEqual(autoFillAssignmentSlots(unsavedAssignment, ["100", "100", "200"]), {
        "0-0": "100",
        "0-1": "200",
    });
});

test("generated assignment text fills placeholders and mentions assigned attendees", () => {
    const output = generateAssignmentText(assignment, {
        "11": "100",
        "13": "300",
    });

    assert.match(output, /Airport: \*\*EDDK\*\*/);
    assert.match(output, /Runways: \*\*32L and 32R\*\*/);
    assert.match(output, /__Ground:__/);
    assert.match(output, /<@100> - Cargo Apron Stand F21 \| Pushback conflict with BELOW/);
    assert.match(output, /@ - Cargo Apron Stand F23 \| Pushback conflict with ABOVE/);
    assert.match(output, /<@300> - EDKZ \| Runway 25 \| Transition/);
});

test("generated assignment text fills session count and mentee placeholders", () => {
    const output = generateAssignmentText({
        ...assignment,
        template: "Session {{session_count}} for {{mentee}} at {{airport}}",
    }, {}, {
        sessionCount: 5,
        mentee: "Zjthejoker",
    });

    assert.equal(output, "Session 5 for Zjthejoker at EDDK");
});

test("generated assignment text fills placeholders inside description and footer", () => {
    const output = generateAssignmentText({
        ...assignment,
        description: "Mentor: {{mentorTag}}\nServer: **{{serverType}}**\nAirport: **{{airport}}**",
        footer: "Session {{session_count}} for {{mentee}}",
        template: "{{description}}\n\n{{footer}}",
    }, {}, {
        mentorTag: "<@968126530410663966>",
        sessionCount: 7,
        mentee: "Zjthejoker",
    });

    assert.equal(output, "Mentor: <@968126530410663966>\nServer: **Training**\nAirport: **EDDK**\n\nSession 7 for Zjthejoker");
});
