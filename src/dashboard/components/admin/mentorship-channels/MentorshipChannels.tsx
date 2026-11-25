"use client";

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {CaretLeftIcon, SlidersHorizontalIcon, XIcon} from "@phosphor-icons/react";
import AdminLoadingScreen from "../AdminLoadingScreen";
import AdminLoginScreen from "../AdminLoginScreen";
import AdminErrorScreen from "../AdminErrorScreen";
import {ArchiveMessageRow} from "./ArchiveMessage";
import {
    API, ArchiveError, archiveLink, archiveLocation, archiveRange, authorName, readArchive,
    type ArchiveConversation, type ArchiveLocation, type ArchivePage, type ArchiveRange, type ArchiveStream, type RangePreset,
} from "./archive";
import styles from "./mentorship-channels.module.css";

const dayFormat = new Intl.DateTimeFormat(undefined, {dateStyle: "long"});
const syncTime = new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"});
const initialRange: ArchiveRange = {preset: "14", start: "", end: ""};
const rangeLabels: Record<RangePreset, string> = {
    14: "2 weeks", 30: "30 days", 60: "60 days", 90: "90 days", all: "All time", custom: "Custom",
};

function status(problem: unknown, message: string) {
    return problem instanceof ArchiveError && [401, 403].includes(problem.status)
        ? "You no longer have access to this archive." : message;
}

export default function MentorshipChannels({loaded, loggedIn, allowed}: {loaded: boolean; loggedIn: boolean; allowed: boolean}) {
    if (!loaded) return <AdminLoadingScreen/>;
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!allowed) return <AdminErrorScreen header="Unauthorized" content="Mentorship Channels requires the Discord Moderator role or ATCMH Super Admin access."/>;
    return <ChannelWorkspace/>;
}

function ChannelWorkspace() {
    const [channels, setChannels] = useState<ArchiveStream[]>([]);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [retry, setRetry] = useState(0);
    const [filter, setFilter] = useState<"all" | "live" | "archive">("all");
    const [search, setSearch] = useState("");
    const [location, setLocation] = useState<ArchiveLocation>({});
    const [mobileConversation, setMobileConversation] = useState(false);
    const [range, setRange] = useState<ArchiveRange>(initialRange);
    const channelList = useRef<HTMLElement>(null);

    useEffect(() => {
        function readHash() {
            const value = archiveLocation(window.location.hash);
            setLocation(value);
            setMobileConversation(!!value.root);
        }
        readHash();
        window.addEventListener("hashchange", readHash);
        return () => window.removeEventListener("hashchange", readHash);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void readArchive<ArchiveStream[]>(API, controller.signal).then(result => {
            if (controller.signal.aborted) return;
            setChannels(result);
            setLoadState("ready");
        }).catch(() => { if (!controller.signal.aborted) setLoadState("error"); });
        return () => controller.abort();
    }, [retry]);

    const shown = channels.filter(channel =>
        channel.title.toLowerCase().includes(search.trim().toLowerCase()) &&
        (filter === "all" || (filter === "archive") === (channel.kind === "legacy" || channel.state === "closed")));
    const selected = channels.find(channel => channel.id === location.root) ?? (!location.root ? shown[0] : undefined);
    const params = archiveRange(range)?.toString() ?? null;
    const toggleRetry = () => { setLoadState("loading"); setRetry(value => value + 1); };

    function backToChannels() {
        setMobileConversation(false);
        setLocation(current => ({root: current.root}));
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        window.requestAnimationFrame(() =>
            (channelList.current?.querySelector<HTMLElement>('a[aria-current="page"]')
                ?? channelList.current?.querySelector<HTMLInputElement>('input[type="search"]'))?.focus({preventScroll: true}));
    }

    return <section data-mentorship-channels className={styles.workspace} data-mobile-conversation={mobileConversation} aria-label="Mentorship conversations">
        <aside ref={channelList} className={styles.channels} aria-label="Channels">
            <div className={styles.channelTools}>
                <h2>Channels</h2>
                <input type="search" aria-label="Search mentee or mentor" placeholder="Search mentee or mentor"
                    value={search} onChange={event => setSearch(event.target.value)}/>
                <div className={styles.filters} aria-label="Channel status">
                    {(["all", "live", "archive"] as const).map(value => <button key={value} type="button"
                        aria-pressed={filter === value} onClick={() => setFilter(value)}>
                        {value === "all" ? "All" : value === "live" ? "Live" : "Archived"}
                    </button>)}
                </div>
            </div>
            <div className={styles.channelList}>
                {loadState === "loading" ? <p className={styles.notice} role="status">Loading channels…</p> : null}
                {loadState === "error" ? <p className={styles.notice} role="alert">Channels could not be loaded. <button type="button" onClick={toggleRetry}>Retry</button></p> : null}
                {loadState === "ready" && !shown.length ? <p className={styles.notice}>
                    {channels.length ? "No channels match this search." : "No mentorship channels have been imported yet."}
                </p> : null}
                {shown.map(channel => <a key={channel.id} href={archiveLink(channel.id)} className={styles.channel}
                    onClick={() => setMobileConversation(true)} aria-current={selected?.id === channel.id ? "page" : undefined}>
                    <span className={styles.channelIcon} aria-hidden="true">{channel.kind === "legacy" || channel.state === "closed" ? "▤" : "#"}</span>
                    <span><strong>{channel.title}</strong><small>{channel.kind === "legacy" || channel.state === "closed" ? "Archived" : channel.state === "unavailable" ? "Unavailable" : channel.state === "importing" ? "Importing" : "Live"}</small></span>
                </a>)}
            </div>
        </aside>
        {selected ? <Conversation key={selected.id} initialChannel={selected} location={location} range={range}
            rangeQuery={params} setRange={setRange} back={backToChannels}/>
            : <div className={styles.placeholder}>
                {loadState === "ready" && location.root ? <><button className={styles.mobileBack} type="button" onClick={backToChannels}>← Channels</button><p>Channel unavailable.</p></> : <p>Select a channel to read its conversation.</p>}
            </div>}
    </section>;
}

function Conversation({initialChannel, location, range, rangeQuery, setRange, back}: {
    initialChannel: ArchiveStream; location: ArchiveLocation; range: ArchiveRange; rangeQuery: string | null;
    setRange: (value: ArchiveRange) => void; back: () => void;
}) {
    const root = initialChannel.id;
    const [detail, setDetail] = useState<ArchiveConversation>();
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    const [exportHistory, setExportHistory] = useState(false);
    const [exportStatus, setExportStatus] = useState("");
    const [downloading, setDownloading] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const options = useRef<HTMLDialogElement>(null);
    const exportRequest = useRef<AbortController>(null);

    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        async function refresh(initial: boolean) {
            try {
                if (initial || document.visibilityState === "visible") {
                    const next = await readArchive<ArchiveConversation>(API + "/" + root + (initial ? "" : "/state"), controller.signal);
                    if (!controller.signal.aborted) { setDetail(next); setError(""); }
                }
            } catch (problem) {
                if (!controller.signal.aborted) {
                    setError(status(problem, "Channel details could not be loaded."));
                    if (problem instanceof ArchiveError && [401, 403].includes(problem.status)) setDetail(undefined);
                }
            } finally {
                if (!controller.signal.aborted) timer = setTimeout(() => void refresh(false), 15000);
            }
        }
        void refresh(true);
        return () => { controller.abort(); clearTimeout(timer); };
    }, [root, reload]);

    useEffect(() => () => exportRequest.current?.abort(), []);

    const channel = detail?.channel ?? initialChannel;
    const threads = useMemo(() => detail?.streams.filter(stream => stream.kind === "thread") ?? [], [detail]);
    const view = location.root === root ? location : {};
    const selectedThread = threads.find(thread => thread.id === view.stream);
    const threadUnavailable = !!(view.stream && detail && !selectedThread);
    const stream = selectedThread?.id ?? root;
    const channelStatus = channel.kind === "legacy" || channel.state === "closed" ? "Archived"
        : channel.state === "unavailable" ? "Discord source unavailable"
        : channel.state === "importing" ? "Import in progress"
        : channel.syncedMs ? "Synced at " + syncTime.format(channel.syncedMs) : "Live";

    async function download() {
        if (rangeQuery == null || downloading || exportRequest.current) return;
        const request = new AbortController();
        exportRequest.current = request;
        setDownloading(true);
        setExportStatus("");
        try {
            const query = new URLSearchParams(rangeQuery);
            query.set("history", String(exportHistory));
            const response = await fetch(API + "/" + root + "/export?" + query, {cache: "no-store", signal: request.signal});
            if (!response.ok) throw new ArchiveError(response.status);
            const blob = await response.blob();
            if (request.signal.aborted) return;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "mentorship-" + root + ".json";
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            dialog.current?.close();
        } catch (problem) {
            if (!request.signal.aborted) setExportStatus(status(problem, "The JSON download failed. Try again."));
        } finally {
            if (!request.signal.aborted) setDownloading(false);
            exportRequest.current = null;
        }
    }

    function openExport() {
        options.current?.close();
        setExportHistory(false);
        setExportStatus("");
        dialog.current?.showModal();
    }

    const controls = <>
            {threads.length ? <label className={styles.threadSelect}>Conversation
                <select value={stream} onChange={event => { window.location.href = archiveLink(root, event.target.value); }}>
                    <option value={root}>Channel messages</option>
                    {threads.map(thread => <option key={thread.id} value={thread.id}>↳ {thread.title}</option>)}
                </select>
            </label> : null}
            <label className={styles.range}>Date range
                <select value={range.preset} onChange={event => setRange({...range, preset: event.target.value as RangePreset})}>
                    {Object.entries(rangeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </label>
            {range.preset === "custom" ? <div className={styles.customRange}>
                <label>Start date <input type="date" value={range.start} onChange={event => setRange({...range, start: event.target.value})}/></label>
                <label>End date <input type="date" value={range.end} onChange={event => setRange({...range, end: event.target.value})}/></label>
            </div> : null}
            <button type="button" className={styles.primary} disabled={rangeQuery == null || !detail} onClick={openExport}>Download JSON</button>
    </>;

    return <section className={styles.reader} aria-label={channel.title}>
        <header className={styles.toolbar}>
            <button className={styles.mobileToolbarButton} type="button" aria-label="Back to channels" onClick={back}>
                <CaretLeftIcon size={22} aria-hidden="true"/>
            </button>
            <div className={styles.channelTitle}>
                <h2 title={channel.title}><span aria-hidden="true">{channel.kind === "legacy" ? "▤" : "#"}</span> {channel.title}</h2>
                <p className={styles.desktopStatus}>{channelStatus}</p>
                <p className={styles.mobileContext}>
                    {selectedThread ? <span title={selectedThread.title}>{selectedThread.title}</span> : null}
                    {selectedThread ? " · " : null}{rangeLabels[range.preset]}
                </p>
            </div>
            <button className={styles.mobileToolbarButton} type="button" aria-label="Conversation options" aria-haspopup="dialog"
                onClick={() => options.current?.showModal()}>
                <SlidersHorizontalIcon size={22} aria-hidden="true"/>
            </button>
            <div className={styles.desktopControls}>{controls}</div>
        </header>
        {channel.kind === "legacy" ? <p className={styles.banner}>Legacy transcript · Author tags, recorded times, and message text are available.</p> : null}
        {channel.gap || selectedThread?.gap ? <p className={styles.banner}>History coverage has gaps. Some Discord activity may be missing.</p> : null}
        {error ? <p className={styles.banner} role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Retry</button></p> : null}
        {threadUnavailable ? <p className={styles.notice}>Thread unavailable. <a href={archiveLink(root)}>Open channel messages</a></p>
            : rangeQuery == null ? <p className={styles.notice}>Choose a valid start and end date.</p>
            : detail ? <Timeline key={stream + "|" + rangeQuery + "|" + (view.message ?? "")} root={root} stream={stream}
                rangeQuery={rangeQuery} anchor={view.message} threads={threads}/>
            : !error ? <p className={styles.notice} role="status">Loading conversation…</p> : null}
        <dialog ref={options} className={styles.optionsSheet} aria-labelledby="mentorship-options-title">
            <header className={styles.optionsHeader}>
                <div><h3 id="mentorship-options-title">Conversation options</h3><p>{channelStatus}</p></div>
                <button type="button" className={styles.iconButton} aria-label="Close conversation options" onClick={() => options.current?.close()}>
                    <XIcon size={20} aria-hidden="true"/>
                </button>
            </header>
            <div className={styles.optionsControls}>{controls}</div>
        </dialog>
        <dialog ref={dialog} className={styles.dialog} onCancel={event => { if (downloading) event.preventDefault(); }} aria-labelledby="mentorship-export-title">
            <h3 id="mentorship-export-title">Download mentorship history</h3>
            <p>The selected date range includes the channel and its threads.</p>
            <label><input type="checkbox" checked={exportHistory} disabled={downloading}
                onChange={event => setExportHistory(event.target.checked)}/> Include edit and deletion history</label>
            {exportStatus ? <p role="alert">{exportStatus}</p> : null}
            <div>
                <button type="button" onClick={() => dialog.current?.close()} disabled={downloading}>Cancel</button>
                <button type="button" className={styles.primary} onClick={() => void download()} disabled={downloading}>
                    {downloading ? "Downloading…" : "Download JSON"}
                </button>
            </div>
        </dialog>
    </section>;
}

function Timeline({root, stream, rangeQuery, anchor, threads}: {
    root: string; stream: string; rangeQuery: string; anchor?: string; threads: ArchiveStream[];
}) {
    const [pages, setPages] = useState<ArchivePage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const viewport = useRef<HTMLDivElement>(null);
    const position = useRef<{height: number; top: number} | null>(null);
    const firstPaint = useRef(true);
    const pageURLs = useRef<string[]>([]);
    const lifetime = useRef<AbortController>(null);

    const pageUrl = useCallback((older?: string) => {
        const query = new URLSearchParams(rangeQuery);
        query.set("stream", stream);
        if (older) {
            query.set("before", older);
            if (anchor) { query.delete("from"); query.delete("until"); }
        } else if (anchor) query.set("anchor", anchor);
        return API + "/" + root + "/messages?" + query.toString();
    }, [anchor, rangeQuery, root, stream]);

    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        pageURLs.current = [pageUrl()];
        let timer: ReturnType<typeof setTimeout>;
        async function refresh() {
            const urls = pageURLs.current.slice();
            try {
                const next = await Promise.all(urls.map(url => readArchive<ArchivePage>(url, controller.signal)));
                if (controller.signal.aborted || pageURLs.current.length !== urls.length) return;
                const element = viewport.current;
                if (element && element.scrollHeight - element.clientHeight - element.scrollTop < 24 && !anchor) {
                    firstPaint.current = true;
                }
                setPages(next);
                setError("");
            } catch (problem) {
                if (controller.signal.aborted) return;
                if (problem instanceof ArchiveError && [401, 403].includes(problem.status)) setPages([]);
                setError(status(problem, "Messages could not be loaded."));
            } finally {
                if (!controller.signal.aborted) timer = setTimeout(() => {
                    if (document.visibilityState === "visible") void refresh();
                    else timer = setTimeout(() => void refresh(), 15000);
                }, 15000);
            }
        }
        void refresh();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [anchor, pageUrl]);

    const messages = useMemo(() => {
        // Offset-free server cursors can overlap when new messages arrive during pagination.
        const byId = new Map(pages.flatMap(page => page.messages).map(message => [message.id, message]));
        return [...byId.values()].sort((a, b) => a.sentMs - b.sentMs || a.id.localeCompare(b.id));
    }, [pages]);
    const threadByMessage = useMemo(() => new Map(threads.filter(thread => thread.parentMessageId)
        .map(thread => [thread.parentMessageId!, thread])), [threads]);
    const messageById = useMemo(() => new Map(messages.map(message => [message.id, message])), [messages]);

    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element || !messages.length) return;
        function positionTimeline(timeline: HTMLDivElement) {
            if (!timeline.clientHeight) return;
            if (firstPaint.current) {
                firstPaint.current = false;
                const target = anchor && document.getElementById("archive-message-" + anchor);
                if (target) {
                    target.scrollIntoView({block: "center"});
                    target.focus({preventScroll: true});
                } else timeline.scrollTop = timeline.scrollHeight;
            } else if (position.current) {
                timeline.scrollTop = position.current.top + timeline.scrollHeight - position.current.height;
                position.current = null;
            }
        }
        positionTimeline(element);
        if (!firstPaint.current) return;
        // The phone can finish fetching the first page while the channel list is visible.
        const observer = new ResizeObserver(() => {
            positionTimeline(element);
            if (!firstPaint.current) observer.disconnect();
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [anchor, messages]);

    async function loadOlder() {
        const older = pages.at(-1)?.older;
        const controller = lifetime.current;
        if (!older || loading || !controller || controller.signal.aborted) return;
        setLoading(true);
        try {
            const url = pageUrl(older);
            const page = await readArchive<ArchivePage>(url, controller.signal);
            if (controller.signal.aborted) return;
            const element = viewport.current;
            if (element) position.current = {height: element.scrollHeight, top: element.scrollTop};
            pageURLs.current.push(url);
            setPages(current => [...current, page]);
        } catch (problem) {
            if (!controller.signal.aborted) setError(status(problem, "Older messages could not be loaded."));
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }

    return <div ref={viewport} className={styles.timeline} aria-label="Messages" tabIndex={0}>
        {pages.at(-1)?.older ? <button className={styles.older} type="button" disabled={loading}
            onClick={() => void loadOlder()}>{loading ? "Loading…" : "↑ Load older messages"}</button> : null}
        {error ? <p className={styles.notice} role="alert">{error}</p> : null}
        {!pages.length && !error ? <p className={styles.notice} role="status">Loading messages…</p> : null}
        {pages.length && !messages.length && !error ? <p className={styles.notice}>No messages in this date range.</p> : null}
        {anchor && pages.length && !messages.some(message => message.id === anchor) ? <p className={styles.notice}>This message is unavailable.</p> : null}
        {messages.map((message, index) => {
            const previous = messages[index - 1];
            const day = dayFormat.format(message.sentMs);
            const newDay = !previous || dayFormat.format(previous.sentMs) !== day;
            const grouped = !newDay && !message.deletedMs && !previous.deletedMs && !message.body.message_reference &&
                authorName(previous.body) === authorName(message.body) && previous.body.author?.id === message.body.author?.id &&
                message.sentMs - previous.sentMs < 7 * 60 * 1000;
            return <div key={message.id}>
                {newDay ? <div className={styles.day}>{day}</div> : null}
                <ArchiveMessageRow message={message} root={root} grouped={grouped} active={message.id === anchor}
                    thread={threadByMessage.get(message.id)} replyMessage={messageById.get(message.body.message_reference?.message_id ?? "")}/>
            </div>;
        })}
    </div>;
}

