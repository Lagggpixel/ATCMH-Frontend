export interface MockQuestionReadiness {
    ready: boolean;
    message: string;
}

export function mockQuestionReadiness(questionCount: number): MockQuestionReadiness {
    if (questionCount <= 0) {
        return {
            ready: false,
            message: "Needs attention",
        };
    }

    return {
        ready: true,
        message: "Ready",
    };
}
