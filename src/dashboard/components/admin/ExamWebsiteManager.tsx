import {useEffect, useState} from "react";
import type {ExamWebsiteContent} from "../../types/Exam.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {stableExamValue} from "./ExamUnsavedChanges.ts";
import styles from "./ExamWebsiteManager.module.css";
import {useExamUnsavedChanges} from "./useExamUnsavedChanges.ts";

interface ExamWebsiteManagerProps { token: string; }

const ExamWebsiteManager = ({token}: ExamWebsiteManagerProps) => {
    const [content, setContent] = useState<ExamWebsiteContent | null>(null);
    const [baseline, setBaseline] = useState<ExamWebsiteContent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const isDirty = content !== null && stableExamValue(content) !== stableExamValue(baseline);
    useExamUnsavedChanges({isDirty});

    useEffect(() => {
        let active = true;
        void ExamsApiUtils.getWebsiteContent(token).then(next => {
            if (active) {
                setContent(next);
                setBaseline(next);
            }
        }).catch(reason => {
            if (active) setError(reason instanceof Error ? reason.message : String(reason));
        });
        return () => { active = false; };
    }, [token]);

    const save = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!content) return;
        setError(null);
        setSaved(false);
        setIsSaving(true);
        try {
            const savedContent = await ExamsApiUtils.saveWebsiteContent(content, token);
            setContent(savedContent);
            setBaseline(savedContent);
            setSaved(true);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setIsSaving(false);
        }
    };

    const updateAnnouncement = (index: number, update: (value: ExamWebsiteContent["announcements"][number]) => ExamWebsiteContent["announcements"][number]) => {
        setContent(current => current ? {...current, announcements: current.announcements.map((item, itemIndex) => itemIndex === index ? update(item) : item)} : current);
    };
    const updatePage = (index: number, update: (value: ExamWebsiteContent["pages"][number]) => ExamWebsiteContent["pages"][number]) => {
        setContent(current => current ? {...current, pages: current.pages.map((item, itemIndex) => itemIndex === index ? update(item) : item)} : current);
    };

    if (!content) return <section className={styles.manager} aria-live="polite"><h2>Website content</h2>{error ? <p className={styles.error} role="alert">{error}</p> : <p>Loading website content…</p>}</section>;

    return <section className={styles.manager} aria-labelledby="website-manager-heading">
        <div className={styles.heading}><div><p className={styles.eyebrow}>Administrator only</p><h2 id="website-manager-heading">Website content</h2></div></div>
        <p className={styles.description}>Edit structured page content. Scripts, HTML execution, and permission rules stay outside this workspace.</p>
        <form onSubmit={event => void save(event)}><fieldset disabled={isSaving}>
            {content.home ? <section className={styles.section}>
                <h3>Home content</h3>
                <label>Page title<input required value={content.home.title} onChange={event => setContent(current => current?.home ? {...current, home: {...current.home, title: event.target.value}} : current)}/></label>
                <label>Introduction<textarea rows={3} value={content.home.intro} onChange={event => setContent(current => current?.home ? {...current, home: {...current.home, intro: event.target.value}} : current)}/></label>
                <label>Header title<input required value={content.home.headerTitle} onChange={event => setContent(current => current?.home ? {...current, home: {...current.home, headerTitle: event.target.value}} : current)}/></label>
                <label>Header subtitle<input required value={content.home.headerSubtitle} onChange={event => setContent(current => current?.home ? {...current, home: {...current.home, headerSubtitle: event.target.value}} : current)}/></label>
            </section> : null}
            <section className={styles.section}>
                <div className={styles.sectionHeading}><h3>Announcements</h3><button type="button" onClick={() => setContent(current => current ? {...current, announcements: [...current.announcements, {content: "", sortOrder: current.announcements.length + 1}]} : current)}>Add announcement</button></div>
                {content.announcements.map((announcement, index) => <article className={styles.card} key={announcement.id ?? index}>
                    <label>Message<textarea required rows={3} value={announcement.content} onChange={event => updateAnnouncement(index, current => ({...current, content: event.target.value}))}/></label>
                    <label>Display order<input required type="number" value={announcement.sortOrder} onChange={event => updateAnnouncement(index, current => ({...current, sortOrder: Number(event.target.value)}))}/></label>
                    <button type="button" className={styles.removeButton} onClick={() => setContent(current => current ? {...current, announcements: current.announcements.filter((_, itemIndex) => itemIndex !== index)} : current)}>Exclude from this save</button>
                </article>)}
            </section>
            <section className={styles.section}>
                <div className={styles.sectionHeading}><h3>Pages</h3><button type="button" onClick={() => setContent(current => current ? {...current, pages: [...current.pages, {slug: "", title: "", content: ""}]} : current)}>Add page</button></div>
                {content.pages.map((page, index) => <article className={styles.card} key={page.id ?? index}>
                    <label>Slug<input required pattern="[a-z0-9-]+" value={page.slug} onChange={event => updatePage(index, current => ({...current, slug: event.target.value}))}/></label>
                    <label>Title<input required value={page.title} onChange={event => updatePage(index, current => ({...current, title: event.target.value}))}/></label>
                    <label>Content<textarea required rows={5} value={page.content} onChange={event => updatePage(index, current => ({...current, content: event.target.value}))}/></label>
                    <button type="button" className={styles.removeButton} onClick={() => setContent(current => current ? {...current, pages: current.pages.filter((_, itemIndex) => itemIndex !== index)} : current)}>Exclude from this save</button>
                </article>)}
            </section>
        </fieldset>{error ? <p className={styles.error} role="alert">{error}</p> : null}{saved ? <p className={styles.success} role="status">Website content saved.</p> : null}<button type="submit" className={styles.saveButton}>{isSaving ? "Saving…" : "Save website content"}</button></form>
    </section>;
};

export default ExamWebsiteManager;
