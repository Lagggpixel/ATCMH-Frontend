"use client";

import {Fragment, useState, type ReactNode} from "react";
import {API, archiveLink, authorName, readArchive, type ArchiveMessage, type ArchiveRevision, type ArchiveStream, type DiscordBody, type Embed, type Emoji, type MediaRef} from "./archive";
import styles from "./mentorship-channels.module.css";

const shortTime = new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"});
const fullTime = new Intl.DateTimeFormat(undefined, {dateStyle: "full", timeStyle: "long"});

function messageTime(date: Date): string {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today at " + shortTime.format(date);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday at " + shortTime.format(date);
    return shortTime.format(date);
}

function safeLink(raw?: string): string | undefined {
    if (!raw) return undefined;
    try {
        const url = new URL(raw);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
    } catch { return undefined; }
}

function ExternalLink({url, children}: {url?: string; children: ReactNode}) {
    const href = safeLink(url);
    return href ? <a href={href} rel="noreferrer noopener" target="_blank">{children}</a> : children;
}

function EmojiImage({emoji}: {emoji: Emoji}) {
    const valid = /^\d{1,20}$/.test(emoji.id ?? "");
    if (!valid) return <>{emoji.name}</>;
    const label = ":" + (emoji.name || "emoji") + ":";
    // Discord assets use their native dimensions and animated formats.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.emoji} src={"https://cdn.discordapp.com/emojis/" + emoji.id + (emoji.animated ? ".gif" : ".webp") + "?size=48"} alt={label} title={label} loading="lazy"/>;
}

function DiscordTimestamp({unix, format = "f"}: {unix: string; format?: string}) {
    const stamp = new Date(Number(unix) * 1000);
    if (!Number.isFinite(stamp.getTime())) return null;
    const formatOptions: Record<string, Intl.DateTimeFormatOptions> = {
        t: {timeStyle: "short"}, T: {timeStyle: "medium"}, d: {dateStyle: "short"}, D: {dateStyle: "long"},
        f: {dateStyle: "long", timeStyle: "short"}, F: {dateStyle: "full", timeStyle: "short"},
        s: {dateStyle: "short", timeStyle: "short"}, S: {dateStyle: "short", timeStyle: "medium"},
    };
    let display: string;
    if (format === "R") {
        const seconds = Math.round((stamp.getTime() - Date.now()) / 1000);
        const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]] as const;
        const [unit, scale] = units.find(([, scale]) => Math.abs(seconds) >= scale) ?? units[units.length - 1];
        display = new Intl.RelativeTimeFormat(undefined, {numeric: "auto"}).format(Math.round(seconds / scale), unit);
    } else display = new Intl.DateTimeFormat(undefined, formatOptions[format] ?? formatOptions.f).format(stamp);
    return <time className={styles.mention} dateTime={stamp.toISOString()} title={fullTime.format(stamp)}>{display}</time>;
}

const MARKUP = /(\[\S[^\]\n]*\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>]+|`[^`\n]+`|<t:-?\d+(?::[a-zA-Z])?>|<@!?\d+>|<@&\d+>|<#\d+>|<a?:[\w]+:\d+>|\|\|.+?\|\||\*\*.+?\*\*|__.+?__|~~.+?~~|\*[^*\n]+?\*|_[^_\n]+?_)/g;

function inline(text: string, names: DiscordBody["mention_labels"], depth = 0): ReactNode[] {
    if (depth > 5) return [text];
    return text.split(MARKUP).map((token, index) => {
        const timestamp = /^<t:(-?\d+)(?::([a-zA-Z]))?>$/.exec(token);
        if (timestamp) return <DiscordTimestamp key={index} unix={timestamp[1]} format={timestamp[2]}/>;
        const mention = /^<(@!?|@&|#)(\d+)>$/.exec(token);
        if (mention) {
            const prefix = mention[1] === "#" ? "#" : "@";
            const name = names?.[(mention[1] === "@&" ? "&" : prefix) + mention[2]];
            return <span key={index} className={styles.mention}>{prefix}{name ?? (prefix === "#" ? "channel" : "unknown user")}</span>;
        }
        const emoji = /^<(a?):([\w]+):(\d+)>$/.exec(token);
        if (emoji) return <EmojiImage key={index} emoji={{id: emoji[3], name: emoji[2], animated: !!emoji[1]}}/>;
        const namedLink = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
        if (namedLink) return <ExternalLink key={index} url={namedLink[2]}>{namedLink[1]}</ExternalLink>;
        if (/^https?:\/\/\S+$/.test(token)) return <ExternalLink key={index} url={token}>{token}</ExternalLink>;
        if (token.length > 2 && token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
        for (const [marker, Tag] of [["**", "strong"], ["__", "u"], ["~~", "s"], ["*", "em"], ["_", "em"]] as const) {
            if (token.length > marker.length * 2 && token.startsWith(marker) && token.endsWith(marker)) {
                return <Tag key={index}>{inline(token.slice(marker.length, -marker.length), names, depth + 1)}</Tag>;
            }
        }
        if (token.startsWith("||") && token.endsWith("||") && token.length > 4) {
            return <details key={index} className={styles.spoiler}><summary>Spoiler</summary>{inline(token.slice(2, -2), names, depth + 1)}</details>;
        }
        return token;
    });
}

function DiscordText({text, names}: {text: string; names?: DiscordBody["mention_labels"]}) {
    return <div className={styles.discordText}>{text.split(/(```[\s\S]*?```)/g).map((block, index) => {
        if (block.startsWith("```") && block.endsWith("```")) {
            const code = block.slice(3, -3).replace(/^[\w+#-]+\r?\n/, "").replace(/^\r?\n/, "");
            return <pre key={index}><code>{code}</code></pre>;
        }
        return <Fragment key={index}>{block.split(/\r?\n/).map((line, row) => {
            const header = /^(#{1,3}) +(.+)$/.exec(line);
            if (header) return <div className={styles.markdownHeading} key={row}>{inline(header[2], names)}</div>;
            const quote = /^> ?(.*)$/.exec(line);
            if (quote) return <blockquote key={row}>{inline(quote[1], names)}</blockquote>;
            const bullet = /^\s*[-*] +(.+)$/.exec(line);
            return <div key={row}>{bullet ? <>• {inline(bullet[1], names)}</> : line ? inline(line, names) : <br/>}</div>;
        })}</Fragment>;
    })}</div>;
}

function ArchiveMedia({media, root, inlineImage = false, revealSpoiler = false}: {
    media: MediaRef; root: string; inlineImage?: boolean; revealSpoiler?: boolean;
}) {
    const [failed, setFailed] = useState(false);
    const id = media.archive_media_id;
    const filename = media.filename || media.description || "Embedded media";
    if (!revealSpoiler && filename.startsWith("SPOILER_")) return <details className={styles.media}>
        <summary>Show spoiler attachment</summary>
        <ArchiveMedia media={{...media, filename: filename.slice(8)}} root={root} inlineImage={inlineImage} revealSpoiler/>
    </details>;
    if (media.archive_media_state === "pending") return <span className={styles.mediaUnavailable}>{filename} · Archiving</span>;
    if (!id || failed || media.archive_media_state === "unavailable") return <span className={styles.mediaUnavailable}>{filename} · Unavailable</span>;
    const source = API + "/" + root + "/media/" + id;
    const image = inlineImage || media.content_type?.startsWith("image/");
    const video = media.content_type?.startsWith("video/");
    const audio = media.content_type?.startsWith("audio/");
    return <span className={styles.media}>
        {image
            // eslint-disable-next-line @next/next/no-img-element
            ? <a href={source + "?download=1"} title={"Download " + filename}><img src={source} alt={filename} loading="lazy" onError={() => setFailed(true)}/></a>
            : video ? <video controls preload="none" src={source} onError={() => setFailed(true)}/>
            : audio ? <audio controls preload="none" src={source} onError={() => setFailed(true)}/>
            : <a className={styles.file} href={source + "?download=1"} download>{filename} ↓</a>}
    </span>;
}

function RichEmbed({embed, root, names}: {embed: Embed; root: string; names?: DiscordBody["mention_labels"]}) {
    const borderColor = typeof embed.color === "number" ? "#" + (embed.color & 0xffffff).toString(16).padStart(6, "0") : undefined;
    return <section className={styles.embed} style={{borderInlineStartColor: borderColor}}>
        {embed.author?.name ? <div className={styles.embedAuthor}>
            {embed.author.archive_media_id ? <span className={styles.embedIcon}><ArchiveMedia media={embed.author} root={root} inlineImage/></span> : null}
            <ExternalLink url={embed.author.url}>{embed.author.name}</ExternalLink>
        </div> : null}
        {embed.provider?.name ? <div className={styles.embedMeta}>{embed.provider.name}</div> : null}
        {embed.thumbnail ? <div className={styles.thumbnail}><ArchiveMedia key={embed.thumbnail.archive_media_id} media={embed.thumbnail} root={root} inlineImage/></div> : null}
        {embed.title ? <strong className={styles.embedTitle}><ExternalLink url={embed.url}>{embed.title}</ExternalLink></strong> : null}
        {embed.description ? <DiscordText text={embed.description} names={names}/> : null}
        {embed.fields?.length ? <dl className={styles.fields}>{embed.fields.map((field, i) =>
            <div key={i} data-inline={!!field.inline}><dt>{field.name}</dt><dd><DiscordText text={field.value} names={names}/></dd></div>)}</dl> : null}
        {embed.image ? <ArchiveMedia key={embed.image.archive_media_id} media={embed.image} root={root} inlineImage/> : null}
        {embed.video ? <ArchiveMedia key={embed.video.archive_media_id} media={{...embed.video, content_type: "video/mp4"}} root={root}/> : null}
        {embed.footer?.text || embed.timestamp ? <footer className={styles.embedMeta}>
            {embed.footer?.archive_media_id ? <span className={styles.embedIcon}><ArchiveMedia media={embed.footer} root={root} inlineImage/></span> : null}
            {embed.footer?.text}{embed.footer?.text && embed.timestamp ? " · " : ""}
            {embed.timestamp && Number.isFinite(Date.parse(embed.timestamp)) ? fullTime.format(new Date(embed.timestamp)) : null}
        </footer> : null}
    </section>;
}

function MessageBody({body, root}: {body: DiscordBody; root: string}) {
    if (body.erased) return <p className={styles.muted}>Message content removed.</p>;
    return <>
        {body.content ? <DiscordText text={body.content} names={body.mention_labels}/> : null}
        {body.sticker_items?.map(sticker => <span className={styles.file} key={sticker.id}>{sticker.name ?? "Sticker"}</span>)}
        {body.attachments?.map((file, i) => <ArchiveMedia key={file.archive_media_id ?? i} root={root} media={file}/>)}
        {((body.flags ?? 0) & 4) === 0 ? body.embeds?.map((embed, i) => <RichEmbed key={i} embed={embed} root={root} names={body.mention_labels}/>) : null}
        {body.poll ? <div className={styles.embed}><strong>{body.poll.question?.text ?? "Poll"}</strong>
            <ul className={styles.poll}>{body.poll.answers?.map(answer => <li key={answer.answer_id}>
                {answer.poll_media?.emoji ? <EmojiImage emoji={answer.poll_media.emoji}/> : null}
                {answer.poll_media?.text} <span>{body.poll?.results?.answer_counts?.find(count => count.id === answer.answer_id)?.count ?? 0} votes</span>
            </li>)}</ul>
        </div> : null}
        {body.reactions?.length ? <div className={styles.reactions}>{body.reactions.map(({emoji, count}) =>
            <span key={emoji.id ?? emoji.name}><EmojiImage emoji={emoji}/> {count}</span>)}</div> : null}
        {!body.content && !body.embeds?.length && !body.attachments?.length && !body.poll && !body.sticker_items?.length
            ? <span className={styles.muted}>{body.type && body.type !== 0 ? "Discord system message" : "Message content unavailable"}</span> : null}
    </>;
}

function MessageHistory({root, message}: {root: string; message: ArchiveMessage}) {
    const [versions, setVersions] = useState<ArchiveRevision[]>();
    const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
    async function load() {
        if (status === "loading") return;
        setStatus("loading");
        try {
            setVersions(await readArchive<ArchiveRevision[]>(API + "/" + root + "/messages/" + message.id + "/revisions?stream=" + message.streamId));
            setStatus("idle");
        } catch { setStatus("error"); }
    }
    return <details className={styles.history} onToggle={event => {
        if (event.currentTarget.open && !versions && status === "idle") void load();
    }}>
        <summary>{message.body.last_change_kind === "embed" ? "Embed history" : "Edit history"}</summary>
        {status === "loading" ? <p role="status">Loading versions…</p> : null}
        {status === "error" ? <button type="button" onClick={() => void load()}>Retry edit history</button> : null}
        {versions?.map((version, i) => <div className={styles.version} key={i}>
            <small>{version.kind === "recovered" ? "Change detected" : "Replaced"} {fullTime.format(version.changedMs)}</small>
            <MessageBody body={version.body} root={root}/>
        </div>)}
        {versions?.length === 0 ? <p className={styles.muted}>Earlier versions are unavailable.</p> : null}
    </details>;
}

function Avatar({body}: {body: DiscordBody}) {
    const [failed, setFailed] = useState(false);
    const avatar = body.author?.avatar;
    const id = body.author?.id;
    const url = id && /^\d+$/.test(id) && avatar && /^(a_)?[0-9a-f]{32}$/.test(avatar)
        ? "https://cdn.discordapp.com/avatars/" + id + "/" + avatar + ".webp?size=80" : undefined;
    // eslint-disable-next-line @next/next/no-img-element
    return url && !failed ? <img className={styles.avatar} src={url} alt="" loading="lazy" onError={() => setFailed(true)}/>
        : <span className={styles.avatar} aria-hidden="true">{authorName(body).slice(0, 2).toUpperCase()}</span>;
}

export function ArchiveMessageRow({message, root, grouped, active, thread, replyMessage}: {
    message: ArchiveMessage; root: string; grouped: boolean; active: boolean; thread?: ArchiveStream; replyMessage?: ArchiveMessage;
}) {
    const body = message.body;
    const date = new Date(message.sentMs);
    const reply = body.message_reference;
    const edited = body.last_change_ms ?? (body.edited_timestamp ? Date.parse(body.edited_timestamp) : undefined);
    const deleted = message.deletedMs != null;
    const link = archiveLink(root, message.streamId, message.id);
    return <article id={"archive-message-" + message.id} className={styles.message} data-active={active} data-grouped={grouped} tabIndex={active ? -1 : undefined}>
        {!grouped ? <Avatar key={body.author?.id ?? authorName(body)} body={body}/> : <time className={styles.groupedTime} title={fullTime.format(date)}>{shortTime.format(date)}</time>}
        <div className={styles.messageMain}>
            {reply?.message_id ? <a className={styles.reply} href={archiveLink(root, reply.channel_id ? "d" + reply.channel_id : message.streamId, reply.message_id)}>
                ↪ {replyMessage && !replyMessage.deletedMs && !replyMessage.body.erased
                    ? authorName(replyMessage.body) + " · " + (replyMessage.body.content?.split("\n", 1)[0].slice(0, 100) || "Message")
                    : "Reply to message"}
            </a> : null}
            {!grouped ? <div className={styles.messageHeading}>
                <strong>{authorName(body)}</strong>
                {body.author?.bot ? <span className={styles.bot}>APP</span> : null}
                <a href={link} title={fullTime.format(date)}><time dateTime={date.toISOString()}>{messageTime(date)}</time></a>
            </div> : null}
            {deleted ? <details className={styles.deleted}>
                <summary>Message deleted · {message.deletedRecovered ? "Detected" : "Recorded"} {fullTime.format(message.deletedMs!)}</summary>
                <MessageBody key={"body-" + body.last_change_ms} body={body} root={root}/>
                {body.last_change_ms != null ? <MessageHistory key={"history-" + body.last_change_ms} message={message} root={root}/> : null}
            </details> : <>
                <MessageBody key={"body-" + body.last_change_ms} body={body} root={root}/>
                {edited != null && Number.isFinite(edited) ? <span className={styles.edited} title={fullTime.format(edited)}>
                    {body.last_change_kind === "recovered" ? "Change detected" : body.last_change_kind === "embed" ? "Embed updated" : "Edited"} {shortTime.format(edited)}
                </span> : null}
                {body.last_change_ms != null ? <MessageHistory key={"history-" + body.last_change_ms} message={message} root={root}/> : null}
            </>}
            {thread ? <a className={styles.threadLink} href={archiveLink(root, thread.id)}>↳ Open {thread.title}</a> : null}
        </div>
    </article>;
}

