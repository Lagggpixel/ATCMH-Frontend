export interface AdminAssignmentSlot {
    id?: number;
    assignmentId?: number;
    groupName?: string;
    slotOrder?: number;
    label: string;
    details: string;
}

export interface AdminAssignmentGroup {
    name: string;
    slots: AdminAssignmentSlot[];
}

export interface AdminAssignment {
    id: number;
    ownerId: string;
    airport: string;
    runways: string;
    patternAltitude: string;
    serverType: string;
    title: string;
    description: string;
    template: string;
    footer: string;
    active: boolean;
    groups: AdminAssignmentGroup[];
}

export type AssignmentSlotAssignments = Record<string, string | undefined>;

export type AdminAssignmentPayload = Omit<AdminAssignment, "id" | "ownerId" | "active">;
