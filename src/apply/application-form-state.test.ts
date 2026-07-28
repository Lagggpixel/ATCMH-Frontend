import assert from "node:assert/strict";
import test from "node:test";
import type {ApplicationQuestion} from "@/src/dashboard/types/ApplicationQuestion";
import {
    parseApplicationType,
    pruneApplicationAnswers,
    initializeApplicationAnswers,
    validateApplicationAnswers,
    visibleApplicationQuestions,
} from "./application-form-state";

const question = (key: string, sortOrder: number, options: Partial<ApplicationQuestion> = {}): ApplicationQuestion => ({
    key,
    sortOrder,
    prompt: key,
    helpText: null,
    inputType: "TEXT",
    active: true,
    dependsOnKey: null,
    dependsOnValue: null,
    ...options,
});

const questions = [
    question("region", 40),
    question("recruiterName", 30, {dependsOnKey: "hasRecruiter", dependsOnValue: "yes"}),
    question("hasRecruiter", 20, {inputType: "YES_NO", dependsOnKey: "appliedIfatc", dependsOnValue: "true"}),
    question("appliedIfatc", 10, {inputType: "YES_NO"}),
    question("disabled", 50, {active: false}),
];

test("application type parsing accepts only canonical route values", () => {
    assert.equal(parseApplicationType("mentor"), "mentor");
    assert.equal(parseApplicationType("written"), "written");
    assert.equal(parseApplicationType("mock"), "mock");
    assert.equal(parseApplicationType("MENTOR"), null);
    assert.equal(parseApplicationType(null), null);
});

test("conditional questions follow backend ordering and only appear through visible parents", () => {
    assert.deepEqual(visibleApplicationQuestions(questions, {}).map(value => value.key), ["appliedIfatc", "region"]);
    assert.deepEqual(visibleApplicationQuestions(questions, {appliedIfatc: "yes"}).map(value => value.key), ["appliedIfatc", "hasRecruiter", "region"]);
    assert.deepEqual(visibleApplicationQuestions(questions, {appliedIfatc: "yes", hasRecruiter: "yes"}).map(value => value.key), ["appliedIfatc", "hasRecruiter", "recruiterName", "region"]);
});

test("switching a parent answer prunes hidden website progress instead of submitting stale data", () => {
    assert.deepEqual(pruneApplicationAnswers(questions, {
        appliedIfatc: "no",
        hasRecruiter: "yes",
        recruiterName: "Old recruiter",
        region: " Europe ",
        unknown: "forged",
    }), {appliedIfatc: "no", region: "Europe"});
});

test("submission validation covers every currently visible required answer", () => {
    assert.deepEqual(validateApplicationAnswers(questions, {appliedIfatc: "yes", hasRecruiter: "yes", region: "EU"}), {
        recruiterName: "Please answer this question.",
    });
    const numeric = [question("attemptCount", 1, {inputType: "POSITIVE_INTEGER"})];
    assert.equal(validateApplicationAnswers(numeric, {attemptCount: "0"}).attemptCount, "Enter a whole number greater than zero.");
});

test("weekly availability starts with the backend-compatible seven-day default", () => {
    const availability = question("availability", 1, {inputType: "WEEKLY_AVAILABILITY"});
    const initialized = initializeApplicationAnswers([availability], {});

    assert.equal(initialized.availability, [
        "Monday: Not available",
        "Tuesday: Not available",
        "Wednesday: Not available",
        "Thursday: Not available",
        "Friday: Not available",
        "Saturday: Not available",
        "Sunday: Not available",
    ].join("\n"));
    assert.equal(validateApplicationAnswers([availability], initialized).availability, undefined);
});

test("weekly availability initialization preserves a saved draft", () => {
    const availability = question("availability", 1, {inputType: "WEEKLY_AVAILABILITY"});
    const saved = "Monday: 0900-1700\nTuesday: Not available\nWednesday: Not available\nThursday: Not available\nFriday: Not available\nSaturday: Not available\nSunday: Not available";

    assert.equal(initializeApplicationAnswers([availability], {availability: saved}).availability, saved);
    assert.equal(validateApplicationAnswers([availability], {availability: "Monday: whenever"}).availability,
        "Choose valid start and end times for each available day.");
});

test("practical attempt count appears only after an attempted but failed practical", () => {
    const practicalQuestions = [
        question("attemptedPractical", 1, {inputType: "YES_NO"}),
        question("passedPractical", 2, {inputType: "YES_NO", dependsOnKey: "attemptedPractical", dependsOnValue: "yes"}),
        question("attemptCount", 3, {inputType: "POSITIVE_INTEGER", dependsOnKey: "passedPractical", dependsOnValue: "no"}),
    ];
    assert.deepEqual(visibleApplicationQuestions(practicalQuestions, {attemptedPractical: "no"}).map(value => value.key), ["attemptedPractical"]);
    assert.deepEqual(visibleApplicationQuestions(practicalQuestions, {attemptedPractical: "yes", passedPractical: "yes"}).map(value => value.key), ["attemptedPractical", "passedPractical"]);
    assert.deepEqual(visibleApplicationQuestions(practicalQuestions, {attemptedPractical: "yes", passedPractical: "no"}).map(value => value.key), ["attemptedPractical", "passedPractical", "attemptCount"]);
});
