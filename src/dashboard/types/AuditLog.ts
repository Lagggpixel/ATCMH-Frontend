export interface AuditLog {
    id: number;
    createdAt: number;
    source: string;
    actorId?: string | null;
    actorName?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    summary: string;
    detailsJson?: string | null;
}

export interface AuditLogFilterMetadata {
    sources: string[];
    actions: string[];
    targetTypes: string[];
    actors: Array<{id: string; name: string}>;
}
