export type ExamManagementCapability =
    | "manage-exams"
    | "import-exams"
    | "unlock-learners"
    | "review-attempts"
    | "publish-exams"
    | "manage-taxonomy"
    | "manage-system";

export interface ExamManagementActor {
    discordId: string;
    canManageAll: boolean;
    capabilities: ExamManagementCapability[];
}

export interface ExamQuizSummary {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    feedbackMode?: ExamFeedbackMode;
    timeLimitSeconds?: number;
    randomizeQuestions?: boolean;
    isPrivate: boolean;
    updatedAt?: string | null;
}

export interface ExamCategory {
    id: string;
    name: string;
    parentId: string | null;
}

export type ExamFeedbackMode = "after_submission" | "after_each_question" | "none";

export interface ExamQuestionOption {
    text: string;
    isCorrect: boolean;
}

export interface ExamQuestion {
    prompt: string;
    randomizeOptions: boolean;
    options: ExamQuestionOption[];
}

/** A quiz payload is validated by the Exams API before it is persisted. */
export interface ManagedExamQuiz {
    id?: string;
    title: string;
    description: string;
    category: string;
    feedbackMode: ExamFeedbackMode;
    timeLimitSeconds: number;
    tags: string[];
    isPrivate: boolean;
    randomizeQuestions: boolean;
    questions: ExamQuestion[];
}

export interface ExamQuizSaveResult {
    valid?: boolean;
    quiz?: ExamQuizSummary;
    errors?: ExamImportError[];
}

export interface ExamQuizUnlock {
    discordId: string;
    userName?: string | null;
    unlockedBy: string;
    unlockedAt: string;
}

export interface ExamQuizUnlockUpdate {
    discordId: string;
    userName?: string;
    unlocked: boolean;
}

export interface ExamQuizUnlockUpdateResult extends ExamQuizUnlockUpdate {
    quizId: string;
}

export type ExamAttemptStatus = "submitted" | "timed_out";
export type ExamAttemptSubmissionReason = "manual" | "timeout";

export interface ExamAttemptSummary {
    id: string;
    code: string;
    quizId: string;
    quizTitle: string;
    studentName: string;
    studentDiscordId: string | null;
    score: number;
    total: number;
    percentage: number;
    submittedAt: string | null;
    status: ExamAttemptStatus;
    submissionReason: ExamAttemptSubmissionReason;
}

export type ExamAttemptReview = {available: false} | {
    available: true;
    revealCorrectness: boolean;
    questions: Array<{
        prompt: string;
        selectedText: string | null;
        correctText: string | null;
        state: "correct" | "incorrect" | "unanswered" | "selected";
    }>;
};

export interface ExamAttemptDetail extends ExamAttemptSummary {
    review: ExamAttemptReview;
}

export interface ExamAttemptPage {
    attempts: ExamAttemptSummary[];
    page: number;
    pageSize: number;
    total: number;
}

export interface ExamWebsiteAnnouncement {
    id?: string;
    content: string;
    sortOrder: number;
}

export interface ExamWebsitePage {
    id?: string;
    slug: string;
    title: string;
    content: string;
    createdAt?: string;
    updatedAt?: string;
}

/** Structured content only. The site never accepts executable management code. */
export interface ExamWebsiteContent {
    home: {
        id: string;
        title: string;
        intro: string;
        headerTitle: string;
        headerSubtitle: string;
    } | null;
    announcements: ExamWebsiteAnnouncement[];
    pages: ExamWebsitePage[];
}

export interface ExamImportError {
    path: string;
    message: string;
}

/** The API validates this object again at commit time; the Dashboard never treats it as trusted. */
export type NormalizedExamImport = Record<string, unknown>;

export interface ExamImportPreview {
    valid: boolean;
    errors: ExamImportError[];
    normalizedImport?: NormalizedExamImport;
    idempotencyKey?: string;
}

export interface ExamImportCommitResult extends ExamImportPreview {
    result?: {quizId?: string | number};
}
