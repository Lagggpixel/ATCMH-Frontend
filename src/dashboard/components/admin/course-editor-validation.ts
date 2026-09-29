import {validateCourseDocument, type CourseDocumentV1} from "../../../lib/course-document";
import type {ManagedCourseDraft} from "../../types/Course";

export interface CourseDraftIssue {
    message: string;
    sectionId?: string;
    groupId?: string;
    blockId?: string;
    field?: "title" | "slug" | "group" | "section";
}

const STAGED_MEDIA_ID = "00000000-0000-4000-8000-000000000001";

export function validateCourseDraftForSave(draft: ManagedCourseDraft, pendingMediaIds: ReadonlySet<string>): CourseDraftIssue | null {
    if (!draft.title.trim() || draft.title.length > 255) return {field: "title", message: "Enter a course title (255 characters maximum)."};
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug.trim()) || draft.slug.length > 200) {
        return {field: "slug", message: "Use lowercase letters, numbers, and hyphens for the course slug."};
    }
    if (draft.description.length > 2000) return {message: "The course description must be 2,000 characters or fewer."};
    if (draft.sectionGroups.length < 1 || draft.sectionGroups.length > 200 || draft.sections.length < 1 || draft.sections.length > 200) {
        return {message: "A course must have between 1 and 200 sections and subsections."};
    }
    for (const group of draft.sectionGroups) {
        if (!group.title.trim() || group.title.length > 255) return {field: "group", groupId: group.id, message: "Enter a title for every section (255 characters maximum)."};
    }
    for (const [index, section] of draft.sections.entries()) {
        const prefix = `Subsection ${index + 1}`;
        if (!section.title.trim() || section.title.length > 255) return {field: "section", sectionId: section.id, message: `${prefix} needs a title (255 characters maximum).`};
        if (!draft.sectionGroups.some(group => group.id === section.groupId)) return {sectionId: section.id, message: `${prefix} needs a valid parent section.`};
        const document = section.document;
        if (!document) return {sectionId: section.id, message: `${prefix} has no document.`};
        for (const block of document.blocks) {
            if (block.type === "media" && !block.mediaId && !pendingMediaIds.has(block.id)) {
                return {sectionId: section.id, blockId: block.id, message: `${prefix}: attach a file to the media block or remove it.`};
            }
        }
        const staged: CourseDocumentV1 = {version: 1, blocks: document.blocks.map(block => block.type === "media" && !block.mediaId && pendingMediaIds.has(block.id)
            ? {...block, mediaId: STAGED_MEDIA_ID} : block)};
        for (const block of staged.blocks) {
            try { validateCourseDocument({version: 1, blocks: [block]}); }
            catch (reason) { return {sectionId: section.id, blockId: block.id, message: `${prefix}: ${reason instanceof Error ? reason.message : "invalid content"}`}; }
        }
        try { validateCourseDocument(staged); }
        catch (reason) { return {sectionId: section.id, message: `${prefix}: ${reason instanceof Error ? reason.message : "invalid content"}`}; }
    }
    return null;
}
