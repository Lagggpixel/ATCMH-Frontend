import {useEffect, useRef, useState} from "react";
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUp, List, Plus, Trash} from "@phosphor-icons/react";
import type {ExamCategory, ExamImportError, ExamQuestion, ExamQuizSummary, ManagedExamQuiz} from "../../types/Exam.ts";
import {getExamCategoryLabel} from "../../utils/ExamCatalogUtils.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {alignGroundControlQuiz, groundControlQuizAlignmentState} from "../../utils/GroundControlQuizAlignment.ts";
import {stableExamValue} from "./ExamUnsavedChanges.ts";
import {firstInvalidQuestion, moveExamQuestion, validateExamDraft} from "./ExamDraftModel.ts";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges.ts";
import styles from "./ExamEditor.module.css";

interface ExamEditorProps {
    quiz: ManagedExamQuiz | null;
    categories: ExamCategory[];
    token: string;
    onCancel: () => void;
    canManageFolders?: boolean;
    onCreateCategory?: (name: string) => Promise<ExamCategory>;
    onSaved: (quiz: ExamQuizSummary) => void;
}

const createCategoryValue = "__create_category__";
const newQuestion = (): ExamQuestion => ({prompt: "", randomizeOptions: false, options: [{text: "", isCorrect: true}, {text: "", isCorrect: false}]});
const newQuiz = (): ManagedExamQuiz => ({title: "", description: "", category: "", feedbackMode: "after_submission", timeLimitSeconds: 0, tags: [], isPrivate: true, randomizeQuestions: false, questions: [newQuestion()]});
const asDraft = (quiz: ManagedExamQuiz | null): ManagedExamQuiz => quiz ? {...quiz, questions: quiz.questions.map(question => ({...question, options: question.options.map(option => ({...option}))}))} : newQuiz();

const ExamEditor = ({quiz, categories, token, onCancel, canManageFolders = false, onCreateCategory, onSaved}: ExamEditorProps) => {
    const [draft, setDraft] = useState<ManagedExamQuiz>(() => asDraft(quiz));
    const [baseline, setBaseline] = useState<ManagedExamQuiz>(() => asDraft(quiz));
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [detailsOpen, setDetailsOpen] = useState(!quiz?.id);
    const [outlineOpen, setOutlineOpen] = useState(false);
    const [validationErrors, setValidationErrors] = useState<ExamImportError[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [showCategoryCreator, setShowCategoryCreator] = useState(false);
    const savingRef = useRef(false);
    const outlineTriggerRef = useRef<HTMLButtonElement>(null);
    const outlineCloseRef = useRef<HTMLButtonElement>(null);
    const outlinePanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setBaseline(asDraft(quiz));
        setDraft(asDraft(quiz));
        setSelectedIndex(0);
        setDetailsOpen(!quiz?.id);
        setValidationErrors([]);
        setError(null);
        setIsCreatingCategory(false);
        setNewCategoryName("");
        setShowCategoryCreator(false);
    }, [quiz]);

    useEffect(() => {
        if (!outlineOpen) return;
        outlineCloseRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") { setOutlineOpen(false); outlineTriggerRef.current?.focus(); return; }
            if (event.key !== "Tab") return;
            const focusable = Array.from(outlinePanelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [outlineOpen]);

    const isDirty = stableExamValue(draft) !== stableExamValue(baseline);
    const {confirmAndRun, disarm} = useExamUnsavedChanges({isDirty});
    const selectedCategoryId = draft.categoryId ?? categories.find(category => category.name.trim() === draft.category.trim())?.id ?? "";
    const canChangeFolder = !quiz?.id || canManageFolders;
    const groundAlignment = groundControlQuizAlignmentState(draft);
    const currentIndex = Math.min(selectedIndex, draft.questions.length - 1);
    const selectedQuestion = draft.questions[currentIndex];

    const updateQuestion = (questionIndex: number, update: (question: ExamQuestion) => ExamQuestion) => {
        setDraft(current => ({...current, questions: current.questions.map((question, index) => index === questionIndex ? update(question) : question)}));
    };
    const selectQuestion = (index: number) => { setSelectedIndex(index); setDetailsOpen(false); setOutlineOpen(false); };
    const addQuestion = () => { setDraft(current => ({...current, questions: [...current.questions, newQuestion()]})); selectQuestion(draft.questions.length); };
    const removeQuestion = (index: number) => {
        if (draft.questions.length <= 1) return;
        setDraft(current => ({...current, questions: current.questions.filter((_, itemIndex) => itemIndex !== index)}));
        setSelectedIndex(Math.min(index, draft.questions.length - 2));
    };
    const moveQuestion = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= draft.questions.length) return;
        setDraft(current => ({...current, questions: moveExamQuestion(current.questions, index, direction)}));
        setSelectedIndex(target);
    };
    const showErrors = (issues: ExamImportError[]) => {
        setValidationErrors(issues);
        const firstIssue = issues[0];
        if (!firstIssue) return;
        const questionIndex = firstInvalidQuestion([firstIssue]);
        if (questionIndex !== null) {
            selectQuestion(questionIndex);
            window.setTimeout(() => {
                const optionIndex = firstIssue.path.match(/\.options\[(\d+)\]/)?.[1];
                if (optionIndex !== undefined) document.querySelector<HTMLInputElement>(`input[aria-label="Option ${Number(optionIndex) + 1} for question ${questionIndex + 1}"]`)?.focus();
                else if (firstIssue.path.includes(".options")) document.querySelector<HTMLInputElement>(`input[name="correct-${questionIndex}"]`)?.focus();
                else document.getElementById("exam-question-prompt")?.focus();
            }, 0);
        } else if (["title", "category", "timeLimitSeconds"].includes(firstIssue.path)) {
            setDetailsOpen(true);
            const fieldId = firstIssue.path === "title" ? "exam-title" : firstIssue.path === "category" ? "exam-folder" : "exam-time-limit";
            window.setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
        } else {
            setError(firstIssue.message);
        }
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (savingRef.current) return;
        setError(null);
        const issues = validateExamDraft(draft, showCategoryCreator ? "" : selectedCategoryId);
        if (issues.length > 0) { showErrors(issues); return; }
        setValidationErrors([]);
        savingRef.current = true;
        setIsSaving(true);
        try {
            const selectedCategory = categories.find(category => category.id === selectedCategoryId);
            const result = await ExamsApiUtils.saveQuiz({...draft, categoryId: selectedCategoryId, category: selectedCategory?.name ?? draft.category}, token);
            if (result.valid !== true || !result.quiz?.id) { showErrors(result.errors ?? [{path: "quiz", message: "The Exams service rejected this quiz."}]); return; }
            disarm();
            onSaved(result.quiz);
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { savingRef.current = false; setIsSaving(false); }
    };

    const createCategory = async () => {
        const name = newCategoryName.trim();
        if (!name || !onCreateCategory || isCreatingCategory) return;
        setError(null);
        setIsCreatingCategory(true);
        try {
            const category = await onCreateCategory(name);
            setDraft(current => ({...current, categoryId: category.id, category: category.name}));
            setNewCategoryName("");
            setShowCategoryCreator(false);
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { setIsCreatingCategory(false); }
    };

    const questionOutline = (mobile: boolean) => <>
        <div className={styles.outlineHeading}><h3>Questions</h3>{mobile ? <button ref={outlineCloseRef} type="button" onClick={() => { setOutlineOpen(false); outlineTriggerRef.current?.focus(); }} aria-label="Close questions"><ArrowRight size={20}/></button> : null}</div>
        <ol className={styles.outlineList}>{draft.questions.map((question, index) => <li key={index} className={index === currentIndex ? styles.outlineActive : ""}>
            <button className={styles.outlineSelect} type="button" onClick={() => selectQuestion(index)} aria-current={index === currentIndex ? "step" : undefined}><span>{index + 1}</span><strong>{question.prompt.trim() || `Untitled question ${index + 1}`}</strong></button>
            <span className={styles.outlineActions}><button type="button" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => moveQuestion(index, -1)}><ArrowUp size={15}/></button><button type="button" aria-label={`Move question ${index + 1} down`} disabled={index === draft.questions.length - 1} onClick={() => moveQuestion(index, 1)}><ArrowDown size={15}/></button></span>
        </li>)}</ol>
        <button type="button" className={styles.addQuestion} onClick={addQuestion}><Plus size={17}/> Add question</button>
    </>;

    return <section className={styles.editor} aria-labelledby="exam-editor-heading">
        <div className={styles.heading}><div><p className={styles.eyebrow}>{quiz?.id ? "Edit quiz" : "New quiz"}</p><h2 id="exam-editor-heading">{quiz?.id ? draft.title || "Untitled quiz" : "Create a quiz"}</h2></div><button type="button" className={styles.quietButton} disabled={isSaving} onClick={() => confirmAndRun(onCancel)}>Back to quizzes</button></div>
        <form noValidate onSubmit={event => void submit(event)}>
            <fieldset disabled={isSaving} className={styles.formFields}>
                <div className={styles.detailsSurface}><button type="button" className={styles.detailsToggle} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(current => !current)}><span><strong>Quiz details</strong><small>Title, folder, feedback and settings</small></span><span>{detailsOpen ? "Hide details" : "Edit details"}</span></button>
                    {detailsOpen ? <div className={styles.detailsBody}>
                        {groundAlignment !== "unrelated" ? <div className={styles.alignment}>{groundAlignment === "available" ? <><p>Align questions 1 and 4 with the Ground course. Review the staged wording before saving.</p><button type="button" onClick={() => setDraft(current => alignGroundControlQuiz(current))}>Apply Ground course alignment</button></> : <p>{groundAlignment === "aligned" ? "Questions 1 and 4 match the Ground course alignment." : "Ground questions have changed from the reviewed version. Review their wording manually."}</p>}</div> : null}
                        <div className={styles.fieldGrid}>
                            <label>Title<input id="exam-title" value={draft.title} maxLength={255} aria-invalid={validationErrors.some(issue => issue.path === "title")} onChange={event => setDraft(current => ({...current, title: event.target.value}))}/></label>
                            <label>Folder<select id="exam-folder" aria-label="Folder" aria-invalid={validationErrors.some(issue => issue.path === "category")} disabled={!canChangeFolder} value={showCategoryCreator ? createCategoryValue : selectedCategoryId} onChange={event => { if (event.target.value === createCategoryValue) { setShowCategoryCreator(true); return; } const category = categories.find(item => item.id === event.target.value); setShowCategoryCreator(false); setDraft(current => ({...current, categoryId: category?.id, category: category?.name ?? ""})); }}><option value="">Choose a folder</option>{categories.map(category => <option key={category.id} value={category.id}>{getExamCategoryLabel(category, categories)}</option>)}{canManageFolders && onCreateCategory ? <option value={createCategoryValue}>+ Create new folder…</option> : null}</select></label>
                            {showCategoryCreator && canManageFolders && onCreateCategory ? <div className={styles.folderCreator}><label>New folder name<input autoFocus value={newCategoryName} maxLength={255} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void createCategory(); } }}/></label><button type="button" onClick={() => void createCategory()} disabled={!newCategoryName.trim() || isCreatingCategory}>{isCreatingCategory ? "Creating…" : "Create folder"}</button><button type="button" onClick={() => setShowCategoryCreator(false)}>Cancel</button></div> : null}
                            <label>Feedback<select value={draft.feedbackMode} onChange={event => setDraft(current => ({...current, feedbackMode: event.target.value as ManagedExamQuiz["feedbackMode"]}))}><option value="after_submission">After submission</option><option value="after_each_question">After each question</option><option value="none">No feedback</option></select></label>
                            <label>Time limit (seconds)<input id="exam-time-limit" type="number" min="0" max="86400" aria-invalid={validationErrors.some(issue => issue.path === "timeLimitSeconds")} value={draft.timeLimitSeconds} onChange={event => setDraft(current => ({...current, timeLimitSeconds: Number(event.target.value)}))}/></label>
                        </div>
                        <label className={styles.fullField}>Description<textarea rows={3} value={draft.description} onChange={event => setDraft(current => ({...current, description: event.target.value}))}/></label>
                        <label className={styles.fullField}>Tags (comma separated)<input value={draft.tags.join(", ")} onChange={event => setDraft(current => ({...current, tags: event.target.value.split(",").map(tag => tag.trim()).filter(Boolean)}))}/></label>
                        <div className={styles.settings}><label><input type="checkbox" checked={draft.isPrivate} onChange={event => setDraft(current => ({...current, isPrivate: event.target.checked}))}/> Keep this quiz private</label><label><input type="checkbox" checked={draft.randomizeQuestions} onChange={event => setDraft(current => ({...current, randomizeQuestions: event.target.checked}))}/> Randomize question order</label></div>
                    </div> : null}
                </div>
                <div className={styles.questionWorkspace}>
                    <aside className={styles.outline} aria-label="Question outline">{questionOutline(false)}</aside>
                    <div className={styles.questionSurface}>
                        <div className={styles.questionToolbar}><div><button ref={outlineTriggerRef} type="button" className={styles.outlineTrigger} onClick={() => setOutlineOpen(true)}><List size={18}/> All questions</button><h3>Question {currentIndex + 1} of {draft.questions.length}</h3></div><div className={styles.pager}><button type="button" aria-label="Previous question" disabled={currentIndex === 0} onClick={() => selectQuestion(currentIndex - 1)}><ArrowLeft size={18}/></button><button type="button" aria-label="Next question" disabled={currentIndex === draft.questions.length - 1} onClick={() => selectQuestion(currentIndex + 1)}><ArrowRight size={18}/></button></div></div>
                        {selectedQuestion ? <div className={styles.questionBody}><label>Prompt<textarea id="exam-question-prompt" rows={3} value={selectedQuestion.prompt} aria-invalid={validationErrors.some(issue => issue.path === `questions[${currentIndex}].prompt`)} onChange={event => updateQuestion(currentIndex, current => ({...current, prompt: event.target.value}))}/></label><h4>Answer options</h4><div className={styles.options}>{selectedQuestion.options.map((option, optionIndex) => <div className={styles.option} key={optionIndex}><label className={styles.correctRadio}><input type="radio" name={`correct-${currentIndex}`} checked={option.isCorrect} onChange={() => updateQuestion(currentIndex, current => ({...current, options: current.options.map((item, index) => ({...item, isCorrect: index === optionIndex}))}))}/><span className={styles.visuallyHidden}>Option {optionIndex + 1} is correct</span></label><input aria-label={`Option ${optionIndex + 1} for question ${currentIndex + 1}`} value={option.text} aria-invalid={validationErrors.some(issue => issue.path === `questions[${currentIndex}].options[${optionIndex}]`)} onChange={event => updateQuestion(currentIndex, current => ({...current, options: current.options.map((item, index) => index === optionIndex ? {...item, text: event.target.value} : item)}))}/><button type="button" aria-label={`Remove option ${optionIndex + 1}`} disabled={selectedQuestion.options.length <= 2} onClick={() => updateQuestion(currentIndex, current => ({...current, options: current.options.filter((_, index) => index !== optionIndex)}))}><Trash size={17}/></button></div>)}</div><div className={styles.questionSettings}><button type="button" className={styles.addOption} onClick={() => updateQuestion(currentIndex, current => ({...current, options: [...current.options, {text: "", isCorrect: false}]}))}><Plus size={16}/> Add option</button><label><input type="checkbox" checked={selectedQuestion.randomizeOptions} onChange={event => updateQuestion(currentIndex, current => ({...current, randomizeOptions: event.target.checked}))}/> Randomize options</label></div><button type="button" className={styles.removeQuestion} disabled={draft.questions.length <= 1} onClick={() => removeQuestion(currentIndex)}><Trash size={16}/> Remove question</button></div> : null}
                    </div>
                </div>
            </fieldset>
            {validationErrors.length > 0 ? <section className={styles.validationErrors} role="alert"><h3>Review these fields</h3><ul>{validationErrors.map((issue, index) => <li key={`${issue.path}:${index}`}>{issue.message}</li>)}</ul></section> : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.footer}><button type="button" className={styles.quietButton} disabled={isSaving} onClick={() => confirmAndRun(onCancel)}>Cancel</button><button type="submit" className={styles.saveButton} disabled={isSaving || showCategoryCreator}>{isSaving ? "Saving…" : "Save quiz"}</button></div>
        </form>
        {outlineOpen ? <div className={styles.drawerBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) { setOutlineOpen(false); outlineTriggerRef.current?.focus(); } }}><div ref={outlinePanelRef} className={styles.drawer} role="dialog" aria-modal="true" aria-label="Question outline">{questionOutline(true)}</div></div> : null}
    </section>;
};

export default ExamEditor;
