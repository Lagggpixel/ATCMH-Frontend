export interface StatisticsWindow {
    from: string | null;
    to: string;
    previousFrom: string | null;
    asOf: string;
}
export interface StatisticsMetric { value: number | null; sampleSize: number }
export interface ProgrammePeriod {
    pickups: number; passes: number; terminations: number;
    completedSessions: number; cancelledSessions: number; sessionSampleSize: number;
    cancellationRate: StatisticsMetric; pilotFillRate: StatisticsMetric;
    recordedAttendees: number; requestedPlaces: number;
    medianWaitToPickupDays: StatisticsMetric; medianPickupToPassDays: StatisticsMetric;
}
export interface MentorWorkload {
    mentorId: string; practicalMentees: number;
    completedSessions: number; cancelledSessions: number; lastSessionAt: string | null;
}
export interface StatisticsAttention {
    kind: "waitlist" | "session_inactivity" | "course_inactivity";
    recordId: number; userId: string; courseId: string | null; title: string | null; days: number; href: string;
}
export interface ProgrammeCourse {
    id: string; title: string; learnersStarted: number; learnersCompleted: number; inProgress: number;
    completionRate: StatisticsMetric; inactiveLearners: number;
    starts: number; completions: number; previousStarts: number | null; previousCompletions: number | null;
}
export interface WaitlistDemandSlot { weekday: number; hour: number; waitingMentees: number }
export interface WaitlistDemand {
    waitingMentees: number; usableAvailability: number; missingAvailability: number;
    invalidAvailability: number; noAvailableTimes: number; missingTimezone: number;
    slots: WaitlistDemandSlot[];
    timezones: Array<{timezone: string; waitingMentees: number}>;
}
export interface ProgrammeReport {
    window: StatisticsWindow;
    snapshot: {waitingMentees: number; trainingMentees: number; medianWaitingDays: StatisticsMetric; oldestWaitingDays: number | null; upcomingSessions: number};
    current: ProgrammePeriod; previous: ProgrammePeriod | null;
    weekly: Array<{week: string; completed: number; cancelled: number}>;
    fillTrend: Array<{date: string; attendees: number; requested: number; fillRate: number | null; movingAverage: number | null; sampleSize: number}>;
    heatmap: Array<{weekday: number; hour: number; sessions: number; fillRate: number | null}>;
    mentors: MentorWorkload[];
    attention: StatisticsAttention[];
    courses: {status: "available" | "unavailable" | "forbidden"; message: string | null; rows: ProgrammeCourse[]};
    waitlistDemand?: WaitlistDemand;
}
export interface ExamStatisticsRow {
    quizId: string; title: string; attempts: number; identifiedLearners: number; unidentifiedAttempts: number;
    medianScore: number | null; timedOutAttempts: number; timeoutRate: number | null;
}
export interface ExamStatisticsPeriod {
    attempts: number; identifiedLearners: number; unidentifiedAttempts: number;
    medianScore: number | null; timedOutAttempts: number; timeoutRate: number | null;
}
export interface ExamStatisticsReport {
    window: StatisticsWindow; current: ExamStatisticsPeriod; previous: ExamStatisticsPeriod | null;
    quizzes: ExamStatisticsRow[]; undatedAttempts: number;
}
