export interface SessionAssignment {
    id: number;
    sessionId: number;
    assignmentTemplateId: number | null;
    ownerId: string;
    content: string;
    slotAssignmentsJson: string | null;
    messageId: string;
    threadId: string;
    threadUrl: string;
    title: string;
    sentAt: string;
    updatedAt: string;
}
