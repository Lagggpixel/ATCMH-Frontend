import type {Session} from "./Session.ts";

export type MenteeState = "waitlisted" | "picked_up" | "passed" | "terminated";
export type ApiTimestamp = string | number;

export interface AdminMentee {
    id: number;
    mentee: string;
    channel: string;
    recruiter?: string;
    practicalMentor?: string;
    writtenMentor?: string;
    waitlistTime: ApiTimestamp;
    pickupTime?: ApiTimestamp;
    passedTime?: ApiTimestamp;
    terminatedTime?: ApiTimestamp;
    terminationReason?: string;
    state: MenteeState;
    ifcId?: string;
    ifcName?: string;
    sessions: Session[];
}
