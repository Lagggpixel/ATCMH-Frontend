import type {ManagedCourseDraft} from "../../types/Course";

/** Keep saved subsection IDs; let the API assign IDs to new draft subsections. */
export function courseDraftForSave(draft: ManagedCourseDraft, savedSectionIds: ReadonlySet<string>): ManagedCourseDraft {
    return {
        ...draft,
        sections: draft.sections.map(section => section.id && savedSectionIds.has(section.id)
            ? section
            : {...section, id: undefined}),
    };
}
