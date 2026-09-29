import {useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent} from "react";
import type {ExamQuizSummary} from "../../types/Exam.ts";
import type {CourseActivity, ManagedCourse, ManagedCourseDraft, ManagedCourseDraftSection, ManagedCourseDraftGroup} from "../../types/Course.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import {ACCEPTED_MEDIA, MEDIA_VALIDATION_MESSAGE, isHeicMediaFile, prepareMediaFile} from "../../utils/CourseMedia.ts";
import {
    courseDocumentFromMarkdown,
    courseDocumentToMarkdown,
    createCourseBlock,
    insertCourseBlock,
    moveCourseBlock,
    splitTextBlock,
    type CourseBlock,
    type CourseDocumentV1,
    type CourseMediaBlock,
} from "../../../lib/course-document";
import {createGroundControlDocument} from "../../../lib/ground-control-course";
import {stableExamValue} from "./ExamUnsavedChanges.ts";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges.ts";
import {orderedCourseDraft} from "./course-editor-order";
import {courseDraftForSave} from "./course-editor-save";
import {validateCourseDraftForSave, type CourseDraftIssue} from "./course-editor-validation";
import {useConfirmation} from "../../../platform/confirmation/ConfirmationProvider.tsx";
import styles from "./CourseCenter.module.css";

interface CourseEditorProps {
    course: ManagedCourse | null;
    quizzes: ExamQuizSummary[];
    activities?: CourseActivity[];
    token: string;
    canPublish: boolean;
    onCancel: () => void;
    onPreview?: () => void;
    onDelete?: (onDeleted: () => void) => void;
    onSaved: (course: ManagedCourse) => void;
}

const newDocument = (): CourseDocumentV1 => ({version: 1, blocks: [{...createCourseBlock("text"), markdown: "# Section title\n\nWrite the learning material here."}]});
const newSection = (sortOrder: number, groupId: string): ManagedCourseDraftSection => {
    const document = newDocument();
    return {id: crypto.randomUUID(), groupId, title: "", markdown: courseDocumentToMarkdown(document), document, sortOrder};
};
const newCourse = (): ManagedCourseDraft => {
    const id = crypto.randomUUID();
    return {slug: "", title: "", description: "", isPublished: false, navigationMode: "sequential", sectionGroups: [{id, title: "Section 1", sortOrder: 1}], sections: [newSection(1, id)]};
};
const asDraft = (course: ManagedCourse | null): ManagedCourseDraft => {
    if (!course) return newCourse();
    const groups = course.sectionGroups?.length ? course.sectionGroups : [{id: crypto.randomUUID(), title: course.title, sortOrder: 1}];
    return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        isPublished: course.isPublished,
        navigationMode: course.navigationMode ?? "sequential",
        sectionGroups: groups,
        sections: course.sections.map(section => {
            const document = section.document ?? courseDocumentFromMarkdown(section.markdown);
            return {...section, groupId: section.groupId ?? groups[0].id, document, markdown: courseDocumentToMarkdown(document)};
        }),
    };
};

function documentFor(section: ManagedCourseDraftSection): CourseDocumentV1 {
    return section.document ?? courseDocumentFromMarkdown(section.markdown);
}

function blockTypeLabel(block: CourseBlock) {
    return block.type === "media" ? block.kind : block.type;
}

const INSERTABLE_BLOCK_TYPES: ReadonlyArray<{type: CourseBlock["type"]; label: string}> = [
    {type: "text", label: "Text"},
    {type: "check", label: "Ungraded check"},
    {type: "media", label: "Image/video"},
    {type: "callout", label: "Callout"},
    {type: "diagram", label: "Diagram"},
    {type: "quiz", label: "Quiz"},
    {type: "activity", label: "Activity"},
];

interface InsertBlockMenuProps {
    label: string;
    onInsert: (type: CourseBlock["type"]) => void;
}

function InsertBlockMenu({label, onInsert}: InsertBlockMenuProps) {
    return <details className={styles.insertMenu}>
        <summary className={styles.insertButton}>{label}</summary>
        <div className={styles.insertMenuList}>
            {INSERTABLE_BLOCK_TYPES.map(option => <button key={option.type} type="button" onClick={event => {
                onInsert(option.type);
                event.currentTarget.closest("details")?.removeAttribute("open");
            }}>{option.label}</button>)}
        </div>
    </details>;
}

function stripPendingMedia(document: CourseDocumentV1) {
    const blocks = document.blocks.filter(block => block.type !== "media" || Boolean(block.mediaId));
    return blocks.length > 0 ? {version: 1 as const, blocks} : newDocument();
}

function updateSectionDocument(draft: ManagedCourseDraft, sectionIndex: number, document: CourseDocumentV1): ManagedCourseDraft {
    return {
        ...draft,
        sections: draft.sections.map((section, index) => index === sectionIndex
            ? {...section, document, markdown: courseDocumentToMarkdown(document)}
            : section),
    };
}

export default function CourseEditor({course, quizzes, activities = [], token, canPublish, onCancel, onPreview, onDelete, onSaved}: CourseEditorProps) {
    const [initialDraft] = useState<ManagedCourseDraft>(() => asDraft(course));
    const [draft, setDraft] = useState<ManagedCourseDraft>(initialDraft);
    const [activeSectionId, setActiveSectionId] = useState(initialDraft.sections[0].id);
    const [baseline, setBaseline] = useState<ManagedCourseDraft>(initialDraft);
    const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
    const [pendingPreviews, setPendingPreviews] = useState<Record<string, string>>({});
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [activeCaret, setActiveCaret] = useState<{sectionIndex: number; blockId: string; offset: number} | null>(null);
    const [, setDragging] = useState<{sectionIndex: number; blockId: string} | null>(null);
    const draggingRef = useRef<{sectionIndex: number; blockId: string} | null>(null);
    const [templateSection, setTemplateSection] = useState<number | null>(null);
    const [templateQuizId, setTemplateQuizId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [draftIssue, setDraftIssue] = useState<CourseDraftIssue | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const persistedSectionIdsRef = useRef(new Set(course?.sections.map(section => section.id) ?? []));
    const revisionRef = useRef(course?.updatedAt);
    const confirm = useConfirmation();
    const previewUrls = useRef<Record<string, string>>({});
    const uploadControllers = useRef<Record<string, AbortController>>({});
    const isDirty = stableExamValue(draft) !== stableExamValue(baseline) || Object.keys(pendingFiles).length > 0;
    const {confirmAndRun, disarm} = useExamUnsavedChanges({isDirty});

    useEffect(() => {
        Object.values(uploadControllers.current).forEach(controller => controller.abort());
        uploadControllers.current = {};
        Object.values(previewUrls.current).forEach(url => URL.revokeObjectURL(url));
        previewUrls.current = {};
        const next = asDraft(course);
        setDraft(next);
        setActiveSectionId(next.sections[0]?.id);
        setBaseline(next);
        setPendingFiles({});
        setPendingPreviews({});
        setUploadProgress({});
        setUploading({});
        setError(null);
        setDraftIssue(null);
        persistedSectionIdsRef.current = new Set(course?.sections.map(section => section.id) ?? []);
        revisionRef.current = course?.updatedAt;
    }, [course]);

    useEffect(() => () => {
        Object.values(previewUrls.current).forEach(url => URL.revokeObjectURL(url));
        Object.values(uploadControllers.current).forEach(controller => controller.abort());
    }, []);

    const updateSection = (index: number, update: (section: ManagedCourseDraftSection) => ManagedCourseDraftSection) => {
        setDraft(current => ({...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? update(section) : section)}));
    };

    const updateDocument = (sectionIndex: number, update: (document: CourseDocumentV1) => CourseDocumentV1) => {
        setDraft(current => updateSectionDocument(current, sectionIndex, update(documentFor(current.sections[sectionIndex]))));
    };

    const updateBlock = (sectionIndex: number, blockId: string, update: (block: CourseBlock) => CourseBlock) => {
        updateDocument(sectionIndex, document => ({version: 1, blocks: document.blocks.map(block => block.id === blockId ? update(block) : block)}));
    };

    const removeBlock = (sectionIndex: number, blockId: string) => {
        const blocks = documentFor(draft.sections[sectionIndex]).blocks;
        if (blocks.length < 2 && blocks[0]?.type !== "media") {
            setDraftIssue({sectionId: draft.sections[sectionIndex].id, blockId,
                message: "Every subsection needs at least one block. Add another block before removing this one."});
            return;
        }
        uploadControllers.current[blockId]?.abort();
        delete uploadControllers.current[blockId];
        const url = previewUrls.current[blockId];
        if (url) {
            URL.revokeObjectURL(url);
            delete previewUrls.current[blockId];
        }
        setPendingFiles(current => {const next = {...current}; delete next[blockId]; return next;});
        setPendingPreviews(current => {const next = {...current}; delete next[blockId]; return next;});
        updateDocument(sectionIndex, document => {
            const remaining = document.blocks.filter(block => block.id !== blockId);
            return {version: 1, blocks: remaining.length ? remaining : [createCourseBlock("text")]};
        });
    };

    const uploadBlock = async (courseId: string, blockId: string, file: File) => {
        uploadControllers.current[blockId]?.abort();
        const controller = new AbortController();
        uploadControllers.current[blockId] = controller;
        setUploading(current => ({...current, [blockId]: true}));
        setUploadProgress(current => ({...current, [blockId]: 0}));
        try {
            const media = await ExamsApiUtils.uploadCourseMedia(courseId, file, token, percentage => setUploadProgress(current => ({...current, [blockId]: percentage})), controller.signal);
            setDraft(current => {
                const targetSectionIndex = current.sections.findIndex(section => documentFor(section).blocks.some(block => block.id === blockId));
                if (targetSectionIndex < 0) return current;
                return updateSectionDocument(current, targetSectionIndex, {
                    version: 1,
                    blocks: documentFor(current.sections[targetSectionIndex]).blocks.map(block => block.id === blockId && block.type === "media" ? {
                        ...block,
                        mediaId: media.id,
                        kind: media.kind ?? (media.contentType.startsWith("video/") ? "video" : "image"),
                        alt: block.alt || file.name.replace(/\.[^.]+$/, ""),
                    } : block),
                });
            });
            setPendingFiles(current => {const next = {...current}; delete next[blockId]; return next;});
            setPendingPreviews(current => {const next = {...current}; delete next[blockId]; return next;});
            const url = previewUrls.current[blockId];
            if (url) { URL.revokeObjectURL(url); delete previewUrls.current[blockId]; }
        } catch (reason) {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (uploadControllers.current[blockId] === controller) {
                delete uploadControllers.current[blockId];
                setUploading(current => {const next = {...current}; delete next[blockId]; return next;});
            }
        }
    };

    const cancelUpload = (blockId: string) => uploadControllers.current[blockId]?.abort();

    const retryUpload = (blockId: string) => {
        const file = pendingFiles[blockId];
        if (draft.id && file && !uploading[blockId]) void uploadBlock(draft.id, blockId, file);
    };

    const enqueueFiles = (sectionIndex: number, insertionIndex: number, files: File[]) => {
        const usable = files.flatMap(file => {
            const prepared = prepareMediaFile(file);
            return prepared ? [prepared] : [];
        });
        if (usable.length === 0) {
            setError(MEDIA_VALIDATION_MESSAGE);
            return;
        }
        if (usable.length !== files.length) setError("Some files were skipped because their media type is not supported.");
        usable.forEach((file, fileIndex) => {
            const block = createCourseBlock("media") as CourseMediaBlock;
            const mediaBlock: CourseMediaBlock = {...block, kind: file.type.startsWith("video/") ? "video" : "image", alt: file.name.replace(/\.[^.]+$/, "")};
            const preview = URL.createObjectURL(file);
            previewUrls.current[mediaBlock.id] = preview;
            setPendingFiles(current => ({...current, [mediaBlock.id]: file}));
            setPendingPreviews(current => ({...current, [mediaBlock.id]: preview}));
            setDraft(current => updateSectionDocument(current, sectionIndex, insertCourseBlock(documentFor(current.sections[sectionIndex]), insertionIndex + fileIndex, mediaBlock)));
            if (draft.id) void uploadBlock(draft.id, mediaBlock.id, file);
        });
    };

    const pasteFiles = (event: ClipboardEvent<HTMLElement>, sectionIndex: number) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length === 0) return;
        event.preventDefault();
        if (activeCaret && activeCaret.sectionIndex === sectionIndex) {
            const preparedFiles = files.flatMap(file => {
                const prepared = prepareMediaFile(file);
                return prepared ? [prepared] : [];
            });
            if (preparedFiles.length === 0) {
                setError(MEDIA_VALIDATION_MESSAGE);
                return;
            }
            if (preparedFiles.length !== files.length) setError("Some files were skipped because their media type is not supported.");
            const entries = preparedFiles.map(prepared => {
                const block = createCourseBlock("media") as CourseMediaBlock;
                const mediaBlock: CourseMediaBlock = {...block, kind: prepared.type.startsWith("video/") ? "video" : "image", alt: prepared.name.replace(/\.[^.]+$/, "")};
                const preview = URL.createObjectURL(prepared);
                previewUrls.current[mediaBlock.id] = preview;
                setPendingFiles(current => ({...current, [mediaBlock.id]: prepared}));
                setPendingPreviews(current => ({...current, [mediaBlock.id]: preview}));
                return {prepared, mediaBlock};
            });
            entries.forEach(({prepared, mediaBlock}, fileIndex) => {
                const anchorId = fileIndex === 0 ? activeCaret.blockId : entries[fileIndex - 1].mediaBlock.id;
                setDraft(current => {
                    const document = documentFor(current.sections[sectionIndex]);
                    const index = document.blocks.findIndex(blockItem => blockItem.id === anchorId);
                    if (index < 0) return current;
                    const next = fileIndex === 0 ? splitTextBlock(document, index, activeCaret.offset, mediaBlock) : insertCourseBlock(document, index + 1, mediaBlock);
                    return updateSectionDocument(current, sectionIndex, next);
                });
                if (draft.id) void uploadBlock(draft.id, mediaBlock.id, prepared);
            });
            return;
        }
        enqueueFiles(sectionIndex, documentFor(draft.sections[sectionIndex]).blocks.length, files);
    };

    const moveBlock = (targetSectionIndex: number, targetIndex: number) => {
        const source = draggingRef.current;
        if (!source) return;
        setDraft(current => {
            const sourceDocument = documentFor(current.sections[source.sectionIndex]);
            const sourceIndex = sourceDocument.blocks.findIndex(block => block.id === source.blockId);
            if (sourceIndex < 0) return current;
            const moved = sourceDocument.blocks[sourceIndex];
            const nextSections = current.sections.map((section, index) => {
                if (index === source.sectionIndex) {
                    const blocks = documentFor(section).blocks.filter(block => block.id !== source.blockId);
                    if (blocks.length === 0 && source.sectionIndex !== targetSectionIndex) blocks.push(createCourseBlock("text"));
                    return {...section, document: {version: 1 as const, blocks}, markdown: courseDocumentToMarkdown({version: 1 as const, blocks})};
                }
                return section;
            });
            const destination = documentFor(nextSections[targetSectionIndex]);
            const blocks = [...destination.blocks];
            const adjustedTarget = source.sectionIndex === targetSectionIndex && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
            blocks.splice(Math.max(0, Math.min(adjustedTarget, blocks.length)), 0, moved);
            const document = {version: 1 as const, blocks};
            nextSections[targetSectionIndex] = {...nextSections[targetSectionIndex], document, markdown: courseDocumentToMarkdown(document)};
            return {...current, sections: nextSections};
        });
        draggingRef.current = null;
        setDragging(null);
    };

    const addBlock = (sectionIndex: number, insertionIndex: number, type: CourseBlock["type"]) => {
        const block = createCourseBlock(type);
        updateDocument(sectionIndex, document => insertCourseBlock(document, insertionIndex, block));
    };

    const replaceMedia = (sectionIndex: number, block: CourseMediaBlock, file: File | undefined) => {
        if (!file) return;
        const prepared = prepareMediaFile(file);
        if (!prepared) {
            setError(MEDIA_VALIDATION_MESSAGE);
            return;
        }
        const nextKind = prepared.type.startsWith("video/") ? "video" : "image";
        file = prepared;
        const previous = previewUrls.current[block.id];
        if (previous) URL.revokeObjectURL(previous);
        const preview = URL.createObjectURL(file);
        previewUrls.current[block.id] = preview;
        setPendingFiles(current => ({...current, [block.id]: file}));
        setPendingPreviews(current => ({...current, [block.id]: preview}));
        updateBlock(sectionIndex, block.id, current => current.type === "media"
            ? {...current, kind: nextKind, alt: current.alt || prepared.name.replace(/\.[^.]+$/, ""), ...(nextKind === "image" ? {controls: undefined, posterMediaId: undefined} : {controls: current.controls ?? true})}
            : current);
        if (draft.id) void uploadBlock(draft.id, block.id, file);
    };

    const pendingDescriptors = (source: ManagedCourseDraft) => source.sections.flatMap((section, sectionIndex) => documentFor(section).blocks.flatMap((block, blockIndex) => {
        const file = block.type === "media" ? pendingFiles[block.id] : undefined;
        return file ? [{sectionIndex, blockIndex, block, file}] : [];
    }));

    const showIssue = (issue: CourseDraftIssue) => {
        setDraftIssue(issue);
        if (issue.sectionId) setActiveSectionId(issue.sectionId);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const selector = issue.blockId ? `[data-course-block-id="${issue.blockId}"] input, [data-course-block-id="${issue.blockId}"] select, [data-course-block-id="${issue.blockId}"] textarea`
                : issue.groupId ? `[data-course-group-id="${issue.groupId}"]`
                    : issue.field ? `[data-course-field="${issue.field}"]` : null;
            if (selector) {
                const target = document.querySelector<HTMLElement>(selector);
                target?.focus();
                target?.scrollIntoView({block: "center", behavior: "smooth"});
            }
        }));
    };

    const save = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (savingRef.current) return;
        setError(null);
        setDraftIssue(null);
        const issue = validateCourseDraftForSave(draft, new Set(Object.keys(pendingFiles)));
        if (issue) { showIssue(issue); return; }
        savingRef.current = true;
        setError(null);
        setIsSaving(true);
        try {
            const descriptors = pendingDescriptors(draft);
            let working: ManagedCourseDraft = {...draft, sections: draft.sections.map(section => {
                const document = stripPendingMedia(documentFor(section));
                return {...section, document, markdown: courseDocumentToMarkdown(document)};
            })};
            if (descriptors.length && draft.id) {
                if (Object.values(uploading).some(Boolean)) throw new Error("Wait for media uploads to finish before saving.");
                throw new Error("Retry the failed media upload before saving.");
            }
            let savedCourse: ManagedCourse;
            const firstSaved = await ExamsApiUtils.saveCourse(courseDraftForSave(working, persistedSectionIdsRef.current), token, revisionRef.current);
            persistedSectionIdsRef.current = new Set(firstSaved.sections.map(section => section.id));
            revisionRef.current = firstSaved.updatedAt;
            if (descriptors.length) {
                working = asDraft(firstSaved);
                for (const descriptor of descriptors) {
                    const section = working.sections[descriptor.sectionIndex];
                    if (!section) continue;
                    working = updateSectionDocument(working, descriptor.sectionIndex,
                        insertCourseBlock(documentFor(section), Math.min(descriptor.blockIndex, documentFor(section).blocks.length), descriptor.block));
                }
                for (const [sectionIndex, section] of draft.sections.entries()) {
                    if (documentFor(section).blocks.every(block => block.type === "media" && pendingFiles[block.id])) {
                        const restored = documentFor(working.sections[sectionIndex]);
                        working = updateSectionDocument(working, sectionIndex, {version: 1, blocks: restored.blocks.filter(block => block.type === "media")});
                    }
                }
                setDraft(working);
                for (const descriptor of descriptors) {
                    const section = working.sections[descriptor.sectionIndex];
                    if (!section) continue;
                    const media = await ExamsApiUtils.uploadCourseMedia(firstSaved.id, descriptor.file, token, percentage => setUploadProgress(current => ({...current, [descriptor.block.id]: percentage})));
                    working = updateSectionDocument(working, descriptor.sectionIndex, {version: 1, blocks: documentFor(working.sections[descriptor.sectionIndex]).blocks.map(block => block.id === descriptor.block.id && block.type === "media" ? {...block, mediaId: media.id, kind: media.contentType.startsWith("video/") ? "video" : "image"} : block)});
                    setDraft(working);
                    setPendingFiles(current => {const next = {...current}; delete next[descriptor.block.id]; return next;});
                    setPendingPreviews(current => {const next = {...current}; delete next[descriptor.block.id]; return next;});
                    const preview = previewUrls.current[descriptor.block.id];
                    if (preview) { URL.revokeObjectURL(preview); delete previewUrls.current[descriptor.block.id]; }
                }
                savedCourse = await ExamsApiUtils.saveCourse(working, token, revisionRef.current);
            } else {
                savedCourse = firstSaved;
            }
            const next = asDraft(savedCourse);
            persistedSectionIdsRef.current = new Set(savedCourse.sections.map(section => section.id));
            revisionRef.current = savedCourse.updatedAt;
            setDraft(next);
            setBaseline(next);
            setPendingFiles({});
            setPendingPreviews({});
            disarm();
            onSaved(savedCourse);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    const addGroup = () => {
        const group: ManagedCourseDraftGroup = {id: crypto.randomUUID(), title: `Section ${draft.sectionGroups.length + 1}`, sortOrder: draft.sectionGroups.length + 1};
        const section = newSection(draft.sections.length + 1, group.id!);
        setDraft(current => orderedCourseDraft(current, [...current.sectionGroups, group], [...current.sections, section]));
        setActiveSectionId(section.id);
    };

    const addSubsection = (groupId: string) => {
        const section = newSection(draft.sections.length + 1, groupId);
        setDraft(current => orderedCourseDraft(current, current.sectionGroups, [...current.sections, section]));
        setActiveSectionId(section.id);
    };

    const moveGroup = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= draft.sectionGroups.length) return;
        setDraft(current => {
            const groups = [...current.sectionGroups];
            [groups[index], groups[target]] = [groups[target], groups[index]];
            return orderedCourseDraft(current, groups);
        });
    };

    const moveSubsection = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= draft.sections.length || draft.sections[index].groupId !== draft.sections[target].groupId) return;
        setDraft(current => {
            const sections = [...current.sections];
            [sections[index], sections[target]] = [sections[target], sections[index]];
            return orderedCourseDraft(current, current.sectionGroups, sections);
        });
    };

    const removeSubsection = async (index: number) => {
        if (draft.sections.length < 2 || !await confirm({title: `Remove “${draft.sections[index].title || "Untitled subsection"}”?`, message: "This removes the subsection and its content from your draft. Save the course to apply the change.", confirmLabel: "Remove from draft", cancelLabel: "Keep subsection", tone: "danger"})) return;
        const next = draft.sections.filter((_, itemIndex) => itemIndex !== index);
        setDraft(current => orderedCourseDraft(current, current.sectionGroups, next));
        if (activeSectionId === draft.sections[index].id) setActiveSectionId(next[Math.min(index, next.length - 1)].id);
    };

    const removeGroup = async (groupId: string) => {
        if (draft.sectionGroups.length < 2) return;
        const group = draft.sectionGroups.find(item => item.id === groupId);
        if (!await confirm({title: `Remove “${group?.title}”?`, message: "This removes the section and every subsection inside it from your draft. Save the course to apply the change.", confirmLabel: "Remove from draft", cancelLabel: "Keep section", tone: "danger"})) return;
        const nextGroups = draft.sectionGroups.filter(item => item.id !== groupId);
        const remaining = draft.sections.filter(item => item.groupId !== groupId);
        const nextSections = remaining.length ? remaining : [newSection(1, nextGroups[0].id!)];
        setDraft(current => orderedCourseDraft(current, nextGroups, nextSections));
        if (!nextSections.some(item => item.id === activeSectionId)) setActiveSectionId(nextSections[0]?.id);
    };

    return <section className={styles.editor} aria-labelledby="course-editor-heading">
        <div className={styles.heading}><div><p className={styles.eyebrow}>{course ? "Edit course" : "New course"}</p><h2 id="course-editor-heading">{draft.title || "Create a course"}</h2></div><div className={styles.headingButtons}>{course && onPreview ? <button type="button" className={styles.quietButton} disabled={isSaving} onClick={() => void confirmAndRun(onPreview)}>Preview</button> : null}<button type="button" className={styles.quietButton} disabled={isSaving} onClick={() => void confirmAndRun(onCancel)}>Back to courses</button></div></div>
        <form noValidate onSubmit={event => void save(event)}>
            <fieldset disabled={isSaving}>
                <div className={styles.editorSettings}>
                <div className={styles.fieldGrid}><label>Title<input data-course-field="title" required maxLength={255} value={draft.title} onChange={event => setDraft(current => ({...current, title: event.target.value}))}/></label><label>Slug<input data-course-field="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={200} value={draft.slug} onChange={event => setDraft(current => ({...current, slug: event.target.value}))}/></label></div>
                {draftIssue && (!draftIssue.sectionId && !draftIssue.groupId) ? <p className={styles.error} role="alert">{draftIssue.message}</p> : null}
                <label>Description<textarea rows={3} maxLength={2000} value={draft.description} onChange={event => setDraft(current => ({...current, description: event.target.value}))}/></label>
                <label className={styles.check}><input type="checkbox" checked={draft.isPublished} disabled={!canPublish} onChange={event => setDraft(current => ({...current, isPublished: event.target.checked}))}/> Make available to signed-in learners {canPublish ? "" : "(administrator publishing permission required)"}</label>
                <label>Navigation mode<select value={draft.navigationMode} onChange={event => setDraft(current => ({...current, navigationMode: event.target.value as ManagedCourseDraft["navigationMode"]}))}><option value="sequential">Sequential · one subsection at a time</option><option value="section_by_section">Section by section · any subsection in the current section</option><option value="free">Free · any subsection in any order</option></select></label>
                </div>
                <div className={styles.sectionsHeading}><h3>Course structure</h3><button type="button" onClick={addGroup}>Add section</button></div>
                <div className={styles.editorWorkspace}>
                    <aside className={styles.editorOutline} aria-label="Course structure">
                        {draft.sectionGroups.map((group, groupIndex) => <div className={styles.editorGroup} key={group.id}>
                            <div className={styles.editorGroupHeading}><span>Section {groupIndex + 1}</span><div><button type="button" aria-label={`Move ${group.title} section up`} disabled={groupIndex === 0} onClick={() => moveGroup(groupIndex, -1)}>↑</button><button type="button" aria-label={`Move ${group.title} section down`} disabled={groupIndex === draft.sectionGroups.length - 1} onClick={() => moveGroup(groupIndex, 1)}>↓</button>{draft.sectionGroups.length > 1 ? <button type="button" aria-label={`Remove ${group.title} section`} onClick={() => removeGroup(group.id!)}>Remove</button> : null}</div></div>
                            <label className={styles.editorGroupTitle}>Section title<input data-course-field="group" data-course-group-id={group.id} required maxLength={255} value={group.title} onChange={event => setDraft(current => ({...current, sectionGroups: current.sectionGroups.map(item => item.id === group.id ? {...item, title: event.target.value} : item)}))}/></label>
                            {draftIssue && draftIssue.groupId === group.id ? <p className={styles.error} role="alert">{draftIssue.message}</p> : null}
                            <ol>{draft.sections.map((section, sectionIndex) => section.groupId === group.id ? <li key={section.id}>
                                <button type="button" className={section.id === activeSectionId ? styles.editorOutlineActive : ""} onClick={() => setActiveSectionId(section.id)}>{section.title || `Untitled subsection ${sectionIndex + 1}`}</button>
                                <div className={styles.editorSubsectionActions}><button type="button" aria-label={`Move ${section.title || "subsection"} up`} disabled={sectionIndex === 0 || draft.sections[sectionIndex - 1]?.groupId !== group.id} onClick={() => moveSubsection(sectionIndex, -1)}>↑</button><button type="button" aria-label={`Move ${section.title || "subsection"} down`} disabled={sectionIndex === draft.sections.length - 1 || draft.sections[sectionIndex + 1]?.groupId !== group.id} onClick={() => moveSubsection(sectionIndex, 1)}>↓</button><button type="button" aria-label={`Remove ${section.title || "subsection"}`} disabled={draft.sections.length < 2} onClick={() => removeSubsection(sectionIndex)}>×</button></div>
                            </li> : null)}</ol>
                            <button type="button" className={styles.editorAddLeaf} onClick={() => addSubsection(group.id!)}>Add subsection</button>
                        </div>)}
                    </aside>
                <div className={styles.sections}>
                    {draft.sections.map((section, sectionIndex) => {
                        if (section.id !== activeSectionId) return null;
                        const document = documentFor(section);
                        return <article className={styles.sectionCard} key={section.id ?? `new-${sectionIndex}`} onPaste={event => pasteFiles(event, sectionIndex)} onDragOver={event => event.preventDefault()} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); enqueueFiles(sectionIndex, document.blocks.length, Array.from(event.dataTransfer.files)); } }}>
                            <div className={styles.sectionCardHeading}><div><span className={styles.eyebrow}>Subsection {sectionIndex + 1}</span><h4>{section.title || "Untitled subsection"}</h4></div>{draft.sections.length > 1 ? <button type="button" className={styles.removeButton} onClick={() => removeSubsection(sectionIndex)}>Remove subsection</button> : null}</div>
                            <div className={styles.fieldGrid}><label>Subsection title<input data-course-field="section" required maxLength={255} value={section.title} onChange={event => updateSection(sectionIndex, current => ({...current, title: event.target.value}))}/></label><label>Parent section<select value={section.groupId} onChange={event => setDraft(current => orderedCourseDraft(current, current.sectionGroups, current.sections.map(item => item.id === section.id ? {...item, groupId: event.target.value} : item)))}>{draft.sectionGroups.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
                            {draftIssue && draftIssue.sectionId === section.id && !draftIssue.blockId ? <p className={styles.error} role="alert">{draftIssue.message}</p> : null}
                            <details className={styles.composerHint}><summary>Ground Control lesson template</summary>
                                <p>Replace this section with eight practical lessons, traffic diagrams, five ungraded checks and a revision sheet. Choose its final assessment below. Review the result before saving.</p>
                                <button type="button" onClick={() => {setTemplateSection(sectionIndex); setTemplateQuizId(document.blocks.find(block => block.type === "quiz")?.quizId ?? "");}}>Choose template quiz</button>
                                {templateSection === sectionIndex ? <div><label>Final Ground Control quiz<select value={templateQuizId} onChange={event => setTemplateQuizId(event.target.value)}><option value="">Choose a quiz…</option>{quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label>
                                    <p>This replaces the current section blocks in the unsaved draft, including media and assessment links.</p>
                                    <button type="button" disabled={!templateQuizId} onClick={() => {updateDocument(sectionIndex, () => createGroundControlDocument(templateQuizId)); setTemplateSection(null);}}>Replace draft section with template</button>
                                    <button type="button" onClick={() => setTemplateSection(null)}>Keep current content</button></div> : null}
                            </details>
                            <div className={styles.blockCanvas} aria-label={`Section ${sectionIndex + 1} page composer`}>
                                {document.blocks.map((block, blockIndex) => <div key={`slot-${block.id}`}>
                                    <div className={styles.insertionZone} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.files.length) enqueueFiles(sectionIndex, blockIndex, Array.from(event.dataTransfer.files)); else moveBlock(sectionIndex, blockIndex); }}><InsertBlockMenu label="＋ Insert here" onInsert={type => addBlock(sectionIndex, blockIndex, type)}/><span>or drop image/video</span></div>
                                    <div className={styles.blockCard} data-course-block-id={block.id} draggable onDragStart={(event: DragEvent<HTMLDivElement>) => { event.dataTransfer.effectAllowed = "move"; draggingRef.current = {sectionIndex, blockId: block.id}; setDragging({sectionIndex, blockId: block.id}); }} onDragEnd={() => { draggingRef.current = null; setDragging(null); }}>
                                        <div className={styles.blockCardHeader}><span className={styles.blockType}>{blockTypeLabel(block)}</span><div className={styles.blockActions}><button type="button" aria-label={`Move ${blockTypeLabel(block)} up`} onClick={() => updateDocument(sectionIndex, current => moveCourseBlock(current, blockIndex, blockIndex - 1))} disabled={blockIndex === 0}>↑</button><button type="button" aria-label={`Move ${blockTypeLabel(block)} down`} onClick={() => updateDocument(sectionIndex, current => moveCourseBlock(current, blockIndex, blockIndex + 1))} disabled={blockIndex === document.blocks.length - 1}>↓</button><button type="button" className={styles.removeButton} onClick={() => removeBlock(sectionIndex, block.id)}>Remove</button></div></div>
                                        {draftIssue?.blockId === block.id ? <p className={styles.error} role="alert">{draftIssue.message}</p> : null}
                                        {block.type === "text" ? <label>Text (safe Markdown)<textarea rows={Math.max(4, Math.min(12, block.markdown.split(/\r?\n/).length + 2))} value={block.markdown} onFocus={event => setActiveCaret({sectionIndex, blockId: block.id, offset: event.currentTarget.selectionStart})} onSelect={event => setActiveCaret({sectionIndex, blockId: block.id, offset: event.currentTarget.selectionStart})} onChange={event => { setActiveCaret({sectionIndex, blockId: block.id, offset: event.currentTarget.selectionStart}); updateBlock(sectionIndex, block.id, current => current.type === "text" ? {...current, markdown: event.target.value} : current); }}/></label> : null}
                                        {block.type === "callout" ? <div className={styles.blockFields}><label>Callout tone<select value={block.tone} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "callout" ? {...current, tone: event.target.value as typeof block.tone} : current)}><option value="mandatory">Mandatory</option><option value="recommended">Recommended</option><option value="warning">Warning</option><option value="example">Example</option><option value="mistake">Mistake</option><option value="info">Info</option><option value="command">Command</option><option value="decision">Decision</option><option value="scenario">Scenario</option><option value="rule">Important rule</option><option value="success">Resolution</option></select></label><label>Title<input value={block.title} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "callout" ? {...current, title: event.target.value} : current)}/></label><label>Body<textarea rows={4} value={block.markdown} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "callout" ? {...current, markdown: event.target.value} : current)}/></label></div> : null}
                                        {block.type === "check" ? <div className={styles.blockFields}>
                                            <p className={styles.fieldHint}>Ungraded practice with immediate feedback. No attempts or scores are recorded.</p>
                                            <label>Question<textarea required maxLength={2000} value={block.prompt} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "check" ? {...current, prompt: event.target.value} : current)}/></label>
                                            {block.options.map((option, optionIndex) => <label key={optionIndex}>Option {optionIndex + 1}<input required maxLength={500} value={option} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "check" ? {...current, options: current.options.map((text, i) => i === optionIndex ? event.target.value : text)} : current)}/></label>)}
                                            <label>Correct answer<select value={block.correctOption} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "check" ? {...current, correctOption: Number(event.target.value)} : current)}>{block.options.map((_, i) => <option key={i} value={i}>Option {i + 1}</option>)}</select></label>
                                            <div><button type="button" disabled={block.options.length >= 6} onClick={() => updateBlock(sectionIndex, block.id, current => current.type === "check" ? {...current, options: [...current.options, ""]} : current)}>Add answer option</button><button type="button" disabled={block.options.length <= 2} onClick={() => updateBlock(sectionIndex, block.id, current => current.type === "check" ? {...current, options: current.options.slice(0, -1), correctOption: Math.min(current.correctOption, current.options.length - 2)} : current)}>Remove last option</button></div>
                                            <label>Correct-answer explanation<textarea required maxLength={4000} rows={3} value={block.explanation} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "check" ? {...current, explanation: event.target.value} : current)}/></label>
                                            <label>Incorrect-answer explanation (optional)<textarea maxLength={4000} rows={3} value={block.incorrectExplanation ?? ""} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "check" ? {...current, incorrectExplanation: event.target.value || undefined} : current)}/></label>
                                        </div> : null}
                                        {block.type === "diagram" ? <div className={styles.blockFields}>
                                            <label>Diagram ID<input pattern="[a-z0-9][a-z0-9-]{0,79}" value={block.diagramId} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "diagram" ? {...current, diagramId: event.target.value} : current)}/></label>
                                            <span className={styles.fieldHint}>Built-in diagrams render safely for learners.</span>
                                            {block.diagramId === "ground-runway-crossing" ? <label>Runway crossing scenario<select value={String(block.props?.scenario ?? "departure-conflict")} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "diagram" ? {...current, props: {...current.props, scenario: event.target.value}} : current)}>{["overview", "departure-before", "departure-conflict", "departure-past", "departure-turning", "arrival-before", "arrival-exiting", "arrival-past"].map(value => <option key={value} value={value}>{value.replace(/-/g, " ")}</option>)}</select></label> : null}
                                        </div> : null}
                                        {block.type === "quiz" ? <div className={styles.blockFields}><label>Quiz<select required value={block.quizId} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "quiz" ? {...current, quizId: event.target.value} : current)}><option value="">Choose a quiz…</option>{quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label><label className={styles.inlineCheck}><input type="checkbox" checked={block.required} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "quiz" ? {...current, required: event.target.checked, passPercent: event.target.checked ? current.passPercent ?? 80 : undefined} : current)}/> Required to continue</label><label>Pass percentage<input type="number" min={1} max={100} step={1} disabled={!block.required} value={block.passPercent ?? 80} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "quiz" ? {...current, passPercent: Number(event.target.value)} : current)}/></label></div> : null}
                                        {block.type === "activity" ? <div className={styles.blockFields}>{activities.length > 0 ? <label>Choose course activity<select value={activities.some(activity => activity.id === block.activityId) ? block.activityId : ""} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "activity" ? {...current, activityId: event.target.value} : current)}><option value="">Choose an activity…</option>{activities.map(activity => <option key={activity.id} value={activity.id}>{activity.title} · {activity.type}</option>)}</select></label> : null}<label>Activity UUID<input required value={block.activityId} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "activity" ? {...current, activityId: event.target.value} : current)}/></label><label className={styles.inlineCheck}><input type="checkbox" checked={block.required} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "activity" ? {...current, required: event.target.checked, passPercent: event.target.checked ? current.passPercent ?? 80 : undefined} : current)}/> Required to continue</label><label>Pass percentage<input type="number" min={1} max={100} step={1} disabled={!block.required} value={block.passPercent ?? 80} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "activity" ? {...current, passPercent: Number(event.target.value)} : current)}/></label></div> : null}
                                        {block.type === "media" ? <div className={styles.mediaBlock}><div className={styles.mediaPreview}>{pendingPreviews[block.id] ? block.kind === "image" ? isHeicMediaFile(pendingFiles[block.id]) ? <span>HEIC image will be converted after upload.</span> : <img src={pendingPreviews[block.id]} alt="Pending course upload"/> : <video src={pendingPreviews[block.id]} controls={block.controls ?? true}/> : block.mediaId ? block.kind === "image" ? <img src={`${ApiUtils.apiOrigin}/admin/courses/${encodeURIComponent(draft.id ?? "")}/media/${encodeURIComponent(block.mediaId)}`} alt={block.alt || "Course image"}/> : <video src={`${ApiUtils.apiOrigin}/admin/courses/${encodeURIComponent(draft.id ?? "")}/media/${encodeURIComponent(block.mediaId)}`} controls={block.controls ?? true} preload="metadata"/> : <span>Drop a file here or choose one below.</span>}</div><div className={styles.blockFields}><label>Alt text{block.kind === "image" ? " (required)" : ""}<input required={block.kind === "image"} value={block.alt ?? ""} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "media" ? {...current, alt: event.target.value} : current)}/></label><label>Caption<input value={block.caption ?? ""} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "media" ? {...current, caption: event.target.value} : current)}/></label><label>Width<select value={block.width} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "media" ? {...current, width: event.target.value as CourseMediaBlock["width"]} : current)}><option value="content">Content</option><option value="wide">Wide</option><option value="full">Full</option></select></label><label>Alignment<select value={block.align} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "media" ? {...current, align: event.target.value as CourseMediaBlock["align"]} : current)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>{block.kind === "video" ? <><label className={styles.inlineCheck}><input type="checkbox" checked={block.controls ?? true} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "media" ? {...current, controls: event.target.checked} : current)}/> Show video controls</label><label>Poster media UUID<input value={block.posterMediaId ?? ""} onChange={event => updateBlock(sectionIndex, block.id, current => current.type === "media" ? {...current, posterMediaId: event.target.value || undefined} : current)}/></label></> : null}<label className={styles.fileButton}>Choose replacement file<input type="file" accept={ACCEPTED_MEDIA} onChange={event => { replaceMedia(sectionIndex, block, event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/></label>{uploading[block.id] ? <><span className={styles.uploading}>Uploading {uploadProgress[block.id] ?? 0}%…</span><button type="button" className={styles.quietButton} onClick={() => cancelUpload(block.id)}>Cancel upload</button></> : pendingFiles[block.id] ? <><span className={styles.uploading}>{draft.id ? "Upload failed — retry or replace the file." : "Queued until save"}</span>{draft.id ? <button type="button" className={styles.quietButton} onClick={() => retryUpload(block.id)}>Retry upload</button> : null}</> : null}</div></div> : null}
                                    </div>
                                </div>)}
                                <div className={styles.insertionZone} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.files.length) enqueueFiles(sectionIndex, document.blocks.length, Array.from(event.dataTransfer.files)); else moveBlock(sectionIndex, document.blocks.length); }}><InsertBlockMenu label="＋ Add at end" onInsert={type => addBlock(sectionIndex, document.blocks.length, type)}/><span>Drop image/video at the end</span></div>
                            </div>
                            <div className={styles.mediaDropZone}><span>Drop image/video anywhere in this section</span><label className={styles.fileButton}>Attach files<input type="file" multiple accept={ACCEPTED_MEDIA} onChange={event => { enqueueFiles(sectionIndex, document.blocks.length, Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }}/></label></div>
                        </article>;
                    })}
                </div>
                </div>
            </fieldset>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.footer}>{course && onDelete ? <button type="button" className={styles.removeButton} disabled={isSaving || Object.keys(uploading).length > 0} onClick={() => onDelete(disarm)}>Delete course</button> : null}<button type="button" className={styles.quietButton} disabled={isSaving} onClick={() => void confirmAndRun(onCancel)}>Cancel</button><button type="submit" className={styles.saveButton} disabled={isSaving}>{isSaving ? "Saving course…" : "Save course"}</button></div>
        </form>
    </section>;
}
