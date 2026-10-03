import {z} from "zod";
import type {PilotGuide, PilotGuideResponse, PilotGuideUpdate} from "@/src/learning/pilot-guide";

const guideDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a valid guide update date.");

const chapterSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    html: z.string(),
});

const writableGuideSchema = z.object({
    title: z.string().min(1),
    introduction: z.string(),
    lastUpdated: guideDate,
    chapters: z.array(chapterSchema).min(1).refine(chapters => new Set(chapters.map(chapter => chapter.id)).size === chapters.length, "Chapter IDs must be unique."),
});

const guideSchema = writableGuideSchema.extend({
    revision: z.number().int().nonnegative().refine(Number.isSafeInteger),
    updatedAt: z.string().datetime({offset: true}).nullable(),
});

export type PilotGuideWriteRequest = PilotGuideUpdate;

/** Compares editable content without rejecting an incomplete local draft. */
export function pilotGuideContentSnapshot(guide: PilotGuide): string {
    return JSON.stringify({
        title: guide.title,
        introduction: guide.introduction,
        lastUpdated: guide.lastUpdated,
        chapters: guide.chapters.map(({id, title, html}) => ({id, title, html})),
    });
}

/** Validates service responses before either reader or editor uses their content. */
export function parsePilotGuideResponse(value: unknown): PilotGuideResponse {
    const parsed = z.object({guide: guideSchema}).safeParse(value);
    if (!parsed.success) throw new Error("The pilot guide service returned invalid guide data.");
    return parsed.data;
}

/** Only writable fields go in the body; If-Match remains the revision authority. */
export function pilotGuideWriteRequest(guide: PilotGuide): PilotGuideWriteRequest {
    return writableGuideSchema.parse(guide);
}

export function pilotGuideRevisionHeader(revision: number): string {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("The pilot guide revision is invalid. Reload the guide before saving.");
    return `"${revision}"`;
}
