export interface CommunityStatistics {
    members: number;
    graduates: number;
}

export function parseCommunityStatistics(value: unknown): CommunityStatistics {
    if (!value || typeof value !== "object") throw new Error("Community counts are unavailable");
    const counts = value as Partial<CommunityStatistics>;
    if (!Number.isSafeInteger(counts.members) || !Number.isSafeInteger(counts.graduates)
        || counts.members! < 0 || counts.graduates! < 0 || counts.graduates! > counts.members!) {
        throw new Error("Community counts are unavailable");
    }
    return {members: counts.members!, graduates: counts.graduates!};
}

export function formatCommunityCount(count: number, kind: keyof CommunityStatistics): string {
    const step = kind === "members" ? 100 : 50;
    return `${Math.floor(count / step) * step}+`;
}
