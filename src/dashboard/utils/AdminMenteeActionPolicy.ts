import type {MenteeState} from "../types/AdminMentee.ts";

interface MenteeActionPolicyInput {
    state: MenteeState;
    hasMentor: boolean;
}

export const getMenteeActionPolicy = ({state, hasMentor}: MenteeActionPolicyInput) => ({
    canPickup: state === "waitlisted" && !hasMentor,
    canTerminate: state === "waitlisted" || state === "picked_up",
    canPass: state === "picked_up" && hasMentor,
    canSchedule: state === "picked_up" && hasMentor,
});
