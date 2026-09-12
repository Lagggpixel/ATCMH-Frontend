import type {ExamQuestion, ManagedExamQuiz} from "../types/Exam.ts";

export const GROUND_CONTROL_QUIZ_ID = "be5effff-5b8e-4719-b5e0-87c62b99d549";
export const GROUND_CONTROL_QUIZ_ALIGNMENT_VERSION = "2026-09-ground-course-alignment";

const corrections = [
    {
        index: 0,
        originalPrompt: "What are the main responsibilities of ground control?",
        originalOptions: [
            "To overlook all the movements of aircraft moving on the aerodrome.",
            "To solely approve pushback and taxi.",
            "To overlook all the movements of aircrafts moving in ramps, stands, taxiways (and inactive runways where applicable).",
            "To remove workload from tower of managing movements in ramps, stands, taxiways (and inactive runways where applicable).",
        ],
        correctIndex: 0,
        prompt: "Which statement best describes Ground's responsibility?",
        options: [
            "Ground manages surface movements within its assigned responsibility, including stands, ramps/aprons and taxiways; Tower retains active-runway operations and coordination.",
            "Ground controls every movement on the aerodrome, including all active-runway operations.",
            "Ground only approves pushback; pilots choose their own taxi routes to the runway.",
            "Ground assumes control of active-runway operations whenever Tower has a high workload.",
        ],
    },
    {
        index: 3,
        originalPrompt: "Which of the following should determine runway in use?",
        originalOptions: [
            "METAR and ATIS",
            "The colors of the runway numbers indicated on the map (i.e. red, amber, green)",
            "METAR, ATIS and TAF",
            "METAR, ATIS, TAF and the colors of the runway numbers indicated on the map (i.e. red, amber, green)",
        ],
        correctIndex: 2,
        prompt: "How should Ground identify the operational runway configuration and interpret weather information?",
        options: [
            "Use the METAR and TAF as runway assignments, even when operational information identifies a different configuration.",
            "Use the coloured runway numbers on the Infinite Flight map alone to identify the runway in use.",
            "Use ATIS and operational coordination to identify or confirm the runway configuration; use METAR for current observed weather and TAF for forecast weather.",
            "Use the TAF to assign the current runway and the METAR only to predict later runway changes.",
        ],
    },
] as const;

function matches(question: ExamQuestion | undefined, prompt: string, options: readonly string[], correctIndex: number): boolean {
    return question?.prompt === prompt && question.options.length === options.length
        && question.options.every((option, index) => option.text === options[index] && option.isCorrect === (index === correctIndex));
}

export type GroundControlQuizAlignmentState = "unrelated" | "available" | "aligned" | "changed";

export function groundControlQuizAlignmentState(quiz: ManagedExamQuiz): GroundControlQuizAlignmentState {
    if (quiz.id !== GROUND_CONTROL_QUIZ_ID) return "unrelated";
    let needsUpdate = false;
    for (const correction of corrections) {
        const question = quiz.questions[correction.index];
        if (matches(question, correction.prompt, correction.options, correction.correctIndex)) continue;
        if (!matches(question, correction.originalPrompt, correction.originalOptions, correction.correctIndex)) return "changed";
        needsUpdate = true;
    }
    return needsUpdate ? "available" : "aligned";
}

/** Stages only the two reviewed questions. Persistence remains the normal Save quiz action. */
export function alignGroundControlQuiz(quiz: ManagedExamQuiz): ManagedExamQuiz {
    const state = groundControlQuizAlignmentState(quiz);
    if (state === "aligned") return quiz;
    if (state !== "available") throw new Error("Ground quiz alignment does not match these questions. Review them manually before making changes.");
    return {
        ...quiz,
        questions: quiz.questions.map((question, index) => {
            const correction = corrections.find(item => item.index === index);
            return correction ? {
                ...question,
                prompt: correction.prompt,
                options: question.options.map((option, optionIndex) => ({
                    ...option,
                    text: correction.options[optionIndex],
                    isCorrect: optionIndex === correction.correctIndex,
                })),
            } : question;
        }),
    };
}
