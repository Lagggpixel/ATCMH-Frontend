import {useEffect, useState} from "react";
import type {ExamImportError, ExamQuestion, ManagedExamQuiz} from "../../types/Exam.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {stableExamValue} from "./ExamUnsavedChanges.ts";
import styles from "./ExamEditor.module.css";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges.ts";

interface ExamEditorProps {
    quiz: ManagedExamQuiz | null;
    token: string;
    onCancel: () => void;
    onSaved: () => void;
}

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

const ExamEditor = ({quiz, token, onCancel, onSaved}: ExamEditorProps) => {
    const [draft, setDraft] = useState<ManagedExamQuiz>(() => asDraft(quiz));
    const [baseline, setBaseline] = useState<ManagedExamQuiz>(() => asDraft(quiz));
    const [validationErrors, setValidationErrors] = useState<ExamImportError[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setBaseline(asDraft(quiz));
        setDraft(asDraft(quiz));
        setValidationErrors([]);
        setError(null);
    }, [quiz]);

    const isDirty = stableExamValue(draft) !== stableExamValue(baseline);
    const {confirmAndRun, disarm} = useExamUnsavedChanges({isDirty});

    const updateQuestion = (questionIndex: number, update: (question: ExamQuestion) => ExamQuestion) => {
        setDraft(current => ({...current, questions: current.questions.map((question, index) => index === questionIndex ? update(question) : question)}));
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setValidationErrors([]);
        setIsSaving(true);
        try {
            const result = await ExamsApiUtils.saveQuiz(draft, token);
            if (result.valid === false) {
                setValidationErrors(result.errors ?? [{path: "quiz", message: "The Exams service rejected this quiz."}]);
                return;
            }
            disarm();
            onSaved();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsSaving(false);
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
                        <label>Category<input required value={draft.category} maxLength={255} onChange={event => setDraft(current => ({...current, category: event.target.value}))}/></label>
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
                <div className={styles.footer}><button type="button" className={styles.quietButton} onClick={() => confirmAndRun(onCancel)}>Cancel</button><button type="submit" className={styles.saveButton}>{isSaving ? "Saving…" : "Save quiz"}</button></div>
            </form>
        </section>
    );
};

export default ExamEditor;
