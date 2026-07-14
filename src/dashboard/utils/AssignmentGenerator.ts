import type {AdminAssignment, AssignmentSlotAssignments} from "../types/AdminAssignment.ts";

const slotKey = (slotId: number | undefined, fallback: string) => String(slotId && slotId > 0 ? slotId : fallback);

export interface AssignmentTextContext {
    sessionCount?: number;
    mentee?: string;
    mentorTag?: string;
}

export const autoFillAssignmentSlots = (assignment: AdminAssignment, attendees: string[]): AssignmentSlotAssignments => {
    const assignments: AssignmentSlotAssignments = {};
    const uniqueAttendees = Array.from(new Set(attendees));
    let attendeeIndex = 0;

    assignment.groups.forEach((group, groupIndex) => {
        group.slots.forEach((slot, slotIndex) => {
            const attendee = uniqueAttendees[attendeeIndex++];
            if (attendee != null) {
                assignments[slotKey(slot.id, `${groupIndex}-${slotIndex}`)] = attendee;
            }
        });
    });

    return assignments;
};

export const generateAssignmentText = (
    assignment: AdminAssignment,
    assignments: AssignmentSlotAssignments,
    context: AssignmentTextContext = {}
) => {
    const groups = renderGroups(assignment, assignments);
    const replacements: [string, string][] = [
        ["{{airport}}", assignment.airport],
        ["{{runways}}", assignment.runways],
        ["{{patternAltitude}}", assignment.patternAltitude],
        ["{{serverType}}", assignment.serverType],
        ["{{session_count}}", String(context.sessionCount ?? "")],
        ["{{mentee}}", context.mentee ?? ""],
        ["{{groups}}", groups],
        ["{{mentorTag}}", context.mentorTag ?? ""]
    ];
    return renderPlaceholders(assignment.template, [
        ...replacements,
        ["{{description}}", renderPlaceholders(assignment.description, replacements)],
        ["{{footer}}", renderPlaceholders(assignment.footer, replacements)]
    ]).trim();
};

export const getAssignmentSlotKey = slotKey;

const renderGroups = (assignment: AdminAssignment, assignments: AssignmentSlotAssignments) => {
    return assignment.groups.map((group, groupIndex) => {
        const lines = group.slots.map((slot, slotIndex) => {
            const attendee = assignments[slotKey(slot.id, `${groupIndex}-${slotIndex}`)];
            const prefix = attendee == null ? "@" : `<@${attendee}>`;
            const details = slot.details.trim();
            return `${prefix} - ${slot.label}${details ? ` | ${details}` : ""}`;
        });

        return [`__${group.name}:__`, "", ...lines].join("\n");
    }).join("\n\n");
};

const renderPlaceholders = (text: string, replacements: [string, string][]) => {
    return replacements.reduce((rendered, [placeholder, value]) => rendered.split(placeholder).join(value), text);
};
