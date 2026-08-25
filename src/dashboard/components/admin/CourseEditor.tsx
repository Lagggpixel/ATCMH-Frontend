import {useEffect, useState} from "react";
import type {ExamQuizSummary} from "../../types/Exam.ts";
import type {ManagedCourse, ManagedCourseDraft} from "../../types/Course.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {stableExamValue} from "./ExamUnsavedChanges.ts";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges.ts";
import styles from "./CourseCenter.module.css";

interface CourseEditorProps {
    course: ManagedCourse | null;
    quizzes: ExamQuizSummary[];
    token: string;
    canPublish: boolean;
    onCancel: () => void;
    onPreview?: () => void;
    onSaved: (course: ManagedCourse) => void;
}

const newSection = (sortOrder: number) => ({title: "", markdown: "# Section title\n\nWrite the learning material here.", sortOrder});
const newCourse = (): ManagedCourseDraft => ({slug: "", title: "", description: "", isPublished: false, sections: [newSection(1)]});
const asDraft = (course: ManagedCourse | null): ManagedCourseDraft => course ? {id: course.id, slug: course.slug, title: course.title, description: course.description, isPublished: course.isPublished, sections: course.sections.map(section => ({...section}))} : newCourse();

export default function CourseEditor({course, quizzes, token, canPublish, onCancel, onPreview, onSaved}: CourseEditorProps) {
    const [draft, setDraft] = useState<ManagedCourseDraft>(() => asDraft(course));
    const [baseline, setBaseline] = useState<ManagedCourseDraft>(() => asDraft(course));
    const [quizSelection, setQuizSelection] = useState<Record<string, string>>({});
    const [quizRequired, setQuizRequired] = useState<Record<string, boolean>>({});
    const [quizPassRequired, setQuizPassRequired] = useState<Record<string, boolean>>({});
    const [quizPassPercentage, setQuizPassPercentage] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingSection, setUploadingSection] = useState<number | null>(null);
    const isDirty = stableExamValue(draft) !== stableExamValue(baseline);
    const {confirmAndRun, disarm} = useExamUnsavedChanges({isDirty});

    useEffect(() => {
        const next = asDraft(course);
        setDraft(next);
        setBaseline(next);
        setQuizSelection({});
        setQuizRequired({});
        setQuizPassRequired({});
        setQuizPassPercentage({});
        setError(null);
    }, [course]);

    const updateSection = (index: number, update: (section: ManagedCourseDraft["sections"][number]) => ManagedCourseDraft["sections"][number]) => {
        setDraft(current => ({...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? update(section) : section)}));
    };

    const appendToSection = (index: number, value: string) => updateSection(index, section => ({...section, markdown: `${section.markdown.trimEnd()}\n\n${value}\n`}));

    const insertQuiz = (index: number) => {
        const key = draft.sections[index].id ?? `new-${index}`;
        const id = quizSelection[key];
        if (!id) return;
        const required = quizRequired[key] ?? true;
        const requirePass = quizPassRequired[key] ?? false;
        const passPercentage = Number(quizPassPercentage[key] ?? "80");
        if (requirePass && (!Number.isInteger(passPercentage) || passPercentage < 1 || passPercentage > 100)) {
            setError("Passing scores must be whole numbers between 1 and 100.");
            return;
        }
        appendToSection(index, `{{quiz:${id}${required ? " required" : ""}${requirePass ? ` pass:${passPercentage}` : ""}}}`);
    };

    const upload = async (index: number, file: File | undefined) => {
        if (!file) return;
        if (!draft.id) { setError("Save the course once before attaching media."); return; }
        setUploadingSection(index);
        setError(null);
        try {
            const media = await ExamsApiUtils.uploadCourseMedia(draft.id, file, token);
            appendToSection(index, media.markdown);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setUploadingSection(null);
        }
    };

    const save = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            const saved = await ExamsApiUtils.saveCourse(draft, token);
            const next = asDraft(saved);
            setDraft(next);
            setBaseline(next);
            disarm();
            onSaved(saved);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsSaving(false);
        }
    };

    return <section className={styles.editor} aria-labelledby="course-editor-heading">
        <div className={styles.heading}><div><p className={styles.eyebrow}>{course ? "Edit course" : "New course"}</p><h2 id="course-editor-heading">{draft.title || "Create a course"}</h2></div><div className={styles.headingButtons}>{course && onPreview ? <button type="button" className={styles.quietButton} onClick={() => confirmAndRun(onPreview)}>Preview</button> : null}<button type="button" className={styles.quietButton} onClick={() => confirmAndRun(onCancel)}>Back to courses</button></div></div>
        <p className={styles.description}>Write each section in Markdown. Quiz and media tokens are inserted into the document so checkpoints can appear anywhere in the reading.</p>
        <form onSubmit={event => void save(event)}>
            <fieldset disabled={isSaving}>
                <div className={styles.fieldGrid}>
                    <label>Title<input required maxLength={255} value={draft.title} onChange={event => setDraft(current => ({...current, title: event.target.value}))}/></label>
                    <label>Slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={200} value={draft.slug} onChange={event => setDraft(current => ({...current, slug: event.target.value}))}/></label>
                </div>
                <label>Description<textarea rows={3} maxLength={2000} value={draft.description} onChange={event => setDraft(current => ({...current, description: event.target.value}))}/></label>
                <label className={styles.check}><input type="checkbox" checked={draft.isPublished} disabled={!canPublish} onChange={event => setDraft(current => ({...current, isPublished: event.target.checked}))}/> Make available to signed-in learners {canPublish ? "" : "(administrator publishing permission required)"}</label>
                <p className={styles.syntax}>Supported tokens: <code>{"{{quiz:QUIZ_ID required}}"}</code>, <code>{"{{quiz:QUIZ_ID required pass:80}}"}</code>, <code>{"{{quiz:QUIZ_ID}}"}</code>, <code>{"{{image:MEDIA_ID}}"}</code>, and <code>{"{{video:MEDIA_ID}}"}</code>.</p>
                <div className={styles.sectionsHeading}><h3>Sections</h3><button type="button" onClick={() => setDraft(current => ({...current, sections: [...current.sections, newSection(current.sections.length + 1)]}))}>Add section</button></div>
                <div className={styles.sections}>
                    {draft.sections.map((section, index) => {
                        const key = section.id ?? `new-${index}`;
                        return <article className={styles.sectionCard} key={key}>
                            <div className={styles.sectionCardHeading}><h4>Section {index + 1}</h4>{draft.sections.length > 1 ? <button type="button" className={styles.removeButton} onClick={() => setDraft(current => ({...current, sections: current.sections.filter((_, sectionIndex) => sectionIndex !== index).map((item, sectionIndex) => ({...item, sortOrder: sectionIndex + 1}))}))}>Remove</button> : null}</div>
                            <label>Section title<input required maxLength={255} value={section.title} onChange={event => updateSection(index, current => ({...current, title: event.target.value}))}/></label>
                            <label>Markdown<textarea required rows={15} value={section.markdown} onChange={event => updateSection(index, current => ({...current, markdown: event.target.value}))}/></label>
                            <div className={styles.insertTools} aria-label={`Insert content into section ${index + 1}`}>
                                <select aria-label={`Quiz to insert into section ${index + 1}`} value={quizSelection[key] ?? ""} onChange={event => setQuizSelection(current => ({...current, [key]: event.target.value}))}>
                                    <option value="">Choose a quiz…</option>
                                    {quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}
                                </select>
                                <label className={styles.inlineCheck}><input type="checkbox" checked={quizRequired[key] ?? true} onChange={event => { const required = event.target.checked; setQuizRequired(current => ({...current, [key]: required})); if (!required) setQuizPassRequired(current => ({...current, [key]: false})); }}/> Required to continue</label>
                                <label className={styles.inlineCheck}><input type="checkbox" checked={quizPassRequired[key] ?? false} disabled={!(quizRequired[key] ?? true)} onChange={event => setQuizPassRequired(current => ({...current, [key]: event.target.checked}))}/> Require pass <input className={styles.scoreInput} aria-label={`Passing score for section ${index + 1}`} type="number" min={1} max={100} step={1} disabled={!(quizRequired[key] ?? true) || !(quizPassRequired[key] ?? false)} value={quizPassPercentage[key] ?? "80"} onChange={event => setQuizPassPercentage(current => ({...current, [key]: event.target.value}))}/> %</label>
                                <button type="button" onClick={() => insertQuiz(index)} disabled={!quizSelection[key]}>Insert quiz token</button>
                                <label className={styles.fileButton}>Attach image/video<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" onChange={event => { void upload(index, event.target.files?.[0]); event.currentTarget.value = ""; }}/></label>
                                {uploadingSection === index ? <span className={styles.uploading}>Uploading…</span> : null}
                            </div>
                        </article>;
                    })}
                </div>
            </fieldset>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.footer}><button type="button" className={styles.quietButton} onClick={() => confirmAndRun(onCancel)}>Cancel</button><button type="submit" className={styles.saveButton}>{isSaving ? "Saving…" : "Save course"}</button></div>
        </form>
    </section>;
}
