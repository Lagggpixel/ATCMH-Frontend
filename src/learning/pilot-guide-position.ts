export const pilotGuidePositionKey = "atcmh:pilot-guide:chapter:v1";
export function resolvePilotGuideChapter(ids: string[], hash: string, saved: unknown, initial?: string): string {
    const linked = new URLSearchParams(hash.replace(/^#/, "")).get("chapter");
    return [linked, initial, saved, ids[0]].find((id): id is string => typeof id === "string" && ids.includes(id)) ?? "";
}
export function pilotGuideChapterHash(id: string): string {
    return `#${new URLSearchParams({chapter: id})}`;
}
