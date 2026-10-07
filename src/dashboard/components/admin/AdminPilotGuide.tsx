"use client";

import {useEffect, useState, type FormEvent} from "react";
import {FileText, Plus, GearSix, Eye, ArrowUp, ArrowDown, Trash, Check, ArrowLeft} from "@phosphor-icons/react";
import type {AdminUser} from "../../types/AdminUser";
import type {PilotGuide} from "@/src/learning/pilot-guide";
import {canAccessPilotGuide} from "@/src/platform/auth/admin-preview-access";
import {PilotGuideApiUtils, PilotGuideRequestError} from "../../utils/PilotGuideApiUtils";
import {pilotGuideContentSnapshot} from "@/src/lib/pilot-guide-contract";
import {sanitizePilotGuideHtml} from "@/src/learning/pilot-guide-html";
import PilotGuideReader from "@/src/learning/PilotGuideReader";
import {useConfirmation} from "@/src/platform/confirmation/ConfirmationProvider";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges";
import PilotGuideVisualEditor, {GuideDialog} from "./PilotGuideVisualEditor";
import AdminLoadingScreen from "./AdminLoadingScreen";
import AdminLoginScreen from "./AdminLoginScreen";
import styles from "./AdminPilotGuide.module.css";

export default function AdminPilotGuide({loaded, loggedIn, adminUser, token}: {loaded: boolean; loggedIn: boolean; adminUser: AdminUser | undefined; token: string | null}) {
    const [guide, setGuide] = useState<PilotGuide>();
    const [baseline, setBaseline] = useState<string>();
    const [selectedId, setSelectedId] = useState<string>();
    const [mode, setMode] = useState<"visual" | "html">("visual");
    const [dialog, setDialog] = useState<"chapter" | "settings" | null>(null);
    const [preview, setPreview] = useState(false);
    const [saving, setBusy] = useState(false);
    const [loadingGuide, setLoadingGuide] = useState(true);
    const busy = saving || loadingGuide;
    const [error, setError] = useState<string>();
    const [conflict, setConflict] = useState(false);
    const [saved, setSaved] = useState(false);
    const [reload, setReload] = useState(0);
    const canEdit = canAccessPilotGuide(adminUser);
    const dirty = !!guide && baseline !== pilotGuideContentSnapshot(guide);
    const confirm = useConfirmation();
    useExamUnsavedChanges({isDirty: dirty});

    useEffect(() => {
        if (!loaded || !loggedIn || !canEdit || !token) return;
        const controller = new AbortController();
        setLoadingGuide(true);
        setError(undefined);
        void PilotGuideApiUtils.getGuide(token, controller.signal).then(value => {
            if (controller.signal.aborted) return;
            setGuide(value); setBaseline(pilotGuideContentSnapshot(value)); setSelectedId(current => value.chapters.some(chapter => chapter.id === current) ? current : value.chapters[0].id); setConflict(false);
        }).catch(reason => {if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load the pilot guide.");}).finally(() => {if (!controller.signal.aborted) setLoadingGuide(false);});
        return () => controller.abort();
    }, [loaded, loggedIn, canEdit, token, reload]);

    const selected = guide?.chapters.find(chapter => chapter.id === selectedId);
    const selectedIndex = guide?.chapters.findIndex(chapter => chapter.id === selectedId) ?? -1;
    const editChapter = (value: {title?: string; html?: string}) => {setSaved(false); setGuide(current => current ? {...current, chapters: current.chapters.map(chapter => chapter.id === selectedId ? {...chapter, ...value} : chapter)} : current);};
    const save = async () => {
        if (!guide || !token || busy) return;
        if (!guide.title.trim() || guide.chapters.some(chapter => !chapter.title.trim())) {setError("Give the guide and every chapter a title before saving."); return;}
        setBusy(true); setError(undefined); setSaved(false);
        try {
            const cleaned = {...guide, title: guide.title.trim(), chapters: guide.chapters.map(chapter => ({...chapter, title: chapter.title.trim(), html: sanitizePilotGuideHtml(chapter.html)}))};
            const next = await PilotGuideApiUtils.saveGuide(cleaned, token);
            setGuide(next); setBaseline(pilotGuideContentSnapshot(next)); setSaved(true); setConflict(false);
        } catch (reason) {setError(reason instanceof Error ? reason.message : "Could not save the guide. Your edits are still here."); setConflict(reason instanceof PilotGuideRequestError && reason.status === 409);}
        finally {setBusy(false);}
    };
    const reloadLatest = async () => {
        if (dirty && !await confirm({title: "Reload the latest guide?", message: "Your unsaved changes will be discarded. You can keep editing to copy anything you want to preserve first.", confirmLabel: "Discard and reload", cancelLabel: "Keep editing", tone: "danger"})) return;
        setLoadingGuide(true); setReload(value => value + 1); setSaved(false);
    };
    const updateSettings = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        setGuide(current => current ? {...current, title: String(data.get("title")).trim(), introduction: String(data.get("introduction")).trim(), lastUpdated: String(data.get("lastUpdated"))} : current); setDialog(null); setSaved(false);
    };
    const addChapter = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title") ?? "").trim(); if (!title) return;
        const id = `chapter-${crypto.randomUUID()}`;
        setGuide(current => current ? {...current, chapters: [...current.chapters, {id, title, html: "<p></p>"}]} : current); setSelectedId(id); setDialog(null); setSaved(false); setMode("visual");
    };
    const move = (offset: number) => {setGuide(current => {if (!current || selectedIndex + offset < 0 || selectedIndex + offset >= current.chapters.length) return current; const chapters = [...current.chapters]; [chapters[selectedIndex], chapters[selectedIndex + offset]] = [chapters[selectedIndex + offset], chapters[selectedIndex]]; return {...current, chapters};}); setSaved(false);};
    const remove = async () => {
        if (!guide || !selected || guide.chapters.length === 1) return;
        if (!await confirm({title: `Remove “${selected.title}”?`, message: "This chapter will be removed when you save the guide.", confirmLabel: "Remove chapter", cancelLabel: "Keep chapter", tone: "danger"})) return;
        setSelectedId(guide.chapters[selectedIndex === 0 ? 1 : selectedIndex - 1].id); setGuide({...guide, chapters: guide.chapters.filter(chapter => chapter.id !== selected.id)}); setSaved(false);
    };

    if (!loaded) return <AdminLoadingScreen/>;
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!canEdit) return <div className={styles.empty}><FileText size={36}/><h2>Pilot Guide administration</h2><p>You need moderator or administrator access to edit the pilot guide.</p></div>;
    if (!guide || !selected) return error ? <div className={styles.empty}><h2>The pilot guide could not be loaded</h2><p role="alert">{error}</p><button className={styles.primary} onClick={() => setReload(value => value + 1)}>Try again</button></div> : <AdminLoadingScreen/>;
    return <section className={styles.page} aria-label="Pilot Guide administration">
        <div className={styles.breadcrumb}>Administration <span aria-hidden="true">›</span> Pilot Guide</div>
        <div className={styles.heading}>
            <div><h2>Pilot Guide</h2><p>Edit the guide pilots read before training sessions.</p></div>
            <div className={styles.actions}><span className={styles.saveStatus} role="status">{loadingGuide ? "Loading guide…" : saving ? "Saving…" : dirty ? "Unsaved changes" : saved ? <><Check size={17}/> Changes saved</> : "All changes saved"}</span><button className={styles.secondary} onClick={() => setPreview(value => !value)} disabled={busy}>{preview ? <ArrowLeft size={18}/> : <Eye size={18}/>} {preview ? "Back to editing" : "Preview"}</button><button className={styles.primary} onClick={save} disabled={!dirty || busy || conflict}>{saving ? "Saving…" : "Save changes"}</button></div>
        </div>
        {error && <div className={styles.error} role="alert"><p>{error}</p>{conflict && <button className={styles.secondary} onClick={reloadLatest} disabled={busy}>Reload latest guide</button>}</div>}
        {preview ? <div className={styles.preview}><p className={styles.previewNote}>Preview · {dirty ? "Includes your unsaved changes" : "Current saved guide"}</p><PilotGuideReader guide={guide} initialChapterId={selected.id}/></div> : <div className={styles.workspace}>
            <aside className={styles.chapters} aria-label="Guide chapters">
                <h3>Chapters</h3>
                <div className={styles.chapterList}>{guide.chapters.map(chapter => <button key={chapter.id} className={styles.chapter} aria-current={chapter.id === selectedId ? "true" : undefined} onClick={() => {setSelectedId(chapter.id); setMode("visual");}} disabled={busy}><FileText size={20}/><span>{chapter.title || "Untitled chapter"}</span></button>)}</div>
                <div className={styles.chapterActions}><button onClick={() => setDialog("chapter")} disabled={busy || guide.chapters.length >= 50}><Plus size={19}/> Add chapter</button><button onClick={() => setDialog("settings")} disabled={busy}><GearSix size={19}/> Guide settings</button></div>
                <div className={styles.organize}><span>Selected chapter</span><div><button aria-label="Move chapter up" title="Move chapter up" disabled={busy || selectedIndex === 0} onClick={() => move(-1)}><ArrowUp size={18}/></button><button aria-label="Move chapter down" title="Move chapter down" disabled={busy || selectedIndex === guide.chapters.length - 1} onClick={() => move(1)}><ArrowDown size={18}/></button><button aria-label="Remove chapter" title="Remove chapter" disabled={busy || guide.chapters.length === 1} onClick={remove}><Trash size={18}/></button></div></div>
            </aside>
            <section className={styles.editorPanel} aria-label="Chapter editor">
                <div className={styles.editorTop}><span>Edit chapter</span><div className={styles.mode} role="group" aria-label="Editor mode"><button aria-pressed={mode === "visual"} disabled={busy} onClick={() => setMode("visual")}>Visual</button><button aria-pressed={mode === "html"} disabled={busy} onClick={() => setMode("html")}>HTML</button></div></div>
                <label className={styles.chapterTitle}><span className={styles.srOnly}>Chapter title</span><input value={selected.title} onChange={event => editChapter({title: event.target.value})} placeholder="Chapter title" maxLength={160} disabled={busy}/></label>
                {mode === "visual" ? <PilotGuideVisualEditor key={selected.id} html={selected.html} onChange={html => editChapter({html})} disabled={busy}/> : <div className={styles.htmlPanel}><p>Edit this chapter’s HTML. Images and videos can also be added in Visual mode.</p><textarea aria-label="Chapter HTML" spellCheck={false} value={selected.html} onChange={event => editChapter({html: event.target.value})} disabled={busy}/><p>Formatting is checked when you preview or save. Use HTTPS media URLs; YouTube videos are supported.</p></div>}
            </section>
        </div>}
        {dialog === "chapter" && <GuideDialog title="Add chapter" submitLabel="Add chapter" onClose={() => setDialog(null)} onSubmit={addChapter}><label>Chapter title<input name="title" required autoFocus maxLength={160} placeholder="For example, Departure procedures"/></label></GuideDialog>}
        {dialog === "settings" && <GuideDialog title="Guide settings" onClose={() => setDialog(null)} onSubmit={updateSettings}><label>Guide title<input name="title" defaultValue={guide.title} required autoFocus maxLength={160}/></label><label>Introduction<textarea name="introduction" defaultValue={guide.introduction} rows={4} maxLength={4000}/></label><label>Guide update date<input name="lastUpdated" type="date" defaultValue={guide.lastUpdated} required/></label><p className={styles.hint}>This date is shown to pilots. Save changes to apply these settings and your chapter edits.</p></GuideDialog>}
    </section>;
}
