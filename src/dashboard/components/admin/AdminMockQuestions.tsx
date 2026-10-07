import {useEffect, useId, useRef, useState} from "react";
import {ArrowDown, ArrowUp, CaretDown, CaretRight, CheckCircle, FileText, PencilSimple, Plus, Shuffle, Trash, WarningCircle, X, Paperclip} from "@phosphor-icons/react";
import type {AdminUser} from "../../types/AdminUser";
import type {MockQuestionDraft, MockQuestionSlot, MockQuestionWorkflow} from "../../types/MockQuestionTemplate";
import {ApiUtils} from "../../utils/ApiUtils";
import {NavLink, useLocation, useNavigate} from "../../next-navigation";
import {useConfirmation} from "../../../platform/confirmation/ConfirmationProvider";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges";
import {bankCountError, bankUsage, emptyMockQuestion, mockFilePayloads, questionDraft, questionError, setupErrors} from "./MockQuestionWorkflowModel";
import AdminErrorScreen from "./AdminErrorScreen";
import AdminLoadingScreen from "./AdminLoadingScreen";
import AdminLoginScreen from "./AdminLoginScreen";
import styles from "./AdminMockQuestions.module.css";

interface Props {loaded: boolean; loggedIn: boolean; error: string | undefined; adminUser: AdminUser | undefined; token: string | null;}
type DraftSlot = MockQuestionSlot & {clientId: string};
type BankDraft = {id: number | null; name: string; questions: MockQuestionDraft[]};
const serializeSequence = (slots: MockQuestionSlot[]): MockQuestionSlot[] => slots.map(slot => slot.kind === "BANK"
    ? {kind: "BANK", bankId: slot.bankId} : {kind: "MANUAL", question: questionDraft(slot.question)});
const draftSequence = (slots: MockQuestionSlot[]): DraftSlot[] => serializeSequence(slots).map(slot => ({...slot, clientId: crypto.randomUUID()}));
const failure = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const body = message.indexOf("{");
    if (body >= 0) {
        try { const error = JSON.parse(message.slice(body)).error; if (typeof error === "string") return error; } catch { /* Keep the original error when no JSON detail exists. */ }
    }
    return message;
};

export default function AdminMockQuestions({loaded, loggedIn, error, adminUser, token}: Props) {
    const [data, setData] = useState<MockQuestionWorkflow>();
    const [sequence, setSequence] = useState<DraftSlot[]>([]);
    const [bank, setBank] = useState<BankDraft | null>(null);
    const [expandedBank, setExpandedBank] = useState<number | "new" | null>(null);
    const [expandedQuestion, setExpandedQuestion] = useState(0);
    const [manualEditor, setManualEditor] = useState<string | null>(null);
    const [selectedBank, setSelectedBank] = useState<number | null>(null);
    const [count, setCount] = useState(1);
    const [saving, setBusy] = useState(false);
    const [readingFiles, setReadingFiles] = useState(false);
    const busy = saving || readingFiles;
    const [actionError, setActionError] = useState<string>();
    const [notice, setNotice] = useState<string>();
    const [reloadKey, setReloadKey] = useState(0);
    const navigate = useNavigate();
    const confirm = useConfirmation();
    const banksTab = useLocation().pathname.endsWith("/banks");
    const setupDirty = !!data && JSON.stringify(serializeSequence(sequence)) !== JSON.stringify(serializeSequence(data.sequence));
    const originalBank = data?.banks.find(item => item.id === bank?.id);
    const bankDirty = !!bank && (bank.id == null || JSON.stringify(bank) !== JSON.stringify({id: originalBank?.id, name: originalBank?.name,
        questions: originalBank?.questions.map(questionDraft)}));
    const unsaved = useExamUnsavedChanges({isDirty: setupDirty || bankDirty || readingFiles});

    useEffect(() => {
        if (!loaded || !loggedIn || !adminUser?.canManageMockQuestions || !token) return;
        let current = true;
        void ApiUtils.getMockQuestionWorkflow(token).then(value => {
            if (!current) return;
            if (!value) throw new Error("Your session expired. Sign in again to manage mock questions.");
            setData(value); setSequence(draftSequence(value.sequence));
            setSelectedBank(value.banks[0]?.id ?? null); setBank(null); setExpandedBank(null); setActionError(undefined);
        }).catch(reason => { if (current) setActionError(failure(reason)); });
        return () => {current = false;};
    }, [loaded, loggedIn, adminUser?.canManageMockQuestions, token, reloadKey]);

    const banks = data?.banks ?? [];
    const usage = bankUsage(sequence);
    const slotErrors = setupErrors(sequence, banks);
    const valid = sequence.length > 0 && sequence.length <= 1000 && !slotErrors.some(Boolean);
    const chosenBank = banks.find(item => item.id === selectedBank);
    const remaining = chosenBank ? chosenBank.questions.length - (usage.get(chosenBank.id) ?? 0) : 0;
    const countError = chosenBank ? bankCountError(count, remaining) : undefined;
    const bankError = bank ? (!bank.name.trim() ? "Bank name is required" : bank.name.trim().length > 128 ? "Bank name must be 128 characters or fewer"
        : !bank.questions.length ? "At least 1 question required" : bank.questions.map(questionError).find(Boolean)) : undefined;

    const changePage = (to: string) => void unsaved.confirmAndRun(() => {
        if (data) setSequence(draftSequence(data.sequence));
        setBank(null); setExpandedBank(null); setNotice(undefined); navigate(to);
    });
    const updateSlotQuestion = (clientId: string, question: MockQuestionDraft) => setSequence(current => current.map(slot =>
        slot.clientId === clientId && slot.kind === "MANUAL" ? {...slot, question} : slot));
    const move = (index: number, direction: number) => setSequence(current => {
        const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next;
    });
    const addBank = () => {
        if (!chosenBank || countError || sequence.length + count > 1000) return;
        setSequence(current => [...current, ...Array.from({length: count}, () => ({kind: "BANK" as const, bankId: chosenBank.id, clientId: crypto.randomUUID()}))]);
        setNotice(undefined);
    };
    const addManual = () => {
        const clientId = crypto.randomUUID();
        setSequence(current => [...current, {kind: "MANUAL", question: emptyMockQuestion(), clientId}]);
        setManualEditor(clientId); setNotice(undefined);
    };
    const saveSetup = async () => {
        if (!data || !valid || busy) return;
        setBusy(true); setActionError(undefined); setNotice(undefined);
        try {
            const result = await ApiUtils.saveMockSetup(token, data.revision, serializeSequence(sequence));
            if (!result) throw new Error("Your session expired. Sign in again.");
            setData(result); setSequence(draftSequence(result.sequence)); setManualEditor(null); setNotice("Setup saved");
        } catch (reason) {setActionError(failure(reason));} finally {setBusy(false);}
    };
    const chooseBank = async (id: number | "new" | null) => {
        if (bankDirty && !await confirm({title: "Discard bank changes?", message: "Your unsaved question bank changes will be lost.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", tone: "danger"})) return;
        setExpandedBank(id); setExpandedQuestion(0); setNotice(undefined);
        const selected = banks.find(item => item.id === id);
        setBank(id === "new" ? {id: null, name: "", questions: [emptyMockQuestion()]} : selected ? {id: selected.id, name: selected.name, questions: selected.questions.map(questionDraft)} : null);
    };
    const saveBank = async () => {
        if (!data || !bank || bankError || busy) return;
        setBusy(true); setActionError(undefined); setNotice(undefined);
        try {
            const result = await ApiUtils.saveMockBank(token, data.revision, bank.id, bank.name, bank.questions);
            if (!result) throw new Error("Your session expired. Sign in again.");
            const saved = result.banks.find(item => bank.id == null ? !data.banks.some(old => old.id === item.id) : item.id === bank.id);
            setData(result);
            if (saved) {setExpandedBank(saved.id); setBank({id: saved.id, name: saved.name, questions: saved.questions.map(questionDraft)}); setSelectedBank(current => current ?? saved.id);}
            setNotice("Bank saved");
        } catch (reason) {setActionError(failure(reason));} finally {setBusy(false);}
    };
    const removeBank = async (id: number) => {
        if (!data || busy) return;
        if (!await confirm({title: "Remove question bank?", message: "This bank and its questions will be removed. Started mock runs keep their original snapshots.", confirmLabel: "Remove bank", cancelLabel: "Keep bank", tone: "danger"})) return;
        setBusy(true); setActionError(undefined);
        try {
            const result = await ApiUtils.deleteMockBank(token, data.revision, id);
            if (!result) throw new Error("Your session expired. Sign in again.");
            setData(result); setBank(null); setExpandedBank(null);
            if (selectedBank === id) setSelectedBank(result.banks[0]?.id ?? null);
            setNotice("Bank removed");
        } catch (reason) {setActionError(failure(reason));} finally {setBusy(false);}
    };
    const reload = () => void unsaved.confirmAndRun(() => {setData(undefined); setBank(null); setSequence([]); setReloadKey(value => value + 1);});

    if (!loaded) return <AdminLoadingScreen/>;
    if (error) return <AdminErrorScreen content={error}/>;
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!adminUser?.canManageMockQuestions) return <AdminErrorScreen header="Forbidden" content="Only Mentors, Moderators, and Super Admins can manage mock questions."/>;
    if (!data) return actionError ? <section className={styles.container} role="alert"><h1>Mock questions unavailable</h1><p>{actionError}</p><button onClick={reload}>Try again</button></section> : <AdminLoadingScreen/>;

    return <main className={styles.container} aria-busy={busy}>
        <header className={styles.pageHeader}><h1>Mock questions</h1><div className={styles.headingActions}>
            {!banksTab ? <><span className={valid && !setupDirty ? styles.ready : styles.warning} role="status" title={setupDirty ? "Save the setup to make it ready" : !sequence.length ? "Add at least one question" : slotErrors.find(Boolean)}>
                {valid && !setupDirty ? <CheckCircle weight="fill"/> : <WarningCircle weight="fill"/>}{valid && !setupDirty ? "Ready" : "Needs attention"}</span>
                <button className={styles.primary} disabled={!valid || !setupDirty || busy} onClick={() => void saveSetup()}>{busy ? "Saving…" : "Save setup"}</button></>
                : <button className={styles.primary} disabled={busy} onClick={() => void chooseBank("new")}><Plus/>New bank</button>}
        </div></header>
        <nav className={styles.tabs} aria-label="Mock questions sections">
            <NavLink end to="/dashboard/mock-questions" className={({isActive}) => isActive ? styles.activeTab : undefined} onClick={event => {event.preventDefault(); if (banksTab) changePage("/dashboard/mock-questions");}}>Mock setup</NavLink>
            <NavLink to="/dashboard/mock-questions/banks" className={({isActive}) => isActive ? styles.activeTab : undefined} onClick={event => {event.preventDefault(); if (!banksTab) changePage("/dashboard/mock-questions/banks");}}>Question banks</NavLink>
        </nav>
        {actionError ? <div className={styles.actionError} role="alert"><span>{actionError}</span><button onClick={reload} disabled={busy}>Reload</button><button aria-label="Dismiss error" onClick={() => setActionError(undefined)}><X/></button></div> : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {!banksTab ? <>
            <section className={styles.sectionHeading}><h2>Configured sequence</h2><p>Questions are drawn when the mock starts. Each bank question is used once per run.</p></section>
            {usage.size ? <p className={styles.usage}>{[...usage].map(([id, used]) => `${banks.find(item => item.id === id)?.name ?? "Unavailable bank"} ${used} / ${banks.find(item => item.id === id)?.questions.length ?? 0}`).join(" · ")}</p> : null}
            {sequence.length ? <div className={styles.sequenceList}><div className={styles.tableHead}><span>Order</span><span>Question source</span><span>Selection</span><span>Actions</span></div>
                {sequence.map((slot, index) => {
                    const sourceBank = slot.kind === "BANK" ? banks.find(item => item.id === slot.bankId) : undefined;
                    const ordinal = slot.kind === "BANK" ? sequence.slice(0, index + 1).filter(item => item.kind === "BANK" && item.bankId === slot.bankId).length : 0;
                    const open = manualEditor === slot.clientId;
                    return <section className={styles.sequenceItem} key={slot.clientId} aria-label={`Question ${index + 1}`}>
                        <div className={styles.sequenceRow}>
                            <span className={styles.order}>{index + 1}</span>
                            <div className={styles.source}>{slot.kind === "BANK" ? <Shuffle/> : <FileText/>}<strong>{slot.kind === "BANK" ? `${sourceBank?.name ?? "Unavailable bank"} #${ordinal}` : "Manual question"}</strong></div>
                            <div className={styles.selection}>{slot.kind === "BANK" ? `Random from ${sourceBank?.name ?? "unavailable"} bank` : <button className={styles.textButton} aria-expanded={open} onClick={() => setManualEditor(open ? null : slot.clientId)}><PencilSimple/>{open ? "Authored question" : slot.question.questionText || "Write a question"}</button>}</div>
                            <div className={styles.rowActions}><button aria-label={`Move question ${index + 1} up`} disabled={index === 0 || busy} onClick={() => move(index, -1)}><ArrowUp/></button><button aria-label={`Move question ${index + 1} down`} disabled={index === sequence.length - 1 || busy} onClick={() => move(index, 1)}><ArrowDown/></button><button aria-label={`Remove question ${index + 1}`} disabled={busy} onClick={() => setSequence(current => current.filter(item => item.clientId !== slot.clientId))}><Trash/></button></div>
                        </div>
                        {slotErrors[index] ? <p className={styles.inlineError} role="alert">{slotErrors[index]}</p> : null}
                        {slot.kind === "MANUAL" && open ? <div className={styles.manualEditor}><QuestionEditor question={slot.question} onChange={question => updateSlotQuestion(slot.clientId, question)} token={token} disabled={busy} onReading={setReadingFiles}/></div> : null}
                    </section>;
                })}</div> : <div className={styles.empty}><h3>Build your mock sequence</h3><p>Add questions from a bank or write a manual question to get started.</p></div>}
            <section className={styles.addSection}><h3>Add to sequence</h3><div className={styles.addControls}>
                <label><span className={styles.srOnly}>Question bank</span><select value={selectedBank ?? ""} onChange={event => {setSelectedBank(Number(event.target.value)); setCount(1);}} disabled={!banks.length || busy}><option value="" disabled>{banks.length ? "Select bank" : "No question banks yet"}</option>{banks.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label className={styles.countLabel}><span>Questions</span><input type="number" aria-describedby="bank-count-hint" min={1} max={Math.max(0, remaining)} value={Number.isNaN(count) ? "" : count} onChange={event => setCount(event.target.value === "" ? NaN : Number(event.target.value))} aria-invalid={!!countError} disabled={!chosenBank || busy}/></label>
                <span id="bank-count-hint" className={countError ? styles.inlineError : styles.hint}>{countError ?? (chosenBank ? `${remaining} remaining` : "Create a bank in Question banks")}</span>
                <button className={styles.primary} onClick={addBank} disabled={!chosenBank || !!countError || busy || sequence.length + count > 1000}>Add to sequence</button>
                <button className={styles.secondary} onClick={addManual} disabled={busy || sequence.length >= 1000}><FileText/>Add manual question</button>
            </div></section>
            <p className={styles.footnote}>Edits apply to future sends only. Started Discord runs keep their original questions, model answers and attachments.</p>
        </> : <section className={styles.bankList} aria-label="Question banks">
            {!banks.length && expandedBank !== "new" ? <div className={styles.empty}><h2>Create your first question bank</h2><p>Group questions by topic, then select how many to draw in Mock setup.</p></div> : null}
            {[...banks.map(item => ({id: item.id as number | "new", name: item.name, count: item.questions.length})), ...(expandedBank === "new" ? [{id: "new" as const, name: "New bank", count: bank?.questions.length ?? 1}] : [])].map(item => {
                const open = expandedBank === item.id && bank != null;
                const savedDraws = data.sequence.filter(slot => slot.kind === "BANK" && slot.bankId === item.id).length;
                return <section className={styles.bankGroup} key={item.id}>
                    <button className={styles.bankToggle} aria-expanded={open} disabled={busy} onClick={() => void chooseBank(open ? null : item.id)}>{open ? <CaretDown/> : <CaretRight/>}<strong>{item.name}</strong><span>· {open ? bank.questions.length : item.count} {(open ? bank.questions.length : item.count) === 1 ? "question" : "questions"}</span></button>
                    {open ? <>
                        <div className={styles.bankDetails}><label><span>Bank name</span><input required maxLength={128} value={bank.name} onChange={event => setBank({...bank, name: event.target.value})} disabled={busy}/></label>
                            <div className={styles.headingActions}>{bankError ? <span className={styles.warning}><WarningCircle/>Needs attention</span> : null}<button className={styles.primary} onClick={() => void saveBank()} disabled={!!bankError || !bankDirty || busy}>Save bank</button>
                                {bank.id != null ? <button className={styles.iconButton} aria-label={`Remove ${item.name} bank`} disabled={busy || savedDraws > 0 || (usage.get(bank.id) ?? 0) > 0} title={savedDraws > 0 ? "Remove this bank from the saved setup first" : "Remove bank"} onClick={() => void removeBank(bank.id!)}><Trash/></button> : null}</div>
                        </div>
                        {!bank.name.trim() ? <p className={styles.inlineError}>Bank name is required</p> : null}
                        {bank.questions.map((question, index) => <section className={styles.bankQuestion} data-open={expandedQuestion === index} key={question.id ?? `new-${index}`}>
                            <div className={styles.bankQuestionRow}><span>{index + 1}</span><button className={styles.questionToggle} aria-expanded={expandedQuestion === index} onClick={() => setExpandedQuestion(expandedQuestion === index ? -1 : index)} disabled={busy}>{question.questionText || "New question"}</button><button className={styles.iconButton} aria-label={`Edit bank question ${index + 1}`} onClick={() => setExpandedQuestion(index)} disabled={busy}><PencilSimple/></button><button className={styles.iconButton} aria-label={`Remove bank question ${index + 1}`} disabled={busy || bank.questions.length <= Math.max(1, savedDraws)} title={bank.questions.length <= Math.max(1, savedDraws) ? "Keep at least one question and enough for the saved setup" : "Remove question"} onClick={() => {setBank({...bank, questions: bank.questions.filter((_, position) => index !== position)}); setExpandedQuestion(-1);}}><Trash/></button></div>
                            {expandedQuestion === index ? <div className={styles.bankEditor}><QuestionEditor question={question} token={token} disabled={busy} onReading={setReadingFiles} onChange={updated => setBank({...bank, questions: bank.questions.map((old, position) => index === position ? updated : old)})}/></div> : questionError(question) ? <p className={styles.inlineError}>{questionError(question)}</p> : null}
                        </section>)}
                        <footer className={styles.bankFooter}><button className={styles.secondary} disabled={busy || bank.questions.length >= 1000} onClick={() => {setExpandedQuestion(bank.questions.length); setBank({...bank, questions: [...bank.questions, emptyMockQuestion()]});}}><Plus/>Add question</button><small>At least 1 question required{savedDraws ? ` · ${savedDraws} used in the saved setup` : ""}</small></footer>
                    </> : null}
                </section>;
            })}
        </section>}
    </main>;
}

function QuestionEditor({question, onChange, token, disabled, onReading}: {question: MockQuestionDraft; onChange: (question: MockQuestionDraft) => void; token: string | null; disabled: boolean; onReading: (reading: boolean) => void}) {
    const id = useId();
    const mounted = useRef(true);
    useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
    const [fileError, setFileError] = useState<string>();
    const [reading, setReading] = useState(false);
    const error = questionError(question);
    useEffect(() => {setFileError(undefined);}, [question.id]);
    const download = async (attachmentId: number, filename: string) => {
        if (!question.id) return;
        try {
            const blob = await ApiUtils.getMockQuestionAttachment(token, question.id, attachmentId);
            if (!blob) throw new Error("Attachment is unavailable");
            const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (reason) {setFileError(failure(reason));}
    };
    return <fieldset className={styles.questionFields} disabled={disabled || reading}>
        <label><span>Question text <span aria-hidden="true">*</span></span><textarea required maxLength={2000} rows={2} value={question.questionText} aria-invalid={!!error && !question.questionText.trim()} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange({...question, questionText: event.target.value})}/></label>
        {error ? <p id={`${id}-error`} className={styles.inlineError}>{error}</p> : null}
        <label><span>Model answer (optional)</span><textarea maxLength={8000} rows={2} value={question.modelAnswer ?? ""} onChange={event => onChange({...question, modelAnswer: event.target.value || null})}/></label>
        <details className={styles.answerHelp}><summary>How model answers are used</summary><p>When blank, evaluation uses the official Infinite Flight ATC Manual. If the source or AI is unavailable, the result requires mentor review.</p></details>
        <section className={styles.attachments}><div className={styles.attachmentHeading}><div><h3>Discord attachments</h3><small>Up to 3 files · 8 MB each · 10 MB total</small></div><label className={styles.fileButton}><Paperclip/>{reading ? "Reading…" : "Add files"}<input type="file" multiple disabled={disabled || reading || question.attachments.length >= 3} onChange={event => {
            const files = [...(event.target.files ?? [])]; event.target.value = ""; if (!files.length) return;
            setReading(true); onReading(true); setFileError(undefined);
            void mockFilePayloads(files, question.attachments).then(additions => {if (mounted.current) onChange({...question, attachments: [...question.attachments, ...additions]});}).catch(reason => {if (mounted.current) setFileError(failure(reason));}).finally(() => {if (mounted.current) setReading(false); onReading(false);});
        }}/></label></div>
            {question.attachments.map((attachment, index) => <div className={styles.attachmentRow} key={attachment.id ?? `${attachment.filename}-${index}`}><Paperclip/>{attachment.id ? <button className={styles.textButton} onClick={() => void download(attachment.id!, attachment.filename)}>{attachment.filename}</button> : <span>{attachment.filename}</span>}<button className={styles.iconButton} aria-label={`Remove ${attachment.filename}`} onClick={() => onChange({...question, attachments: question.attachments.filter((_, position) => position !== index)})}><X/></button></div>)}
            {fileError ? <p className={styles.inlineError} role="alert">{fileError}</p> : null}
        </section>
    </fieldset>;
}
