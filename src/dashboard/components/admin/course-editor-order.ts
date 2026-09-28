import type {ManagedCourseDraft} from "../../types/Course";

export function orderedCourseDraft(
    draft: ManagedCourseDraft,
    groups = draft.sectionGroups,
    sections = draft.sections,
): ManagedCourseDraft {
    const nextGroups = groups.map((group, index) => ({...group, sortOrder: index + 1}));
    const order = new Map(nextGroups.map(group => [group.id, group.sortOrder]));
    const nextSections = [...sections]
        .sort((a, b) => (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0))
        .map((section, index) => ({...section, sortOrder: index + 1}));
    return {...draft, sectionGroups: nextGroups, sections: nextSections};
}
