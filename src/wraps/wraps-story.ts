import type {MilestoneIcon, WrapData, WrapPeriod, WrapView} from "./wraps-preview";

export interface WrapStoryStat {
    period: string;
    value: number | string;
    label: string;
    description: string;
    icon: MilestoneIcon;
}

/** Reuse the overview data so the introduction and final totals always agree. */
export function wrapStoryStats(data: WrapData, view: WrapView): WrapStoryStat[] {
    function periodStats(period: WrapPeriod, title: string, annual: boolean): WrapStoryStat[] {
        const stats: WrapStoryStat[] = [];
        const add = (value: number | string, label: string, description: string, icon: MilestoneIcon) => stats.push({period: title, value, label, description, icon});
        if (view === "mentor") {
            add(period.mentor.delivered, "Sessions delivered", "Time spent helping the next generation of controllers.", "people");
            add(period.mentor.supported, "Mentees supported", "Your guidance helped them move forward.", "people");
            add(period.mentor.passed, "Mentees passed", "New chapters in the skies, with your support.", "trophy");
            add(period.mentor.cancelled, "Hosted sessions cancelled", "Your cancelled mentoring sessions in this period.", "calendar");
            add(period.mentor.mocks, "Mock exams conducted", "Practice assessments that helped build confidence.", "exam");
            add(period.mentor.mockPasses, "Passed mock attempts", "Recorded mock results, separate from official IFATC exams.", "trophy");
        }
        add(period.attendance.attended, "Recorded attendances", view === "mentor" ? "You showed up as a participant, too." : "Every session was another step forward.", "plane");
        add(period.attendance.joined, "Sessions joined", "The sessions you signed up for in this period.", "calendar");
        add(period.attendance.cancelled, "Sign-ups cancelled", "Your personal cancellations in this period.", "calendar");
        if (view === "mentee") {
            for (const exam of period.exams) add(exam.attempts, `${exam.name} ${exam.attempts === 1 ? "attempt" : "attempts"}`, exam.passed ? "Your latest recorded result: passed." : "Another opportunity to learn and progress.", "exam");
            const milestone = period.menteeJourney.findLast(item => item.achievement);
            if (milestone) add(milestone.date, "Mentorship passed", milestone.description, "trophy");
        } else if (annual) {
            add(period.attendance.busiestMonth, "Your busiest month", `${period.attendance.busiestCount} recorded attendances. A month of making things happen.`, "chart");
        }
        return stats;
    }
    return [...periodStats(data.year, "2026 · Year to date", true), ...periodStats(data.august, "August 2026", false)];
}
