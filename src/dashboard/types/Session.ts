export interface Session {

    id: number;

    mentor: string;
    mentee: string;

    time: string;

    airport: string ;
    pilots: number;

    messageId?: string;

    cancelled: boolean;

    attendees: string[];
    hasAssignment?: boolean;

}
