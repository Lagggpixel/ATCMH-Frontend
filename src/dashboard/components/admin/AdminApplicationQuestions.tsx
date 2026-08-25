import {type FormEvent, useEffect, useMemo, useState} from "react";
import type {AdminUser} from "../../types/AdminUser.ts";
import type {ApplicationQuestion, ApplicationQuestionUpdate} from "../../types/ApplicationQuestion.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminToast from "./AdminToast.tsx";
import styles from "./AdminApplicationQuestions.module.css";

interface Props {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    adminUser: AdminUser | undefined;
    token: string | null;
}

const editFields = (question: ApplicationQuestion): ApplicationQuestionUpdate => ({
    prompt: question.prompt,
    helpText: question.helpText,
    sortOrder: question.sortOrder,
    active: question.active,
});

const inputTypeLabel: Record<ApplicationQuestion["inputType"], string> = {
    YES_NO: "Yes or no",
    TEXT: "Text",
    POSITIVE_INTEGER: "Positive number",
    WEEKLY_AVAILABILITY: "Weekly availability",
};

function dependencyLabel(question: ApplicationQuestion) {
    if (!question.dependsOnKey) return "Always shown";
    return `Shown when ${question.dependsOnKey} is ${question.dependsOnValue ?? "set"}`;
}

export default function AdminApplicationQuestions({loaded, loggedIn, error, adminUser, token}: Props) {
    const [questions, setQuestions] = useState<ApplicationQuestion[]>();
    const [selectedKey, setSelectedKey] = useState<string>();
    const [form, setForm] = useState<ApplicationQuestionUpdate>();
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string>();
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!loaded || !loggedIn || !adminUser?.canManageApplicationQuestions || !token) return;
        let current = true;
        void ApiUtils.getManagedApplicationQuestions(token)
            .then(value => {
                if (!current) return;
                setQuestions(value);
                const first = [...value].sort((a, b) => a.sortOrder - b.sortOrder)[0];
                if (first) {
                    setSelectedKey(first.key);
                    setForm(editFields(first));
                }
            })
            .catch(reason => { if (current) setActionError(reason instanceof Error ? reason.message : String(reason)); });
        return () => { current = false; };
    }, [adminUser?.canManageApplicationQuestions, loaded, loggedIn, token]);

    const ordered = useMemo(
        () => [...(questions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)),
        [questions],
    );
    const selected = questions?.find(question => question.key === selectedKey);
    const select = (question: ApplicationQuestion) => {
        setSelectedKey(question.key);
        setForm(editFields(question));
        setActionError(undefined);
        setSaved(false);
    };

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (!token || !selected || !form) return;
        setBusy(true);
        setSaved(false);
        setActionError(undefined);
        try {
            const update = {...form, prompt: form.prompt.trim(), helpText: form.helpText?.trim() || null};
            const next = await ApiUtils.updateApplicationQuestion(token, selected.key, update);
            setQuestions(current => (current ?? []).map(question => question.key === next.key ? next : question));
            setForm(editFields(next));
            setSaved(true);
        } catch (reason) {
            setActionError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };

    if (!loaded) return <AdminLoadingScreen/>;
    if (error) return <AdminErrorScreen content={error}/>;
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!adminUser?.canManageApplicationQuestions) return <AdminErrorScreen header="Forbidden" content="Only Moderators and Super Admins can manage application questions."/>;
    if (!questions) return <AdminLoadingScreen/>;

    return <div className={styles.container}>
        <AdminToast message={actionError} onDismiss={() => setActionError(undefined)}/>
        <header className={styles.pageHeader}>
            <div><h1>Application questions</h1><p>This ordered set is shared by website and Discord applications.</p></div>
            <span>{ordered.filter(question => question.active).length} active</span>
        </header>
        <div className={styles.layout}>
            <aside className={styles.listPanel} aria-label="Application questions">
                {ordered.map((question, index) => <button key={question.key} type="button"
                    className={selectedKey === question.key ? styles.activeItem : styles.listItem}
                    onClick={() => select(question)}>
                    <span className={styles.position}>{index + 1}</span>
                    <span><strong>{question.prompt}</strong><small>{inputTypeLabel[question.inputType]} · {question.active ? "Active" : "Inactive"}</small></span>
                </button>)}
            </aside>
            <section className={styles.editorPanel}>
                {selected && form ? <form className={styles.form} onSubmit={save}>
                    <div className={styles.editorHeader}><div><p className={styles.key}>Question key</p><h2>{selected.key}</h2></div><span className={styles.type}>{inputTypeLabel[selected.inputType]}</span></div>
                    <dl className={styles.rules}><div><dt>Display rule</dt><dd>{dependencyLabel(selected)}</dd></div><div><dt>Answer format</dt><dd>{inputTypeLabel[selected.inputType]}</dd></div></dl>
                    <label><span>Question</span><textarea required maxLength={2000} rows={5} value={form.prompt}
                        onChange={event => setForm(current => current ? {...current, prompt: event.target.value} : current)}/></label>
                    <label><span>Help text (optional)</span><textarea maxLength={4000} rows={4} value={form.helpText ?? ""}
                        onChange={event => setForm(current => current ? {...current, helpText: event.target.value || null} : current)}/>
                        <small>Shown beneath the question on the website and included with the Discord prompt.</small></label>
                    <div className={styles.formRow}>
                        <label><span>Order</span><input required type="number" min={1} max={10000} value={form.sortOrder}
                            onChange={event => setForm(current => current ? {...current, sortOrder: Number(event.target.value)} : current)}/></label>
                        <label className={styles.toggle}><input type="checkbox" checked={form.active}
                            onChange={event => setForm(current => current ? {...current, active: event.target.checked} : current)}/><span>Ask this question</span></label>
                    </div>
                    <div className={styles.actions}><span role="status">{saved ? "Saved for future applications." : ""}</span><button type="submit" disabled={busy || !form.prompt.trim()}>{busy ? "Saving…" : "Save question"}</button></div>
                </form> : <p className={styles.empty}>No application questions are configured.</p>}
            </section>
        </div>
    </div>;
}
