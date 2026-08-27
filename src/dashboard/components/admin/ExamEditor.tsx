import {useEffect, useRef, useState} from "react";
import type {ExamCategory, ExamImportError, ExamQuestion, ExamQuizSummary, ManagedExamQuiz} from "../../types/Exam.ts";
import {getExamCategoryLabel} from "../../utils/ExamCatalogUtils.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {stableExamValue} from "./ExamUnsavedChanges.ts";
import styles from "./ExamEditor.module.css";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges.ts";

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

const newQuestion = (): ExamQuestion => ({
    prompt: "",
    randomizeOptions: false,
    options: [{text: "", isCorrect: true}, {text: "", isCorrect: false}],
});

const newQuiz = (): ManagedExamQuiz => ({
    title: "",
    description: "",
    category: "",
    feedbackMode: "after_submission",
    timeLimitSeconds: 0,
    tags: [],
    isPrivate: true,
    randomizeQuestions: false,
    questions: [newQuestion()],
});

const asDraft = (quiz: ManagedExamQuiz | null): ManagedExamQuiz => quiz ? {
    ...quiz,
    questions: quiz.questions.map(question => ({...question, options: question.options.map(option => ({...option}))})),
} : newQuiz();

const ExamEditor = ({quiz, categories, token, onCancel, canManageFolders = false, onCreateCategory, onSaved}: ExamEditorProps) => {
    const [draft, setDraft] = useState<ManagedExamQuiz>(() => asDraft(quiz));
    const [baseline, setBaseline] = useState<ManagedExamQuiz>(() => asDraft(quiz));
    const [validationErrors, setValidationErrors] = useState<ExamImportError[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [showCategoryCreator, setShowCategoryCreator] = useState(false);
    const savingRef = useRef(false);

    useEffect(() => {
        setBaseline(asDraft(quiz));
        setDraft(asDraft(quiz));
        setValidationErrors([]);
        setError(null);
        setIsCreatingCategory(false);
        setNewCategoryName("");
        setShowCategoryCreator(false);
    }, [quiz]);

    const isDirty = stableExamValue(draft) !== stableExamValue(baseline);
    const {confirmAndRun, disarm} = useExamUnsavedChanges({isDirty});
    const selectedCategoryId = draft.categoryId
        ?? categories.find(category => category.name.trim() === draft.category.trim())?.id
        ?? "";
    const canChangeFolder = !quiz?.id || canManageFolders;

    const updateQuestion = (questionIndex: number, update: (question: ExamQuestion) => ExamQuestion) => {
        setDraft(current => ({...current, questions: current.questions.map((question, index) => index === questionIndex ? update(question) : question)}));
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (savingRef.current) return;
        setError(null);
        setValidationErrors([]);
        if (showCategoryCreator || !selectedCategoryId) {
            setValidationErrors([{path: "category", message: "Choose an existing folder or create a new one."}]);
            return;
        }
        savingRef.current = true;
        setIsSaving(true);
        try {
            const selectedCategory = categories.find(category => category.id === selectedCategoryId);
            const result = await ExamsApiUtils.saveQuiz({
                ...draft,
                categoryId: selectedCategoryId,
                category: selectedCategory?.name ?? draft.category,
            }, token);
            if (result.valid !== true || !result.quiz?.id) {
                setValidationErrors(result.errors ?? [{path: "quiz", message: "The Exams service rejected this quiz."}]);
                return;
            }
            disarm();
            onSaved(result.quiz);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
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
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsCreatingCategory(false);
        }
    };

    return (
        <section className={styles.editor} aria-labelledby="exam-editor-heading">
            <div className={styles.heading}>
                <div><p className={styles.eyebrow}>{quiz?.id ? "Edit quiz" : "New quiz"}</p><h2 id="exam-editor-heading">{quiz?.id ? draft.title || "Untitled quiz" : "Create an exam"}</h2></div>
                <button type="button" className={styles.quietButton} onClick={() => confirmAndRun(onCancel)}>Back to quizzes</button>
            </div>
            <p className={styles.description}>Changes remain local until you choose Save quiz. The Exams service validates every submission.</p>
            <form onSubmit={event => void submit(event)}>
                <fieldset disabled={isSaving}>
                    <div className={styles.fieldGrid}>
                        <label>Title<input required value={draft.title} maxLength={255} onChange={event => setDraft(current => ({...current, title: event.target.value}))}/></label>
                        <label>Folder
                            <select required aria-label="Folder" disabled={!canChangeFolder} value={showCategoryCreator ? createCategoryValue : selectedCategoryId} onChange={event => {
                                if (event.target.value === createCategoryValue) {
                                    setShowCategoryCreator(true);
                                    return;
                                }
                                const category = categories.find(item => item.id === event.target.value);
                                setShowCategoryCreator(false);
                                setDraft(current => ({...current, categoryId: category?.id, category: category?.name ?? ""}));
                            }}>
                                <option value="" disabled>Choose a folder</option>
                                {categories.map(category => <option key={category.id} value={category.id}>{getExamCategoryLabel(category, categories)}</option>)}
                                {canManageFolders && onCreateCategory ? <option value={createCategoryValue}>+ Create new folder…</option> : null}
                            </select>
                        </label>
                        {showCategoryCreator && canManageFolders && onCreateCategory ? <div className={styles.folderCreator}>
                            <label>New folder name<input autoFocus aria-label="New folder name" value={newCategoryName} maxLength={255} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void createCategory(); } }}/></label>
                            <div className={styles.folderCreatorActions}>
                                <button type="button" className={styles.quietButton} onClick={() => setShowCategoryCreator(false)}>Cancel</button>
                                <button type="button" className={styles.createFolderButton} disabled={!newCategoryName.trim() || isCreatingCategory} onClick={() => void createCategory()}>{isCreatingCategory ? "Creating…" : "Create folder"}</button>
                            </div>
                        </div> : null}
                        <label>Feedback
                            <select value={draft.feedbackMode} onChange={event => setDraft(current => ({...current, feedbackMode: event.target.value as ManagedExamQuiz["feedbackMode"]}))}>
                                <option value="after_submission">After submission</option>
                                <option value="after_each_question">After each question</option>
                                <option value="none">No feedback</option>
                            </select>
                        </label>
                        <label>Time limit (seconds)<input type="number" min="0" max="86400" value={draft.timeLimitSeconds} onChange={event => setDraft(current => ({...current, timeLimitSeconds: Number(event.target.value)}))}/></label>
                    </div>
                    <label className={styles.fullField}>Description<textarea rows={4} value={draft.description} onChange={event => setDraft(current => ({...current, description: event.target.value}))}/></label>
                    <label className={styles.fullField}>Tags (comma separated)<input value={draft.tags.join(", ")} onChange={event => setDraft(current => ({...current, tags: event.target.value.split(",").map(tag => tag.trim()).filter(Boolean)}))}/></label>
                    <label className={styles.check}><input type="checkbox" checked={draft.isPrivate} onChange={event => setDraft(current => ({...current, isPrivate: event.target.checked}))}/> Keep this quiz private</label>
                    <label className={styles.check}><input type="checkbox" checked={draft.randomizeQuestions} onChange={event => setDraft(current => ({...current, randomizeQuestions: event.target.checked}))}/> Randomize question order</label>

                    <div className={styles.questionsHeading}><h3>Questions</h3><button type="button" onClick={() => setDraft(current => ({...current, questions: [...current.questions, newQuestion()]}))}>Add question</button></div>
                    <div className={styles.questions}>
                        {draft.questions.map((question, questionIndex) => <article className={styles.question} key={questionIndex}>
                            <div className={styles.questionTitle}><h4>Question {questionIndex + 1}</h4>{draft.questions.length > 1 ? <button type="button" className={styles.dangerButton} onClick={() => setDraft(current => ({...current, questions: current.questions.filter((_, index) => index !== questionIndex)}))}>Remove</button> : null}</div>
                            <label>Prompt<textarea required rows={3} value={question.prompt} onChange={event => updateQuestion(questionIndex, current => ({...current, prompt: event.target.value}))}/></label>
                            <div className={styles.options}>
                                {question.options.map((option, optionIndex) => <div className={styles.option} key={optionIndex}>
                                    <label><input type="radio" name={`correct-${questionIndex}`} checked={option.isCorrect} onChange={() => updateQuestion(questionIndex, current => ({...current, options: current.options.map((item, index) => ({...item, isCorrect: index === optionIndex}))}))}/> Correct</label>
                                    <input required aria-label={`Option ${optionIndex + 1} for question ${questionIndex + 1}`} value={option.text} onChange={event => updateQuestion(questionIndex, current => ({...current, options: current.options.map((item, index) => index === optionIndex ? {...item, text: event.target.value} : item)}))}/>
                                    {question.options.length > 2 ? <button type="button" className={styles.dangerButton} onClick={() => updateQuestion(questionIndex, current => ({...current, options: current.options.filter((_, index) => index !== optionIndex)}))}>Remove option</button> : null}
                                </div>)}
                            </div>
                            <label className={styles.check}><input type="checkbox" checked={question.randomizeOptions} onChange={event => updateQuestion(questionIndex, current => ({...current, randomizeOptions: event.target.checked}))}/> Randomize options</label>
                            <button type="button" className={styles.addOption} onClick={() => updateQuestion(questionIndex, current => ({...current, options: [...current.options, {text: "", isCorrect: false}]}))}>Add option</button>
                        </article>)}
                    </div>
                </fieldset>
                {validationErrors.length > 0 ? <section className={styles.validationErrors} role="alert"><h3>Review these fields</h3><ul>{validationErrors.map(issue => <li key={`${issue.path}:${issue.message}`}><code>{issue.path}</code>: {issue.message}</li>)}</ul></section> : null}
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                <div className={styles.footer}><button type="button" className={styles.quietButton} onClick={() => confirmAndRun(onCancel)}>Cancel</button><button type="submit" className={styles.saveButton} disabled={isSaving || showCategoryCreator || !selectedCategoryId}>{isSaving ? "Saving…" : "Save quiz"}</button></div>
            </form>
        </section>
    );
};

export default ExamEditor;
