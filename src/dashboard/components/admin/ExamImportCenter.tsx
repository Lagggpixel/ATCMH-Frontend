import {useState} from "react";
import type {ExamImportCommitResult, ExamImportPreview, ExamManagementActor} from "../../types/Exam.ts";
import {validateExamImportFile} from "../../utils/ExamImportFile.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import styles from "./ExamImportCenter.module.css";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges.ts";

interface ExamImportCenterProps {
    actor: ExamManagementActor;
    token: string;
}

const schemaFields = [
    ["title", "Required quiz title (up to 255 characters)"],
    ["category", "Required existing category name"],
    ["feedbackMode", "after_submission, after_each_question, or none"],
    ["timeLimitSeconds", "Whole seconds from 0 to 86,400"],
    ["tags", "Optional existing tag names"],
    ["questions", "One to 250 questions, each with two or more options and exactly one correct answer"],
];

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const ExamImportCenter = ({actor, token}: ExamImportCenterProps) => {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ExamImportPreview | null>(null);
    const [result, setResult] = useState<ExamImportCommitResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const isDirty = file !== null && result?.valid !== true;
    const {disarm} = useExamUnsavedChanges({isDirty});

    if (!actor.capabilities.includes("import-exams")) return null;

    const selectFile = (nextFile: File | null) => {
        setFile(null);
        setPreview(null);
        setResult(null);
        setConfirmed(false);
        setError(nextFile ? validateExamImportFile(nextFile) ?? null : null);
        if (nextFile && !validateExamImportFile(nextFile)) setFile(nextFile);
    };

    const previewFile = async () => {
        if (!file) {
            setError("Select a JSON or CSV file before previewing.");
            return;
        }
        setIsPreviewing(true);
        setError(null);
        setPreview(null);
        setResult(null);
        setConfirmed(false);
        try {
            setPreview(await ExamsApiUtils.previewImport(file, token));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsPreviewing(false);
        }
    };

    const commit = async () => {
        if (!preview?.valid || !preview.normalizedImport || !preview.idempotencyKey || !confirmed) return;
        setIsCommitting(true);
        setError(null);
        try {
            const committed = await ExamsApiUtils.commitImport(preview.normalizedImport, preview.idempotencyKey, token);
            setResult(committed);
            if (!committed.valid) {
                setPreview(committed);
                return;
            }
            disarm();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsCommitting(false);
        }
    };

    const downloadTemplate = async (format: "json" | "csv") => {
        setError(null);
        try {
            downloadBlob(await ExamsApiUtils.getImportTemplate(format, token), format === "json" ? "atcmh-quiz-import-schema.json" : "atcmh-quiz-import-template.csv");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };

    return (
        <section className={styles.importCenter} aria-labelledby="import-heading">
            <div className={styles.heading}>
                <div><p className={styles.eyebrow}>Validated import</p><h2 id="import-heading">Import quizzes</h2></div>
                <div className={styles.templates}>
                    <button type="button" onClick={() => void downloadTemplate("json")}>Download JSON schema</button>
                    <button type="button" onClick={() => void downloadTemplate("csv")}>Download CSV template</button>
                </div>
            </div>
            <p className={styles.description}>Uploads are previewed and validated first. Nothing is written until you explicitly confirm a valid preview.</p>
            <details className={styles.schema}>
                <summary>Import schema</summary>
                <dl>{schemaFields.map(([name, description]) => <div key={name}><dt>{name}</dt><dd>{description}</dd></div>)}</dl>
            </details>
            <div className={styles.upload}>
                <label htmlFor="exam-import-file">JSON or CSV file, 1 MB maximum</label>
                <input id="exam-import-file" type="file" accept="application/json,text/csv,application/csv,.json,.csv" onChange={event => selectFile(event.target.files?.[0] ?? null)}/>
                {file ? <p className={styles.selectedFile}>{file.name} ({Math.ceil(file.size / 1024)} KB)</p> : null}
                <button type="button" onClick={() => void previewFile()} disabled={!file || isPreviewing}>{isPreviewing ? "Previewing…" : "Validate preview"}</button>
            </div>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {preview && !preview.valid ? <div className={styles.validationErrors} role="alert"><h3>Fix these items before importing</h3><ul>{preview.errors.map(issue => <li key={`${issue.path}:${issue.message}`}><code>{issue.path}</code>: {issue.message}</li>)}</ul></div> : null}
            {preview?.valid && preview.normalizedImport && preview.idempotencyKey ? <div className={styles.preview}>
                <h3>Preview validated</h3>
                <p>The server has reserved this preview temporarily. Confirm to create the quiz; it cannot be replayed after a successful import.</p>
                <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> I have reviewed this import and want to create it.</label>
                <button type="button" onClick={() => void commit()} disabled={!confirmed || isCommitting}>{isCommitting ? "Importing…" : "Confirm and import"}</button>
            </div> : null}
            {result?.valid ? <p className={styles.success} role="status">Import complete{result.result?.quizId ? ` (quiz ${result.result.quizId})` : ""}.</p> : null}
        </section>
    );
};

export default ExamImportCenter;
