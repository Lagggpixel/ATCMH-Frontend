export interface ManagedCourseSummary {
    id: string;
    slug: string;
    title: string;
    description: string;
    isPublished: boolean;
    updatedAt: string;
    sectionCount: number;
}

export interface ManagedCourseSection {
    id?: string;
    courseId?: string;
    title: string;
    markdown: string;
    sortOrder: number;
    updatedAt?: string;
}

export interface ManagedCourseDraft {
    id?: string;
    slug: string;
    title: string;
    description: string;
    isPublished: boolean;
    sections: ManagedCourseSection[];
}

export interface ManagedCourse extends ManagedCourseSummary {
    id: string;
    sections: ManagedCourseSection[];
}

export interface CourseMediaUpload {
    id: string;
    courseId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
    markdown: string;
}

export type CourseEnrollmentStatus = "in_progress" | "completed";

export interface CourseLearnerStatistics {
    userId: string;
    status: CourseEnrollmentStatus;
    startedAt: string;
    lastAccessedAt: string;
    completedAt: string | null;
    completedSectionCount: number;
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

export interface CourseStatistics {
    courseId: string;
    totalLearnersStarted: number;
    learnersInProgress: number;
    learnersCompleted: number;
    completionRate: number;
    activeLearners30d: number;
    averageCompletionDays: number | null;
    learners: CourseLearnerStatistics[];
    sections: CourseSectionStatistics[];
    quizzes: CourseQuizStatistics[];
}
