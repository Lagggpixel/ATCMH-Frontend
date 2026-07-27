import {type ChangeEvent, type FormEvent, useEffect, useMemo, useState} from "react";
import type {AdminUser} from "../../types/AdminUser.ts";
import type {
    MockQuestionAttachmentPayload,
    MockQuestionTemplate,
    MockQuestionTemplatePayload,
} from "../../types/MockQuestionTemplate.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminToast from "./AdminToast.tsx";
import {mockQuestionReadiness} from "./MockQuestionReadiness.ts";
import styles from "./AdminMockQuestions.module.css";

interface Props {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    adminUser: AdminUser | undefined;
    token: string | null;
}

const emptyForm = (nextOrder: number): MockQuestionTemplatePayload => ({
    questionText: "",
    sortOrder: nextOrder,
    modelAnswer: null,
    attachments: [],
});

export default function AdminMockQuestions({loaded, loggedIn, error, adminUser, token}: Props) {
    const [templates, setTemplates] = useState<MockQuestionTemplate[]>();
    const [selectedId, setSelectedId] = useState<number | "new">("new");
    const [form, setForm] = useState<MockQuestionTemplatePayload>(emptyForm(1));
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string>();

    useEffect(() => {
        if (!loaded || !loggedIn || !adminUser?.canManageMockQuestions || !token) return;
        let current = true;
        void ApiUtils.getMockQuestionTemplates(token)
            .then(value => { if (current) setTemplates(value ?? []); })
            .catch(reason => { if (current) setActionError(reason instanceof Error ? reason.message : String(reason)); });
        return () => { current = false; };
    }, [adminUser?.canManageMockQuestions, loaded, loggedIn, token]);

    const ordered = useMemo(() => [...(templates ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id), [templates]);
    const readiness = mockQuestionReadiness(ordered.length);
    const select = (template: MockQuestionTemplate) => {
        setSelectedId(template.id);
        setForm({
            questionText: template.questionText,
            sortOrder: template.sortOrder,
            modelAnswer: template.modelAnswer,
            attachments: template.attachments.map(attachment => ({
                id: attachment.id,
                filename: attachment.filename,
                contentType: attachment.contentType,
            })),
        });
    };
    const createNew = () => {
        setSelectedId("new");
        setForm(emptyForm(Math.max(0, ...ordered.map(template => template.sortOrder)) + 1));
    };

    const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        if (form.attachments.length + files.length > 3) {
            setActionError("Each question can have at most three attachments.");
            return;
        }
        try {
            const additions = await Promise.all(files.map(fileToPayload));
            setForm(current => ({...current, attachments: [...current.attachments, ...additions]}));
        } catch (reason) {
            setActionError(reason instanceof Error ? reason.message : String(reason));
        }
    };

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (!token) return;
        setBusy(true);
        setActionError(undefined);
        try {
            const payload = {...form, modelAnswer: form.modelAnswer?.trim() || null};
            const saved = selectedId === "new"
                ? await ApiUtils.createMockQuestionTemplate(token, payload)
                : await ApiUtils.updateMockQuestionTemplate(token, selectedId, payload);
            if (!saved) throw new Error("You are not authorized to manage mock questions.");
            setTemplates(current => [...(current ?? []).filter(item => item.id !== saved.id), saved]);
            select(saved);
        } catch (reason) {
            setActionError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (selectedId === "new" || !token || !window.confirm("Remove this mock question template? Existing runs keep their snapshot.")) return;
        setBusy(true);
        try {
            if (!await ApiUtils.deleteMockQuestionTemplate(token, selectedId)) throw new Error("You are not authorized to manage mock questions.");
            setTemplates(current => (current ?? []).filter(item => item.id !== selectedId));
            createNew();
        } catch (reason) {
            setActionError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };

    const download = async (attachment: MockQuestionAttachmentPayload) => {
        if (selectedId === "new" || !attachment.id || !token) return;
        try {
            const blob = await ApiUtils.getMockQuestionAttachment(token, selectedId, attachment.id);
            if (!blob) throw new Error("Attachment is unavailable.");
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = attachment.filename;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (reason) {
            setActionError(reason instanceof Error ? reason.message : String(reason));
        }
    };

    if (!loaded) return <AdminLoadingScreen/>;
    if (error) return <AdminErrorScreen content={error}/>;
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!adminUser?.canManageMockQuestions) return <AdminErrorScreen header="Forbidden" content="Only Mentors, Moderators, and Super Admins can manage mock questions."/>;
    if (!templates) return <AdminLoadingScreen/>;

    return <div className={styles.container}>
        <AdminToast message={actionError} onDismiss={() => setActionError(undefined)}/>
        <header className={styles.pageHeader}>
            <div><h1>Mock questions</h1><p>Discord sends every configured question in this order.</p></div>
            <button type="button" onClick={createNew}>New question</button>
        </header>
        <div className={readiness.ready ? styles.ready : styles.warning} role="status">
            {readiness.message}
        </div>
        <div className={styles.layout}>
            <aside className={styles.listPanel} aria-label="Mock question templates">
                {ordered.map((template, index) => <button key={template.id} type="button"
                    className={selectedId === template.id ? styles.activeItem : styles.listItem}
                    onClick={() => select(template)}>
                    <strong>{index + 1}. {template.questionText}</strong>
                    <span>Order {template.sortOrder} · {template.attachments.length} attachment{template.attachments.length === 1 ? "" : "s"}</span>
                </button>)}
                {ordered.length === 0 ? <p className={styles.empty}>No mock questions yet.</p> : null}
            </aside>
            <section className={styles.editorPanel}>
                <form onSubmit={save} className={styles.form}>
                    <div className={styles.editorHeader}><h2>{selectedId === "new" ? "New question" : `Edit question #${selectedId}`}</h2></div>
                    <label><span>Question text</span><textarea required maxLength={2000} rows={7} value={form.questionText}
                        onChange={event => setForm(current => ({...current, questionText: event.target.value}))}/></label>
                    <label className={styles.orderField}><span>Order</span><input required type="number" min={1} max={1000} value={form.sortOrder}
                        onChange={event => setForm(current => ({...current, sortOrder: Number(event.target.value)}))}/></label>
                    <label><span>Example / model answer (optional)</span><textarea maxLength={8000} rows={8} value={form.modelAnswer ?? ""}
                        onChange={event => setForm(current => ({...current, modelAnswer: event.target.value || null}))}/>
                        <small>When blank, evaluation retrieves relevant material from the official Infinite Flight ATC Manual. If that source or AI is unavailable, the result explicitly requires mentor review.</small>
                    </label>
                    <section className={styles.attachments}>
                        <div className={styles.attachmentHeader}><div><h3>Discord attachments</h3><p>Images and files are stored by ATCMH and re-uploaded by the bot.</p></div>
                            <label className={styles.fileButton}>Add files<input type="file" multiple onChange={event => void addFiles(event)} disabled={form.attachments.length >= 3}/></label></div>
                        {form.attachments.map((attachment, index) => <div className={styles.attachmentRow} key={`${attachment.id ?? "new"}-${index}`}>
                            <div><strong>{attachment.filename}</strong><span>{attachment.contentType}</span></div>
                            <div className={styles.rowActions}>{attachment.id ? <button type="button" onClick={() => void download(attachment)}>Download</button> : null}
                                <button type="button" onClick={() => setForm(current => ({...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index)}))}>Remove</button></div>
                        </div>)}
                    </section>
                    <p className={styles.snapshotNote}>Edits apply to future sends only. A started Discord run keeps its original question and model-answer snapshot for later evaluation.</p>
                    <div className={styles.actions}><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save question"}</button>
                        {selectedId !== "new" ? <button type="button" className={styles.deleteButton} disabled={busy} onClick={() => void remove()}>Remove</button> : null}</div>
                </form>
            </section>
        </div>
    </div>;
}

function fileToPayload(file: File): Promise<MockQuestionAttachmentPayload> {
    if (file.size === 0 || file.size > 8 * 1024 * 1024) return Promise.reject(new Error("Each attachment must be between 1 byte and 8 MB."));
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.onload = () => {
            const value = String(reader.result ?? "");
            const comma = value.indexOf(",");
            if (comma < 0) return reject(new Error(`Could not encode ${file.name}.`));
            resolve({filename: file.name, contentType: file.type || "application/octet-stream", dataBase64: value.slice(comma + 1)});
        };
        reader.readAsDataURL(file);
    });
}
