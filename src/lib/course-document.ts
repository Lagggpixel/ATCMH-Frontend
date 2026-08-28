export type CourseMediaKind = "image" | "video";
export type CourseMediaWidth = "content" | "wide" | "full";
export type CourseMediaAlign = "left" | "center" | "right";
export type CourseCalloutTone = "mandatory" | "recommended" | "warning" | "example" | "mistake" | "info";

export interface CourseTextBlock {
    id: string;
    type: "text";
    markdown: string;
}

export interface CourseMediaBlock {
    id: string;
    type: "media";
    mediaId: string;
    kind: CourseMediaKind;
    alt?: string;
    caption?: string;
    width: CourseMediaWidth;
    align: CourseMediaAlign;
    controls?: boolean;
    posterMediaId?: string;
}

export interface CourseCalloutBlock {
    id: string;
    type: "callout";
    tone: CourseCalloutTone;
    title: string;
    markdown: string;
}

export interface CourseDiagramBlock {
    id: string;
    type: "diagram";
    diagramId: string;
    props?: Record<string, string | number | boolean>;
}

export interface CourseQuizBlock {
    id: string;
    type: "quiz";
    quizId: string;
    required: boolean;
    passPercent?: number;
}

export interface CourseActivityBlock {
    id: string;
    type: "activity";
    activityId: string;
    required: boolean;
    passPercent?: number;
}

export type CourseBlock =
    | CourseTextBlock
    | CourseMediaBlock
    | CourseCalloutBlock
    | CourseDiagramBlock
    | CourseQuizBlock
    | CourseActivityBlock;

export interface CourseDocumentV1 {
    version: 1;
    blocks: CourseBlock[];
}

export type CourseDocumentReference =
    | { type: "quiz"; id: string; required: boolean; passPercent?: number }
    | { type: "activity"; id: string; required: boolean; passPercent?: number }
    | { type: CourseMediaKind; id: string; kind: CourseMediaKind }
    | { type: "diagram"; id: string };

export class CourseDocumentValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CourseDocumentValidationError";
    }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIAGRAM_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const HTML_TAG = /<\/?[a-z][^>]*>/i;
const BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MEDIA_DIRECTIVE = /^\{\{(image|video):([0-9a-f-]{36})\}\}$/i;
const QUIZ_DIRECTIVE = /^\{\{quiz:([0-9a-f-]{36})(?:\s+(required|optional))?(?:\s+pass:(\d{1,3}))?\}\}$/i;
const ACTIVITY_DIRECTIVE = /^\{\{activity:([0-9a-f-]{36})(?:\s+(required|optional))?(?:\s+pass:(\d{1,3}))?\}\}$/i;
const DIAGRAM_DIRECTIVE = /^\{\{diagram:([a-z0-9][a-z0-9-]{0,79})\}\}$/i;
const TYPED_DIRECTIVE = /\{\{/;
const DOCUMENT_FIELDS = new Set(["version", "blocks"]);
const BLOCK_FIELDS: Record<CourseBlock["type"], Set<string>> = {
    text: new Set(["id", "type", "markdown"]),
    media: new Set(["id", "type", "mediaId", "kind", "alt", "caption", "width", "align", "controls", "posterMediaId"]),
    callout: new Set(["id", "type", "tone", "title", "markdown"]),
    diagram: new Set(["id", "type", "diagramId", "props"]),
    quiz: new Set(["id", "type", "quizId", "required", "passPercent"]),
    activity: new Set(["id", "type", "activityId", "required", "passPercent"]),
};

function generatedId() {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, name: string, maxLength: number): string;
function stringField(value: unknown, name: string, maxLength: number, required: true): string;
function stringField(value: unknown, name: string, maxLength: number, required: false): string | undefined;
function stringField(value: unknown, name: string, maxLength: number, required: boolean): string | undefined;
function stringField(value: unknown, name: string, maxLength: number, required = true): string | undefined {
    if (value === undefined && !required) return undefined;
    if (typeof value !== "string" || (required && !value.trim()) || value.length > maxLength) {
        throw new CourseDocumentValidationError(`${name} is invalid`);
    }
    return value;
}

function validatePercentage(value: unknown) {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
        throw new CourseDocumentValidationError("Passing scores must be whole numbers between 1 and 100");
    }
    return value;
}

function validateBlock(raw: unknown, index: number, seen: Set<string>): CourseBlock {
    if (!isRecord(raw)) throw new CourseDocumentValidationError(`Course block ${index + 1} is invalid`);
    const id = stringField(raw.id, `Course block ${index + 1} ID`, 120);
    if (!BLOCK_ID.test(id)) throw new CourseDocumentValidationError(`Course block ${index + 1} ID is invalid`);
    if (seen.has(id)) throw new CourseDocumentValidationError(`Course block IDs must be unique: ${id}`);
    seen.add(id);
    const type = raw.type;
    if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(BLOCK_FIELDS, type)) throw new CourseDocumentValidationError(`Unsupported course block type: ${String(type)}`);
    for (const key of Object.keys(raw)) if (!BLOCK_FIELDS[type as CourseBlock["type"]].has(key)) {
        throw new CourseDocumentValidationError(`Course block contains an unsupported field: ${key}`);
    }
    if (type === "text") {
        const markdown = stringField(raw.markdown, `Course text block ${index + 1}`, 1_000_000);
        if (HTML_TAG.test(markdown)) throw new CourseDocumentValidationError("Raw HTML is not allowed in course text");
        if (TYPED_DIRECTIVE.test(markdown)) throw new CourseDocumentValidationError("Typed directives must be separate course blocks");
        return {id, type, markdown};
    }
    if (type === "media") {
        const mediaId = stringField(raw.mediaId, `Course media block ${index + 1} media ID`, 36);
        if (!UUID.test(mediaId)) throw new CourseDocumentValidationError("Course media IDs must be UUIDs");
        const kind = raw.kind;
        if (kind !== "image" && kind !== "video") throw new CourseDocumentValidationError("Course media kind is invalid");
        const alt = stringField(raw.alt, `Course ${kind} alt text`, 500, kind === "image");
        const width = raw.width === undefined ? "content" : raw.width;
        const align = raw.align === undefined ? "center" : raw.align;
        if (width !== "content" && width !== "wide" && width !== "full") throw new CourseDocumentValidationError("Course media width is invalid");
        if (align !== "left" && align !== "center" && align !== "right") throw new CourseDocumentValidationError("Course media alignment is invalid");
        if (kind === "image" && (raw.controls !== undefined || raw.posterMediaId !== undefined)) {
            throw new CourseDocumentValidationError("Images cannot define video controls or a poster");
        }
        if (kind === "video" && raw.controls !== undefined && typeof raw.controls !== "boolean") {
            throw new CourseDocumentValidationError("Course video controls must be a boolean");
        }
        const posterMediaId = raw.posterMediaId === undefined ? undefined : stringField(raw.posterMediaId, "Course video poster ID", 36);
        if (posterMediaId !== undefined && !UUID.test(posterMediaId)) throw new CourseDocumentValidationError("Course video poster IDs must be UUIDs");
        const caption = raw.caption === undefined ? undefined : stringField(raw.caption, "Course media caption", 1_000, false);
        const controls = kind === "video" ? raw.controls === undefined ? true : raw.controls as boolean : undefined;
        return {id, type, mediaId: mediaId.toLowerCase(), kind, alt, ...(caption?.trim() ? {caption: caption.trim()} : {}), width, align,
            ...(kind === "video" ? {controls} : {}),
            ...(posterMediaId ? {posterMediaId: posterMediaId.toLowerCase()} : {})};
    }
    if (type === "callout") {
        const tone = raw.tone === undefined ? "info" : raw.tone;
        if (!["mandatory", "recommended", "warning", "example", "mistake", "info"].includes(String(tone))) {
            throw new CourseDocumentValidationError("Course callout tone is invalid");
        }
        const title = stringField(raw.title, "Course callout title", 160);
        const markdown = stringField(raw.markdown, "Course callout body", 20_000);
        if (HTML_TAG.test(markdown)) throw new CourseDocumentValidationError("Raw HTML is not allowed in course callouts");
        if (TYPED_DIRECTIVE.test(markdown)) throw new CourseDocumentValidationError("Typed directives must be separate course blocks");
        return {id, type, tone: tone as CourseCalloutTone, title, markdown};
    }
    if (type === "diagram") {
        const diagramId = stringField(raw.diagramId, "Course diagram ID", 80).toLowerCase();
        if (!DIAGRAM_ID.test(diagramId)) throw new CourseDocumentValidationError("Course diagram IDs are invalid");
        const props = raw.props === undefined ? undefined : raw.props;
        if (props !== undefined && (!isRecord(props) || Object.keys(props).length > 40 || Object.values(props).some(value => !["string", "number", "boolean"].includes(typeof value)))) {
            throw new CourseDocumentValidationError("Course diagram properties are invalid");
        }
        return {id, type, diagramId, ...(props ? {props: props as Record<string, string | number | boolean>} : {})};
    }
    if (type === "quiz" || type === "activity") {
        const field = type === "quiz" ? "quizId" : "activityId";
        const referenceId = stringField(raw[field], `Course ${type} ID`, 36);
        if (!UUID.test(referenceId)) throw new CourseDocumentValidationError(`Course ${type} IDs must be UUIDs`);
        const required = raw.required === undefined ? false : raw.required;
        if (typeof required !== "boolean") throw new CourseDocumentValidationError(`Course ${type} required flag is invalid`);
        const passPercent = validatePercentage(raw.passPercent);
        if (passPercent !== undefined && !required) throw new CourseDocumentValidationError(`A passing score can only be set on a required ${type}`);
        return {id, type, [field]: referenceId.toLowerCase(), required, ...(passPercent === undefined ? {} : {passPercent})} as CourseQuizBlock | CourseActivityBlock;
    }
    throw new CourseDocumentValidationError(`Unsupported course block type: ${String(type)}`);
}

export function validateCourseDocument(document: unknown): CourseDocumentV1 {
    if (!isRecord(document) || document.version !== 1 || !Array.isArray(document.blocks)) {
        throw new CourseDocumentValidationError("Course document version is unsupported");
    }
    for (const key of Object.keys(document)) if (!DOCUMENT_FIELDS.has(key)) {
        throw new CourseDocumentValidationError(`Course document contains an unsupported field: ${key}`);
    }
    if (document.blocks.length === 0 || document.blocks.length > 500) {
        throw new CourseDocumentValidationError("A course document must contain between 1 and 500 blocks");
    }
    const seen = new Set<string>();
    return {version: 1, blocks: document.blocks.map((block, index) => validateBlock(block, index, seen))};
}

export function parseCourseDocument(value: unknown): CourseDocumentV1 | null {
    if (value === null || value === undefined) return null;
    try {
        return validateCourseDocument(typeof value === "string" ? JSON.parse(value) : value);
    } catch (reason) {
        if (reason instanceof CourseDocumentValidationError || reason instanceof SyntaxError) return null;
        throw reason;
    }
}

export function courseDocumentReferences(document: CourseDocumentV1): CourseDocumentReference[] {
    const references: CourseDocumentReference[] = [];
    for (const block of document.blocks) {
        if (block.type === "quiz") references.push({type: "quiz", id: block.quizId, required: block.required, ...(block.passPercent === undefined ? {} : {passPercent: block.passPercent})});
        if (block.type === "activity") references.push({type: "activity", id: block.activityId, required: block.required, ...(block.passPercent === undefined ? {} : {passPercent: block.passPercent})});
        if (block.type === "media") {
            references.push({type: block.kind, id: block.mediaId, kind: block.kind});
            if (block.posterMediaId) references.push({type: "image", id: block.posterMediaId, kind: "image"});
        }
        if (block.type === "diagram") references.push({type: "diagram", id: block.diagramId});
    }
    return references;
}

export function courseDocumentToMarkdown(document: CourseDocumentV1): string {
    return document.blocks.map(block => {
        if (block.type === "text") return block.markdown.trim();
        if (block.type === "media") return `{{${block.kind}:${block.mediaId}}}`;
        if (block.type === "quiz") return `{{quiz:${block.quizId}${block.required ? " required" : " optional"}${block.passPercent === undefined ? "" : ` pass:${block.passPercent}`}}}`;
        if (block.type === "activity") return `{{activity:${block.activityId}${block.required ? " required" : " optional"}${block.passPercent === undefined ? "" : ` pass:${block.passPercent}`}}}`;
        if (block.type === "diagram") return `{{diagram:${block.diagramId}}}`;
        if (block.type === "callout") return `> **${block.tone.toUpperCase()}: ${block.title}**\n>\n> ${block.markdown.replace(/\r?\n/g, "\n> ")}`;
        return "";
    }).filter(Boolean).join("\n\n").trim() + "\n";
}

export function courseDocumentFromMarkdown(markdown: string): CourseDocumentV1 {
    const blocks: CourseBlock[] = [];
    const textLines: string[] = [];
    const flushText = () => {
        const value = textLines.join("\n").trim();
        if (value) blocks.push({id: generatedId(), type: "text", markdown: value});
        textLines.length = 0;
    };
    for (const rawLine of markdown.split(/\r?\n/)) {
        const line = rawLine.trim();
        const media = line.match(MEDIA_DIRECTIVE);
        const quiz = line.match(QUIZ_DIRECTIVE);
        const activity = line.match(ACTIVITY_DIRECTIVE);
        const diagram = line.match(DIAGRAM_DIRECTIVE);
        if (media || quiz || activity || diagram) {
            flushText();
            if (media) blocks.push({id: generatedId(), type: "media", kind: media[1].toLowerCase() as CourseMediaKind, mediaId: media[2].toLowerCase(), alt: "Course attachment", width: "content", align: "center", ...(media[1].toLowerCase() === "video" ? {controls: true} : {})});
            if (quiz) blocks.push({id: generatedId(), type: "quiz", quizId: quiz[1].toLowerCase(), required: quiz[2]?.toLowerCase() === "required", ...(quiz[3] === undefined ? {} : {passPercent: Number(quiz[3])})});
            if (activity) blocks.push({id: generatedId(), type: "activity", activityId: activity[1].toLowerCase(), required: activity[2]?.toLowerCase() === "required", ...(activity[3] === undefined ? {} : {passPercent: Number(activity[3])})});
            if (diagram) blocks.push({id: generatedId(), type: "diagram", diagramId: diagram[1].toLowerCase()});
            continue;
        }
        textLines.push(rawLine);
    }
    flushText();
    if (blocks.length === 0) blocks.push({id: generatedId(), type: "text", markdown: "# Section title\n\nWrite the learning material here."});
    return {version: 1, blocks};
}

export function createCourseBlock(type: "text"): CourseTextBlock;
export function createCourseBlock(type: "media"): CourseMediaBlock;
export function createCourseBlock(type: "callout"): CourseCalloutBlock;
export function createCourseBlock(type: "diagram"): CourseDiagramBlock;
export function createCourseBlock(type: "quiz"): CourseQuizBlock;
export function createCourseBlock(type: "activity"): CourseActivityBlock;
export function createCourseBlock(type: CourseBlock["type"]): CourseBlock;
export function createCourseBlock(type: CourseBlock["type"]): CourseBlock {
    const id = generatedId();
    if (type === "text") return {id, type, markdown: "Write the learning material here."};
    if (type === "media") return {id, type, mediaId: "", kind: "image", alt: "", width: "content", align: "center"};
    if (type === "callout") return {id, type, tone: "info", title: "Note", markdown: "Add context for the learner."};
    if (type === "diagram") return {id, type, diagramId: "runway-selection"};
    if (type === "quiz") return {id, type, quizId: "", required: true, passPercent: 80};
    return {id, type, activityId: "", required: true, passPercent: 80};
}

export function insertCourseBlock(document: CourseDocumentV1, index: number, block: CourseBlock): CourseDocumentV1 {
    const position = Math.max(0, Math.min(index, document.blocks.length));
    return {version: 1, blocks: [...document.blocks.slice(0, position), block, ...document.blocks.slice(position)]};
}

export function moveCourseBlock(document: CourseDocumentV1, from: number, to: number): CourseDocumentV1 {
    if (from < 0 || from >= document.blocks.length || to < 0 || to >= document.blocks.length || from === to) return document;
    const blocks = [...document.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    return {version: 1, blocks};
}

export function splitTextBlock(document: CourseDocumentV1, index: number, offset: number, inserted: CourseBlock): CourseDocumentV1 {
    const block = document.blocks[index];
    if (!block || block.type !== "text") return insertCourseBlock(document, index + 1, inserted);
    const split = Math.max(0, Math.min(offset, block.markdown.length));
    const before = block.markdown.slice(0, split).trim();
    const after = block.markdown.slice(split).trim();
    const replacement: CourseBlock[] = [
        ...(before ? [{...block, markdown: before}] : []),
        inserted,
        ...(after ? [{id: generatedId(), type: "text" as const, markdown: after}] : []),
    ];
    return {version: 1, blocks: [...document.blocks.slice(0, index), ...replacement, ...document.blocks.slice(index + 1)]};
}
