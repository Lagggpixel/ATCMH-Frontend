import type {CourseDocumentV1} from "@/src/lib/course-document";

export interface ManagedCourseSummary {
    id: string;
    slug: string;
    title: string;
    description: string;
    isPublished: boolean;
    updatedAt: string;
    sectionCount: number;
    sectionGroupCount?: number;
    navigationMode?: CourseNavigationMode;
}

export type CourseNavigationMode = "sequential" | "section_by_section" | "free";

export interface ManagedCourseSectionGroup {
    id: string;
    courseId?: string;
    title: string;
    sortOrder: number;
}

export interface ManagedCourseDraftGroup extends Omit<ManagedCourseSectionGroup, "id"> {
    id?: string;
}

export interface CoursePrerequisiteSummary {
    courseId: string;
    title: string;
    slug: string;
    completed: boolean;
}

export interface LearnerCourseSummary {
    id: string;
    slug: string;
    title: string;
    description: string;
    sectionCount: number;
    locked: boolean;
    prerequisites: CoursePrerequisiteSummary[];
    hasUnavailablePrerequisites: boolean;
}

export interface ManagedCourseSection {
    id: string;
    courseId: string;
    title: string;
    markdown: string;
    document?: CourseDocumentV1 | null;
    sortOrder: number;
    groupId: string;
    updatedAt?: string;
}

export interface ManagedCourseDraftSection {
    id?: string;
    courseId?: string;
    title: string;
    markdown: string;
    document?: CourseDocumentV1 | null;
    sortOrder: number;
    groupId?: string;
    updatedAt?: string;
}

export interface ManagedCourseDraft {
    id?: string;
    slug: string;
    title: string;
    description: string;
    isPublished: boolean;
    prerequisiteCourseIds: string[];
    navigationMode: CourseNavigationMode;
    sectionGroups: ManagedCourseDraftGroup[];
    sections: ManagedCourseDraftSection[];
}

export interface ManagedCourse extends ManagedCourseSummary {
    prerequisiteCourseIds: string[];
    navigationMode: CourseNavigationMode;
    sectionGroups: ManagedCourseSectionGroup[];
    sections: ManagedCourseSection[];
    quizzes?: CourseQuizSummary[];
    activities?: CourseActivity[];
}

export interface CourseQuizSummary {
    id: string;
    title: string;
    description: string;
    categoryId: string;
    category: string;
    feedbackMode: string;
    timeLimitSeconds: number;
    randomizeQuestions: boolean;
    isPrivate: boolean;
}

export interface CourseQuizProgress {
    quizId: string;
    attemptCount: number;
    bestPercentage: number;
    lastAttemptAt: string | null;
}

export interface CourseEnrollment {
    courseId: string;
    userId: string;
    status: CourseEnrollmentStatus;
    startedAt: string;
    lastAccessedAt: string;
    completedAt: string | null;
    lastSectionId: string | null;
}

export interface LearnerCourse extends Omit<LearnerCourseSummary, "locked" | "prerequisites" | "hasUnavailablePrerequisites"> { sectionGroups: ManagedCourseSectionGroup[];
navigationMode: CourseNavigationMode;
sections: ManagedCourseSection[];
quizzes: CourseQuizSummary[];
activities: CourseActivity[];
completedSectionIds: string[];
takenQuizIds: string[];
quizProgress: CourseQuizProgress[];
enrollment: CourseEnrollment | null;
activityProgress: CourseActivityProgress[]; }

export interface CourseMediaUpload {
    id: string;
    courseId: string;
    filename: string;
    contentType: string;
    kind?: "image" | "video";
    sizeBytes: number;
    sha256: string;
    markdown: string;
}

export type CourseActivityType = "sequence" | "scenario" | "clearance" | "conflict";

export interface CourseActivity {
    id: string;
    courseId: string;
    sectionId?: string | null;
    type: CourseActivityType;
    title: string;
    prompt: string;
    definition: Record<string, unknown>;
    required: boolean;
    passPercentage: number;
}

export interface CourseActivityProgress {
    activityId: string;
    attemptCount: number;
    bestScore: number;
    passed: boolean;
    lastAttemptAt: string | null;
}

export interface CourseActivitySubmission {
    attemptId: string;
    score: number;
    passed: boolean;
    attemptCount: number;
    bestScore: number;
    feedback?: string;
}

export type CourseViewEventType = "open" | "heartbeat" | "close";

export interface CourseViewEventInput {
    eventId: string;
    sessionId: string;
    sectionId?: string | null;
    eventType: CourseViewEventType;
    durationSeconds: number;
}

export type CourseEnrollmentStatus = "in_progress" | "completed";

export interface CourseLearnerStatistics {
    userId: string;
    status: CourseEnrollmentStatus;
    startedAt: string;
    lastAccessedAt: string;
    completedAt: string | null;
    completedSectionCount: number;
    viewed: boolean;
    viewTimeSeconds: number;
}

export interface CourseSectionStatistics {
    sectionId: string;
    title: string;
    sortOrder: number;
    completedCount: number;
    completionRate: number;
}

export interface CourseQuizStatistics {
    quizId: string;
    title: string;
    required: boolean;
    passPercentage: number | null;
    attemptCount: number;
    attemptedLearnerCount: number;
    qualifiedLearnerCount: number;
    qualificationRate: number;
}

export interface CourseActivityStatistics {
    activityId: string;
    title: string;
    required: boolean;
    passPercentage: number;
    attemptCount: number;
    attemptedLearnerCount: number;
    passedLearnerCount: number;
    passRate: number;
}

export interface CourseStatistics {
    courseId: string;
    eligibleLearners: number;
    totalLearnersStarted: number;
    takeRate: number;
    viewedLearners: number;
    viewRate: number;
    learnersInProgress: number;
    learnersCompleted: number;
    completionRate: number;
    activeLearners30d: number;
    averageCompletionDays: number | null;
    totalViewTimeSeconds: number;
    averageViewTimeSeconds: number | null;
    activityAttemptCount: number;
    activityAttemptedLearnerCount: number;
    activityPassedLearnerCount: number;
    activityPassRate: number;
    learners: CourseLearnerStatistics[];
    sections: CourseSectionStatistics[];
    quizzes: CourseQuizStatistics[];
    activities: CourseActivityStatistics[];
}
