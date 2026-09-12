import assert from "node:assert/strict";
import {test} from "node:test";
import {alignGroundControlQuiz, groundControlQuizAlignmentState, GROUND_CONTROL_QUIZ_ID} from "./GroundControlQuizAlignment.ts";
import type {ManagedExamQuiz} from "../types/Exam.ts";

function originalQuiz(): ManagedExamQuiz {
    const question = (prompt: string, texts: string[], correct: number) => ({prompt, randomizeOptions: true, options: texts.map((text, index) => ({text, isCorrect: index === correct}))});
    return {
        id: GROUND_CONTROL_QUIZ_ID, title: "Ground Control", description: "Keep description", category: "Initial", categoryId: "folder",
        feedbackMode: "after_submission", timeLimitSeconds: 600, tags: ["ground"], isPrivate: true, randomizeQuestions: true,
        questions: [
            question("What are the main responsibilities of ground control?", [
                "To overlook all the movements of aircraft moving on the aerodrome.", "To solely approve pushback and taxi.",
                "To overlook all the movements of aircrafts moving in ramps, stands, taxiways (and inactive runways where applicable).",
                "To remove workload from tower of managing movements in ramps, stands, taxiways (and inactive runways where applicable).",
            ], 0),
            question("Keep question 2", ["a", "b"], 0), question("Keep question 3", ["c", "d"], 1),
            question("Which of the following should determine runway in use?", [
                "METAR and ATIS", "The colors of the runway numbers indicated on the map (i.e. red, amber, green)", "METAR, ATIS and TAF",
                "METAR, ATIS, TAF and the colors of the runway numbers indicated on the map (i.e. red, amber, green)",
            ], 2), question("Keep question 5", ["e", "f"], 0),
        ],
    };
}

test("aligns only two Ground questions, preserves settings, and is idempotent", () => {
    const original = originalQuiz();
    const snapshot = structuredClone(original);
    const aligned = alignGroundControlQuiz(original);
    assert.deepEqual(original, snapshot);
    assert.deepEqual({...aligned, questions: original.questions}, original);
    for (const index of [1, 2, 4]) assert.equal(aligned.questions[index], original.questions[index]);
    for (const index of [0, 3]) {
        assert.equal(aligned.questions[index].randomizeOptions, true);
        assert.equal(aligned.questions[index].options.filter(option => option.isCorrect).length, 1);
    }
    assert.match(aligned.questions[0].options.find(option => option.isCorrect)!.text, /Tower retains active-runway/);
    assert.match(aligned.questions[3].options.find(option => option.isCorrect)!.text, /ATIS and operational coordination.*METAR for current observed weather and TAF for forecast weather/);
    assert.equal(groundControlQuizAlignmentState(aligned), "aligned");
    assert.equal(alignGroundControlQuiz(aligned), aligned);
});

test("rejects unrelated quiz, changed content, answer keys and question order", () => {
    const variants = [
        (quiz: ManagedExamQuiz) => { quiz.id = "another-quiz"; },
        (quiz: ManagedExamQuiz) => { quiz.questions[0].prompt = "Different question"; },
        (quiz: ManagedExamQuiz) => { quiz.questions[3].options[0].text = "Different option"; },
        (quiz: ManagedExamQuiz) => { quiz.questions[0].options[0].isCorrect = false; },
        (quiz: ManagedExamQuiz) => { [quiz.questions[0], quiz.questions[1]] = [quiz.questions[1], quiz.questions[0]]; },
        (quiz: ManagedExamQuiz) => { quiz.questions.length = 3; },
    ];
    for (const modify of variants) {
        const quiz = originalQuiz(); modify(quiz);
        assert.throws(() => alignGroundControlQuiz(quiz), /does not match/);
    }
});

test("completes a partially aligned draft", () => {
    const quiz = originalQuiz();
    quiz.questions[0] = alignGroundControlQuiz(quiz).questions[0];
    assert.equal(groundControlQuizAlignmentState(quiz), "available");
    assert.equal(groundControlQuizAlignmentState(alignGroundControlQuiz(quiz)), "aligned");
});
