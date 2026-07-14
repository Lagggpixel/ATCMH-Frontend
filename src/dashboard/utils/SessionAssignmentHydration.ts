import type {AdminAssignment, AssignmentSlotAssignments} from "../types/AdminAssignment.ts";
import type {SessionAssignment} from "../types/SessionAssignment.ts";

export const chooseSessionAssignmentTemplateId = (
    existingAssignment: SessionAssignment | undefined,
    assignments: AdminAssignment[],
    defaultAssignmentId: number
) => {
    const savedTemplateId = existingAssignment?.assignmentTemplateId;
    if (savedTemplateId != null && assignments.some(assignment => assignment.id === savedTemplateId)) {
        return savedTemplateId;
    }
    return defaultAssignmentId;
};

export const parseSessionAssignmentSlots = (slotAssignmentsJson: string | null | undefined): AssignmentSlotAssignments | undefined => {
    if (!slotAssignmentsJson) return undefined;

    try {
        const parsed = JSON.parse(slotAssignmentsJson);
        if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
            return undefined;
        }

        return Object.fromEntries(
            Object.entries(parsed)
                .map(([key, value]) => {
                    if (typeof value === "string" && value.trim()) {
                        return [key, value] as const;
                    }
                    if (typeof value === "number" && Number.isSafeInteger(value)) {
                        return [key, String(value)] as const;
                    }
                    return undefined;
                })
                .filter((entry): entry is readonly [string, string] => entry != null)
        );
    } catch {
        return undefined;
    }
};
