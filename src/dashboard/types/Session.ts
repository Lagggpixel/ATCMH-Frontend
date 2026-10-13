export interface Session {

    id: number;

    mentor: string;
    mentee: string;

    // The backend serializes epoch milliseconds; older fixtures and payloads use ISO strings.
    time: string | number;

    airport: string ;
    pilots: number;

    messageId?: string;

    cancelled: boolean;
    retainAttendance?: boolean;
    trainingOutcome?: "UNKNOWN" | "HELD" | "INTERRUPTED" | "NOT_HELD";

    attendees: string[];
    hasAssignment?: boolean;

}
