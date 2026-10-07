"use client";

import {useEffect, useRef, useState, type FormEvent, type ReactNode} from "react";
import {Node, mergeAttributes} from "@tiptap/core";
import {EditorContent, useEditor, useEditorState} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import {TableKit} from "@tiptap/extension-table";
import {TextB, TextItalic, TextUnderline, ListBullets, ListNumbers, LinkSimple, Image as ImageIcon, VideoCamera, ArrowUUpLeft, ArrowUUpRight, Quotes, X} from "@phosphor-icons/react";
import {safeGuideMediaUrl, sanitizePilotGuideHtml, youtubeGuideEmbed} from "@/src/learning/pilot-guide-html";
import contentStyles from "@/src/learning/PilotGuideContent.module.css";
import styles from "./AdminPilotGuide.module.css";

const Aside = Node.create({
    name: "guideAside", group: "block", content: "block+", defining: true,
    addAttributes: () => ({label: {default: null, parseHTML: element => element.getAttribute("aria-label"), renderHTML: attrs => attrs.label ? {"aria-label": attrs.label} : {}}}),
    parseHTML: () => [{tag: "aside"}], renderHTML: ({HTMLAttributes}) => ["aside", mergeAttributes(HTMLAttributes), 0],
});
const Figure = Node.create({name: "guideFigure", group: "block", content: "block+", parseHTML: () => [{tag: "figure"}], renderHTML: () => ["figure", 0]});
const Caption = Node.create({name: "guideCaption", group: "block", content: "inline*", parseHTML: () => [{tag: "figcaption"}], renderHTML: () => ["figcaption", 0]});
const Video = Node.create({
    name: "guideVideo", group: "block", atom: true, draggable: true,
    addAttributes: () => ({src: {default: null, parseHTML: element => element.getAttribute("src") ?? element.querySelector("source")?.getAttribute("src")}, poster: {default: null}}),
    parseHTML: () => [{tag: "video"}], renderHTML: ({HTMLAttributes}) => ["video", mergeAttributes(HTMLAttributes, {controls: "", preload: "metadata"})],
});
const GuideYoutube = Youtube.extend({
    addAttributes() {return {...this.parent?.(), title: {default: "Pilot guide video", parseHTML: element => element.getAttribute("title") || "Pilot guide video"}};},
});

export function GuideDialog({title, children, onClose, onSubmit, submitLabel = "Apply changes", busy = false}: {title: string; children: ReactNode; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitLabel?: string; busy?: boolean}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {const dialog = ref.current; dialog?.showModal(); dialog?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")?.focus(); return () => {dialog?.close();};}, []);
    return <dialog ref={ref} className={styles.dialog} aria-labelledby="guide-dialog-title" onCancel={event => {event.preventDefault(); if (!busy) onClose();}}>
        <form onSubmit={onSubmit}>
            <div className={styles.dialogHeading}><h2 id="guide-dialog-title">{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={22}/></button></div>
            <div className={styles.dialogBody}>{children}</div>
            <div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Cancel</button><button className={styles.primary} type="submit" disabled={busy}>{submitLabel}</button></div>
        </form>
    </dialog>;
}

export default function PilotGuideVisualEditor({html, onChange, disabled}: {html: string; onChange: (html: string) => void; disabled: boolean}) {
    const lastEmitted = useRef(html);
    const lastReceived = useRef(html);
    const ready = useRef(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const [insert, setInsert] = useState<"image" | "video" | "link" | null>(null);
    const [insertError, setInsertError] = useState<string>();
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [StarterKit.configure({trailingNode: false, link: {openOnClick: false, defaultProtocol: "https", protocols: ["https"], HTMLAttributes: {target: "_blank", rel: "noopener noreferrer"}}}), TableKit.configure({table: {resizable: false}}), Image.configure({allowBase64: false}), GuideYoutube.configure({nocookie: true, HTMLAttributes: {loading: "lazy"}}), Placeholder.configure({placeholder: "Write this chapter…"}), Aside, Figure, Caption, Video],
        content: sanitizePilotGuideHtml(html), editable: !disabled,
        editorProps: {attributes: {class: styles.prose, role: "textbox", "aria-label": "Chapter content", "aria-multiline": "true"}},
        onCreate: ({editor: current}) => {lastEmitted.current = current.getHTML(); ready.current = true;},
        onUpdate: ({editor: current}) => {if (!ready.current) return; const next = current.getHTML(); if (next === lastEmitted.current) return; lastEmitted.current = next; lastReceived.current = next; onChangeRef.current(next);},
    });
    const state = useEditorState({editor, selector: ({editor: current}) => ({bold: current?.isActive("bold"), italic: current?.isActive("italic"), underline: current?.isActive("underline"), bullets: current?.isActive("bulletList"), numbers: current?.isActive("orderedList"), quote: current?.isActive("blockquote"), heading: current?.isActive("heading") ? String(current.getAttributes("heading").level) : "paragraph", undo: current?.can().undo(), redo: current?.can().redo()})});
    useEffect(() => {editor?.setEditable(!disabled);}, [disabled, editor]);
    useEffect(() => {if (editor && html !== lastReceived.current) {lastReceived.current = html; editor.commands.setContent(sanitizePilotGuideHtml(html), {emitUpdate: false}); lastEmitted.current = editor.getHTML();}}, [editor, html]);
    const openInsert = (kind: typeof insert) => {setInsertError(undefined); setInsert(kind);};
    const insertMedia = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editor || disabled) return;
        const data = new FormData(event.currentTarget);
        const url = String(data.get("url") ?? "").trim();
        if (!safeGuideMediaUrl(url)) {setInsertError("Use an HTTPS URL or a path on this site, such as /images/diagram.png."); return;}
        if (insert === "image") editor.chain().focus().setImage({src: url, alt: String(data.get("alt") ?? "").trim()}).createParagraphNear().run();
        if (insert === "video") {
            const embed = youtubeGuideEmbed(url);
            if (embed) editor.chain().focus().setYoutubeVideo({src: embed}).createParagraphNear().run();
            else if (/youtu(?:be\.com|\.be)|youtube-nocookie\.com/i.test(url)) {setInsertError("Enter a complete YouTube video URL."); return;}
            else editor.chain().focus().insertContent({type: "guideVideo", attrs: {src: url}}).createParagraphNear().run();
        }
        if (insert === "link") {
            if (editor.state.selection.empty && !editor.isActive("link")) editor.chain().focus().insertContent({type: "text", text: String(data.get("text") ?? "").trim() || url, marks: [{type: "link", attrs: {href: url}}]}).run();
            else editor.chain().focus().extendMarkRange("link").setLink({href: url}).run();
        }
        setInsert(null);
    };
    const tool = (label: string, icon: ReactNode, action: () => void, active?: boolean, unavailable = false) => <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled || !editor || unavailable} onClick={action}>{icon}</button>;
    return <>
        <div className={styles.toolbar} role="toolbar" aria-label="Chapter formatting">
            <select aria-label="Text style" value={state?.heading ?? "paragraph"} disabled={disabled || !editor} onChange={event => {const value = event.target.value; if (value === "paragraph") editor?.chain().focus().setParagraph().run(); else editor?.chain().focus().setHeading({level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6}).run();}}><option value="paragraph">Paragraph</option>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>Heading {level}</option>)}</select>
            <span className={styles.toolbarDivider}/>
            {tool("Bold", <TextB size={20}/>, () => editor?.chain().focus().toggleBold().run(), state?.bold)}
            {tool("Italic", <TextItalic size={20}/>, () => editor?.chain().focus().toggleItalic().run(), state?.italic)}
            {tool("Underline", <TextUnderline size={20}/>, () => editor?.chain().focus().toggleUnderline().run(), state?.underline)}
            <span className={styles.toolbarDivider}/>
            {tool("Bulleted list", <ListBullets size={20}/>, () => editor?.chain().focus().toggleBulletList().run(), state?.bullets)}
            {tool("Numbered list", <ListNumbers size={20}/>, () => editor?.chain().focus().toggleOrderedList().run(), state?.numbers)}
            {tool("Callout", <Quotes size={20}/>, () => editor?.chain().focus().toggleBlockquote().run(), state?.quote)}
            <span className={styles.toolbarDivider}/>
            {tool("Insert link", <LinkSimple size={20}/>, () => openInsert("link"))}
            {tool("Insert image", <ImageIcon size={20}/>, () => openInsert("image"))}
            {tool("Insert video", <VideoCamera size={20}/>, () => openInsert("video"))}
            <span className={styles.toolbarDivider}/>
            {tool("Undo", <ArrowUUpLeft size={20}/>, () => editor?.chain().focus().undo().run(), undefined, !state?.undo)}
            {tool("Redo", <ArrowUUpRight size={20}/>, () => editor?.chain().focus().redo().run(), undefined, !state?.redo)}
        </div>
        <EditorContent editor={editor} className={`${styles.editorContent} ${contentStyles.content}`}/>
        {insert && <GuideDialog title={`Insert ${insert}`} submitLabel={`Insert ${insert}`} onClose={() => setInsert(null)} onSubmit={insertMedia}>
            <label>URL<input name="url" type="text" required autoFocus placeholder={insert === "video" ? "https://youtu.be/… or https://…/video.mp4" : "https://…"} defaultValue={insert === "link" ? editor?.getAttributes("link").href as string ?? "" : ""}/></label>
            {insert === "image" && <label>Image description<input name="alt" required placeholder="Describe the image for pilots using a screen reader"/></label>}
            {insert === "link" && editor?.state.selection.empty && !editor.isActive("link") && <label>Link text<input name="text" placeholder="What pilots should click"/></label>}
            <p className={styles.hint}>{insert === "image" ? "Use an image URL. The description helps pilots who can’t see the image." : insert === "video" ? "Paste a YouTube URL or a direct video file URL. The video will be embedded in the guide." : "Select text first to turn it into a link. Click an existing link and use this tool to change its URL."}</p>
            {insert === "link" && editor?.isActive("link") && <button type="button" className={styles.textButton} onClick={() => {editor.chain().focus().extendMarkRange("link").unsetLink().run(); setInsert(null);}}>Remove link</button>}
            {insertError && <p role="alert" className={styles.error}>{insertError}</p>}
        </GuideDialog>}
    </>;
}
