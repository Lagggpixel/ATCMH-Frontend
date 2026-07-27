export interface MockQuestionReadiness {
    ready: boolean;
    message: string;
}

export function mockQuestionReadiness(questionCount: number): MockQuestionReadiness {
    if (questionCount <= 0) {
        return {
            ready: false,
            message: "Unavailable: no mock questions are configured. Add at least one question before sending from Discord.",
        };
    }

    return {
        ready: true,
        message: `Ready: ${questionCount} mock question${questionCount === 1 ? " is" : "s are"} configured. Discord can send this set in order.`,
    };
}
