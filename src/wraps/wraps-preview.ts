export type WrapView = "member" | "mentee" | "mentor";
export type MilestoneIcon = "calendar" | "people" | "exam" | "plane" | "chart" | "trophy";
export interface WrapMilestone {
    date: string;
    title: string;
    description: string;
    icon: MilestoneIcon;
    achievement?: boolean;
    detail?: string;
}
export interface AttendanceSummary {joined: number; attended: number; cancelled: number; busiestMonth: string; busiestCount: number}
export interface MentorSummary {delivered: number; supported: number; passed: number; cancelled: number; mocks: number; mockPasses: number}
export interface WrapExam {name: string; attempts: number; passed: boolean}
export interface WrapPeriod {
    attendance: AttendanceSummary;
    memberJourney: WrapMilestone[];
    menteeJourney: WrapMilestone[];
    mentorJourney: WrapMilestone[];
    exams: WrapExam[];
    mentor: MentorSummary;
}
export interface WrapData {example: boolean; asOf: string; year: WrapPeriod; august: WrapPeriod}

/** Deliberately labelled examples for the super-admin design preview. Not account statistics. */
export const wrapPreview: WrapData = {
    example: true,
    asOf: "30 September 2026",
    year: {
        attendance: {joined: 42, attended: 36, cancelled: 3, busiestMonth: "August", busiestCount: 8},
        memberJourney: [
            {date: "12 Jan", title: "Your first session of the year", description: "You started the year in the skies, supporting your first ATCMH session.", icon: "plane"},
            {date: "22 Mar", title: "10 sessions attended", description: "Ten sessions of showing up and helping others progress.", icon: "calendar"},
            {date: "16 Jul", title: "25 sessions attended", description: "Your time made a difference to the next generation of controllers.", icon: "people"},
            {date: "Aug", title: "Your busiest month", description: "8 recorded attendances. A month of making things happen.", icon: "chart", achievement: true},
        ],
        menteeJourney: [
            {date: "14 Feb", title: "Your journey began", description: "You were picked up and started your ATCMH mentorship.", icon: "people"},
            {date: "20 Feb", title: "Your first mentor session", description: "Your first practical training session. The beginning of real progress.", icon: "plane"},
            {date: "18 Apr", title: "Written exam passed", description: "The practice paid off. You passed your written exam.", icon: "exam", detail: "2 attempts"},
            {date: "18 Aug", title: "Mentorship passed", description: "From the first session to your final milestone. Look how far you came.", icon: "trophy", achievement: true, detail: "3 mock practical attempts"},
        ],
        mentorJourney: [
            {date: "8 Jan", title: "Your first session delivered", description: "You helped a mentee take their first step of the year.", icon: "people"},
            {date: "12 May", title: "Your first mentee passed", description: "Your guidance helped someone reach their mentorship milestone.", icon: "trophy", achievement: true},
            {date: "Jun", title: "Your busiest mentoring month", description: "5 completed mentoring sessions. A month of building confidence.", icon: "chart"},
            {date: "18 Aug", title: "Two mentees passed this year", description: "Two new chapters in the skies, with your support along the way.", icon: "trophy", achievement: true},
        ],
        exams: [{name: "Written exam", attempts: 2, passed: true}, {name: "Mock practical", attempts: 3, passed: true}],
        mentor: {delivered: 18, supported: 4, passed: 2, cancelled: 2, mocks: 7, mockPasses: 5},
    },
    august: {
        attendance: {joined: 10, attended: 8, cancelled: 1, busiestMonth: "August", busiestCount: 8},
        memberJourney: [
            {date: "3 Aug", title: "A strong start", description: "Your first recorded attendance of August.", icon: "plane"},
            {date: "24 Aug", title: "Eight times you showed up", description: "Your most active month of 2026 so far.", icon: "chart", achievement: true},
        ],
        menteeJourney: [
            {date: "8 Aug", title: "One more step forward", description: "You put your skills to the test in a mock practical.", icon: "exam"},
            {date: "18 Aug", title: "The milestone you worked for", description: "Your mentorship was marked as passed. Take a moment to enjoy it.", icon: "trophy", achievement: true},
        ],
        mentorJourney: [
            {date: "5 Aug", title: "Building confidence together", description: "The first of 3 mentoring sessions you delivered this month.", icon: "people"},
            {date: "18 Aug", title: "Another mentee passed", description: "One more mentee reached their milestone with your support.", icon: "trophy", achievement: true},
        ],
        exams: [{name: "Mock practical", attempts: 2, passed: true}],
        mentor: {delivered: 3, supported: 2, passed: 1, cancelled: 0, mocks: 2, mockPasses: 1},
    },
};
