"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated private chat attachment endpoints and Discord avatars cannot use next/image optimization. */

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ClipboardEvent,
    type DragEvent,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import {ArrowSquareOutIcon} from "@phosphor-icons/react/ArrowSquareOut";
import {ArrowsClockwiseIcon} from "@phosphor-icons/react/ArrowsClockwise";
import {ChatCircleDotsIcon} from "@phosphor-icons/react/ChatCircleDots";
import {FileIcon} from "@phosphor-icons/react/File";
import {ImageIcon} from "@phosphor-icons/react/Image";
import {LockIcon} from "@phosphor-icons/react/Lock";
import {PaperPlaneTiltIcon} from "@phosphor-icons/react/PaperPlaneTilt";
import {XIcon} from "@phosphor-icons/react/X";
import {discordUrl} from "@/src/marketing/SiteHeader";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {
    fetchGroundSchoolChat,
    formatSenderRoleBadge,
    getGroundSchoolStatus,
    GROUND_SCHOOL_ENROLLED_EVENT,
    markGroundSchoolChatRead,
    MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
    mergeChatMessages,
    sendGroundSchoolChatMessage,
    uploadGroundSchoolChatAttachment,
    validateChatImageFile,
    type ChatAttachmentSummary,
    type ChatMessage,
    type ChatStateResponse,
} from "./ground-school-chat-client";
import styles from "./GroundSchoolChatWidget.module.css";

const OPEN_POLL_MS = 3000;
const MINIMIZED_POLL_MS = 15000;
const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

function renderTextWithLinks(text: string): ReactNode {
    const parts = text.split(URL_PATTERN);
    return parts.map((part, index) => {
        if (/^https?:\/\/[^\s<]+$/.test(part)) {
            return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className={styles.messageLink}>{part}</a>;
        }
        return part;
    });
}

function formatMessageTime(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
}

export default function GroundSchoolChatWidget() {
    const {session} = usePortalAuth();
    const [open, setOpen] = useState(false);
    const [chatState, setChatState] = useState<ChatStateResponse | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [draft, setDraft] = useState("");
    const [pendingAttachments, setPendingAttachments] = useState<ChatAttachmentSummary[]>([]);
    const [uploadingCount, setUploadingCount] = useState(0);
    const [sending, setSending] = useState(false);
    const [checkingDiscord, setCheckingDiscord] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>();
    const [dragging, setDragging] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<{url: string; filename: string} | null>(null);
    const [viewportHeight, setViewportHeight] = useState<number | null>(null);

    const listRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lastReadSentRef = useRef<number>(0);
    const stickToBottomRef = useRef<boolean>(true);
    const previousMessageCountRef = useRef<number>(0);

    const csrfToken = session?.csrfToken ?? "";

    const syncChat = useCallback(async () => {
        if (!session) return;
        try {
            const state = await fetchGroundSchoolChat();
            setChatState(state);
            if (!state.enrolled) {
                setMessages([]);
                setHasMore(false);
                return;
            }
            setMessages(prev => mergeChatMessages(prev, state.messages));
            setHasMore(prev => (prev || state.hasMore));
        } catch {
            // Keep existing messages visible if a transient poll fails.
        }
    }, [session]);

    // Initial load + enrollment event trigger
    useEffect(() => {
        if (!session) return;
        const onEnrolled = () => { void syncChat(); };
        const initTimer = window.setTimeout(() => { void syncChat(); }, 0);
        window.addEventListener(GROUND_SCHOOL_ENROLLED_EVENT, onEnrolled);
        return () => {
            window.clearTimeout(initTimer);
            window.removeEventListener(GROUND_SCHOOL_ENROLLED_EVENT, onEnrolled);
        };
    }, [session, syncChat]);

    // Adaptive polling: 3s while open, 15s while minimized, paused when hidden
    useEffect(() => {
        if (!session) return;
        let timer: number | undefined;
        let cancelled = false;

        const schedule = () => {
            if (cancelled || document.hidden) return;
            const delay = open ? OPEN_POLL_MS : MINIMIZED_POLL_MS;
            timer = window.setTimeout(async () => {
                if (cancelled || document.hidden) return;
                await syncChat();
                schedule();
            }, delay);
        };

        const onVisibility = () => {
            if (timer !== undefined) window.clearTimeout(timer);
            if (!document.hidden && !cancelled) {
                void syncChat().finally(schedule);
            }
        };

        schedule();
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onVisibility);
        return () => {
            cancelled = true;
            if (timer !== undefined) window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", onVisibility);
        };
    }, [session, open, syncChat]);

    // Mark messages read when open
    useEffect(() => {
        if (!open || !csrfToken || !chatState?.enrolled || messages.length === 0) return;
        const latestId = messages[messages.length - 1]?.id ?? 0;
        if (latestId <= lastReadSentRef.current) return;
        lastReadSentRef.current = latestId;
        void markGroundSchoolChatRead(latestId, csrfToken)
            .then(unreadCount => setChatState(prev => prev ? {...prev, unreadCount} : prev))
            .catch(() => { lastReadSentRef.current = 0; });
    }, [open, csrfToken, chatState?.enrolled, messages]);

    // Scroll to bottom when opening or receiving new messages while near bottom
    useEffect(() => {
        if (!open) return;
        const container = listRef.current;
        if (!container) return;
        const added = messages.length > previousMessageCountRef.current;
        previousMessageCountRef.current = messages.length;
        if (stickToBottomRef.current || added) {
            container.scrollTop = container.scrollHeight;
        }
    }, [open, messages]);

    // Mobile keyboard / visualViewport handling & Escape close
    useEffect(() => {
        if (!open) return;
        const updateViewport = () => {
            if (window.visualViewport) {
                setViewportHeight(Math.round(window.visualViewport.height));
            }
        };
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") {
                if (lightboxUrl) setLightboxUrl(null);
                else setOpen(false);
            }
        };
        window.visualViewport?.addEventListener("resize", updateViewport);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.visualViewport?.removeEventListener("resize", updateViewport);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, lightboxUrl]);

    const handleScroll = () => {
        const container = listRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        stickToBottomRef.current = distanceFromBottom < 80;
    };

    const loadOlder = async () => {
        if (loadingOlder || messages.length === 0) return;
        const oldestId = messages[0].id;
        setLoadingOlder(true);
        try {
            const page = await fetchGroundSchoolChat(oldestId);
            setMessages(prev => mergeChatMessages(page.messages, prev));
            setHasMore(page.hasMore);
        } catch {
            setErrorMessage("Could not load older messages.");
        } finally {
            setLoadingOlder(false);
        }
    };

    const uploadFiles = async (files: File[]) => {
        if (!csrfToken || files.length === 0) return;
        const remainingSlots = MAX_CHAT_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
        if (remainingSlots <= 0) {
            setErrorMessage(`You can attach up to ${MAX_CHAT_ATTACHMENTS_PER_MESSAGE} images per message.`);
            return;
        }
        const batch = files.slice(0, remainingSlots);
        setErrorMessage(undefined);
        setUploadingCount(count => count + batch.length);
        try {
            for (const file of batch) {
                const validation = validateChatImageFile(file);
                if (validation) {
                    setErrorMessage(validation);
                    continue;
                }
                const uploaded = await uploadGroundSchoolChatAttachment(file, csrfToken);
                setPendingAttachments(prev => [...prev, uploaded]);
            }
        } catch (reason) {
            setErrorMessage(reason instanceof Error ? reason.message : "Image upload failed.");
        } finally {
            setUploadingCount(count => Math.max(0, count - batch.length));
        }
    };

    const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageFiles = items
            .filter(item => item.kind === "file" && item.type.startsWith("image/"))
            .map(item => item.getAsFile())
            .filter((file): file is File => Boolean(file));
        if (imageFiles.length > 0) {
            event.preventDefault();
            void uploadFiles(imageFiles);
        }
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith("image/"));
        if (files.length > 0) void uploadFiles(files);
    };

    const send = async () => {
        if (!csrfToken || sending || uploadingCount > 0) return;
        const trimmed = draft.trim();
        if (!trimmed && pendingAttachments.length === 0) return;
        setSending(true);
        setErrorMessage(undefined);
        try {
            const attachmentIds = pendingAttachments.map(item => item.id);
            const sent = await sendGroundSchoolChatMessage(trimmed, attachmentIds, csrfToken);
            setDraft("");
            setPendingAttachments([]);
            stickToBottomRef.current = true;
            setMessages(prev => mergeChatMessages(prev, [sent]));
            lastReadSentRef.current = Math.max(lastReadSentRef.current, sent.id);
            if (textareaRef.current) textareaRef.current.style.height = "auto";
        } catch (reason) {
            setErrorMessage(reason instanceof Error ? reason.message : "Failed to send message.");
            void syncChat();
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
        }
    };

    const recheckDiscord = async () => {
        setCheckingDiscord(true);
        setErrorMessage(undefined);
        try {
            const status = await getGroundSchoolStatus(true);
            setChatState(prev => prev ? {...prev, inDiscord: status.inDiscord, discordUnavailable: status.discordUnavailable} : prev);
            if (status.inDiscord) await syncChat();
            else setErrorMessage("We still don't see you in the ATCMH Discord server.");
        } catch {
            setErrorMessage("Unable to check Discord membership right now.");
        } finally {
            setCheckingDiscord(false);
        }
    };

    const composerDisabledReason = useMemo(() => {
        if (!chatState) return null;
        if (!chatState.inDiscord) return "NOT_IN_DISCORD" as const;
        if (chatState.hasIfc === false) return "IFC_REQUIRED" as const;
        if (chatState.thread?.locked) return "LOCKED" as const;
        return null;
    }, [chatState]);

    if (!session || !chatState?.enrolled) {
        return null;
    }

    const unreadCount = chatState.unreadCount ?? 0;

    return <>
        {!open ? (
            <button
                type="button"
                className={styles.launcher}
                onClick={() => {
                    stickToBottomRef.current = true;
                    setOpen(true);
                    void syncChat();
                }}
                aria-label={unreadCount > 0 ? `Open Ground School support chat (${unreadCount} unread)` : "Open Ground School support chat"}
            >
                <ChatCircleDotsIcon size={22} weight="fill"/>
                <span className={styles.launcherLabel}>Ground School Support</span>
                {unreadCount > 0 ? (
                    <span className={styles.unreadBadge} aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
                ) : null}
            </button>
        ) : (
            <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
                <section
                    className={`${styles.panel} ${dragging ? styles.panelDragging : ""}`}
                    role="dialog"
                    aria-label="Ground School support chat"
                    style={open && viewportHeight ? {"--gs-chat-vh": `${viewportHeight}px`} as React.CSSProperties : undefined}
                    onDragOver={event => { event.preventDefault(); setDragging(true); }}
                    onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }}
                    onDrop={handleDrop}
                >
                    <header className={styles.header}>
                        <div className={styles.headerMeta}>
                            <ChatCircleDotsIcon size={20} weight="fill" className={styles.headerIcon}/>
                            <div>
                                <h2>Ground School Support</h2>
                                <p>{chatState.thread?.locked ? "Thread closed by staff" : "Synced with your private Discord thread"}</p>
                            </div>
                        </div>
                        <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label="Minimize support chat">
                            <XIcon size={18}/>
                        </button>
                    </header>

                    <div ref={listRef} className={styles.messages} onScroll={handleScroll}>
                        {hasMore ? (
                            <button type="button" className={styles.loadOlder} disabled={loadingOlder} onClick={() => void loadOlder()}>
                                {loadingOlder ? "Loading…" : "Load older messages"}
                            </button>
                        ) : null}

                        {messages.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p><strong>Ask a Mentor or Moderator</strong></p>
                                <p>Questions you send here go straight to your private Ground School Discord thread, and replies appear right here.</p>
                            </div>
                        ) : messages.map(message => {
                            if (message.source === "SYSTEM") {
                                return <div key={message.id} className={styles.systemRow}>
                                    <span className={styles.systemPill}>{message.content}</span>
                                </div>;
                            }
                            const isLearner = message.senderRole === "LEARNER";
                            const roleBadge = formatSenderRoleBadge(message.senderRole);
                            return <article key={message.id} className={`${styles.messageRow} ${isLearner ? styles.messageRowMine : styles.messageRowStaff}`}>
                                {!isLearner ? (
                                    message.authorAvatarUrl
                                        ? <img className={styles.avatar} src={message.authorAvatarUrl} alt="" width={28} height={28}/>
                                        : <span className={styles.avatarFallback} aria-hidden="true">{message.authorDisplayName.slice(0, 1).toUpperCase()}</span>
                                ) : null}
                                <div className={styles.bubbleWrap}>
                                    <div className={styles.metaLine}>
                                        <span className={styles.authorName}>{isLearner ? (chatState.ifcName || message.authorDisplayName) : message.authorDisplayName}</span>
                                        {roleBadge ? <span className={styles.roleBadge}>{roleBadge}</span> : null}
                                        <time className={styles.timestamp} dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                                    </div>
                                    <div className={`${styles.bubble} ${isLearner ? styles.bubbleMine : styles.bubbleStaff} ${message.deleted ? styles.bubbleDeleted : ""}`}>
                                        {message.deleted ? (
                                            <em>Message deleted</em>
                                        ) : (
                                            <>
                                                {message.content ? <p className={styles.text}>{renderTextWithLinks(message.content)}</p> : null}
                                                {message.attachments.length > 0 ? (
                                                    <div className={styles.attachmentGrid}>
                                                        {message.attachments.map(att => att.image ? (
                                                            <button
                                                                key={att.id}
                                                                type="button"
                                                                className={styles.imageButton}
                                                                onClick={() => setLightboxUrl({url: att.url, filename: att.filename})}
                                                                aria-label={`View image ${att.filename}`}
                                                            >
                                                                <img src={att.url} alt={att.filename} loading="lazy"/>
                                                            </button>
                                                        ) : (
                                                            <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className={styles.fileChip}>
                                                                <FileIcon size={16}/><span>{att.filename}</span>
                                                            </a>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {message.editedAt ? <span className={styles.editedTag}>(edited)</span> : null}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </article>;
                        })}
                    </div>

                    {errorMessage ? <p className={styles.errorBanner} role="alert">{errorMessage}</p> : null}

                    {composerDisabledReason === "LOCKED" ? (
                        <div className={styles.statusFooter} role="status">
                            <LockIcon size={18}/>
                            <span>This thread has been closed by staff.</span>
                        </div>
                    ) : composerDisabledReason === "NOT_IN_DISCORD" ? (
                        <div className={styles.discordFooter} role="status">
                            <p>You must join our discord server to participate in the Ground School.</p>
                            <div className={styles.discordFooterActions}>
                                <a href={discordUrl} target="_blank" rel="noopener noreferrer" className={styles.discordLink}>
                                    Join Discord<ArrowSquareOutIcon size={15}/>
                                </a>
                                <button type="button" className={styles.recheckButton} disabled={checkingDiscord} onClick={() => void recheckDiscord()}>
                                    <ArrowsClockwiseIcon size={15}/>{checkingDiscord ? "Checking…" : "Check again"}
                                </button>
                            </div>
                        </div>
                    ) : composerDisabledReason === "IFC_REQUIRED" ? (
                        <div className={styles.statusFooter} role="status">
                            <span>Link your Infinite Flight account to send Ground School messages.</span>
                        </div>
                    ) : (
                        <footer className={styles.composerArea}>
                            {pendingAttachments.length > 0 || uploadingCount > 0 ? (
                                <div className={styles.pendingStrip}>
                                    {pendingAttachments.map(att => (
                                        <div key={att.id} className={styles.pendingThumb}>
                                            <img src={att.url} alt={att.filename}/>
                                            <button
                                                type="button"
                                                aria-label={`Remove ${att.filename}`}
                                                onClick={() => setPendingAttachments(prev => prev.filter(item => item.id !== att.id))}
                                            >
                                                <XIcon size={12}/>
                                            </button>
                                        </div>
                                    ))}
                                    {uploadingCount > 0 ? <span className={styles.uploadingTag}>Uploading…</span> : null}
                                </div>
                            ) : null}
                            <div className={styles.composerRow}>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    multiple
                                    hidden
                                    onChange={event => {
                                        const files = Array.from(event.target.files ?? []);
                                        event.target.value = "";
                                        if (files.length > 0) void uploadFiles(files);
                                    }}
                                />
                                <button
                                    type="button"
                                    className={styles.attachButton}
                                    disabled={sending || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS_PER_MESSAGE}
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label="Attach screenshot"
                                    title="Attach screenshot (PNG, JPEG, WEBP, GIF)"
                                >
                                    <ImageIcon size={20}/>
                                </button>
                                <textarea
                                    ref={textareaRef}
                                    className={styles.input}
                                    rows={1}
                                    maxLength={2000}
                                    value={draft}
                                    placeholder="Ask a question or paste a screenshot…"
                                    disabled={sending}
                                    onPaste={handlePaste}
                                    onKeyDown={handleKeyDown}
                                    onChange={event => {
                                        setDraft(event.target.value);
                                        event.target.style.height = "auto";
                                        event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
                                    }}
                                />
                                <button
                                    type="button"
                                    className={styles.sendButton}
                                    disabled={sending || uploadingCount > 0 || (!draft.trim() && pendingAttachments.length === 0)}
                                    onClick={() => void send()}
                                    aria-label="Send message"
                                >
                                    <PaperPlaneTiltIcon size={18} weight="fill"/>
                                </button>
                            </div>
                        </footer>
                    )}
                </section>
            </div>
        )}

        {lightboxUrl ? (
            <div className={styles.lightbox} role="dialog" aria-label={lightboxUrl.filename} onClick={() => setLightboxUrl(null)}>
                <button type="button" className={styles.lightboxClose} onClick={() => setLightboxUrl(null)} aria-label="Close image preview">
                    <XIcon size={22}/>
                </button>
                <img src={lightboxUrl.url} alt={lightboxUrl.filename} onClick={event => event.stopPropagation()}/>
            </div>
        ) : null}
    </>;
}
