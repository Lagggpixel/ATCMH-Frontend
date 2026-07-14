import test from "node:test";
import assert from "node:assert/strict";
import {validateExamImportFile} from "./ExamImportFile.ts";

test("accepts a JSON import within the client-side size limit", () => {
    assert.equal(validateExamImportFile(new File(["{}"], "quiz.json", {type: "application/json"})), undefined);
});

test("rejects an unsupported import type before it reaches the Exams API", () => {
    assert.match(
        validateExamImportFile(new File(["<html/>",], "quiz.html", {type: "text/html"})) ?? "",
        /JSON or CSV/
    );
});

test("rejects an import larger than one megabyte before preview", () => {
    assert.match(
        validateExamImportFile(new File([new Uint8Array(1_048_577)], "quiz.csv", {type: "text/csv"})) ?? "",
        /1 MB/
    );
});
