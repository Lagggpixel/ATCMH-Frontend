export type SessionRating = "Correctly handled" | "Mostly correctly handled" | "Mostly incorrectly handled" | "Incorrect" | "Not assessed";
export interface SavedSessionFeedback {
    status: "READY" | "UNAVAILABLE" | "NOT_GENERATED" | "RUNNING";
    generatedAt?: string;
    data?: {
        sessionId: number;
        threadUrl: string;
        sourceMessages: number;
        coverage: string;
        summary: {
            overview: {text: string};
            keyFeedback?: {text: string}[];
            progress?: {text: string}[];
            followUp?: {text: string}[];
            uncertainties: string[];
            assessment?: {
                context: "HELD" | "INTERRUPTED" | "NOT_HELD" | "UNKNOWN";
                rubricVersion: string;
                categories: {category: string; rating: SessionRating; confidence: number}[];
            };
        };
    };
}
export interface RecentFeedback {sessionId: number; time: string; airport: string; feedback: SavedSessionFeedback;}
