"use client";

import {useEffect, useId, useRef, useState} from "react";
import {XIcon} from "@phosphor-icons/react";
import {AuthorName, Avatar} from "./ArchiveIdentity";
import {API, ArchiveError, readArchive, type ArchiveMessage, type ArchiveReaction, type ArchiveStream, type Emoji, type ReactionKind, type ReactionPage} from "./archive";
import styles from "./mentorship-channels.module.css";

export function EmojiImage({emoji}: {emoji: Emoji}) {
    if (!/^\d{1,20}$/.test(emoji.id ?? "")) return <>{emoji.name}</>;
    const label = ":" + (emoji.name || "emoji") + ":";
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.emoji} src={"https://cdn.discordapp.com/emojis/" + emoji.id + (emoji.animated ? ".gif" : ".webp") + "?size=48"} alt={label} title={label} loading="lazy"/>;
}

const emojiKey = (emoji: Emoji) => emoji.id || emoji.name || "";
const emojiLabel = (emoji: Emoji) => emoji.id ? ":" + (emoji.name || "custom emoji") + ":" : emoji.name || "emoji";

export function ReactionSummary({reactions}: {reactions?: ArchiveReaction[]}) {
    if (!reactions?.length) return null;
    return <div className={styles.reactions}>{reactions.map(({emoji, count}) =>
        <span className={styles.reactionChip} key={emojiKey(emoji)}><EmojiImage emoji={emoji}/> {count}</span>)}</div>;
}

export function MessageReactions({message, channel}: {message: ArchiveMessage; channel: ArchiveStream}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const title = useId();
    const [selected, setSelected] = useState<{key: string; kind: ReactionKind}>();
    const reactions = message.body.reactions?.filter(({emoji, count}) => emojiKey(emoji) && count > 0) ?? [];
    const current = reactions.find(({emoji}) => emojiKey(emoji) === selected?.key);
    const normal = current?.count_details?.normal ?? current?.count ?? 0;
    const burst = current?.count_details?.burst ?? 0;
    const activeKind = burst && (!normal || selected?.kind === "burst") ? "burst" : "normal";

    function select(reaction: ArchiveReaction) {
        setSelected({key: emojiKey(reaction.emoji), kind: "normal"});
    }

    if (message.body.erased || (!reactions.length && !selected)) return null;
    return <>
        <div className={styles.reactions} aria-label="Message reactions">
            {reactions.map(reaction => <button key={emojiKey(reaction.emoji)} type="button" className={styles.reactionChip}
                aria-haspopup="dialog" aria-label={`View ${emojiLabel(reaction.emoji)} reactions (${reaction.count})`}
                onClick={() => { select(reaction); dialog.current?.showModal(); }}>
                <EmojiImage emoji={reaction.emoji}/> {reaction.count}
            </button>)}
        </div>
        <dialog ref={dialog} className={styles.reactionDialog} aria-labelledby={title} onClose={() => setSelected(undefined)}>
            <div className={styles.reactionPanel}>
                <header className={styles.reactionHeader}>
                    <h3 id={title}>Reactions</h3>
                    <button className={styles.iconButton} type="button" aria-label="Close reactions" onClick={() => dialog.current?.close()}>
                        <XIcon size={20} aria-hidden="true"/>
                    </button>
                </header>
                <div className={styles.reactionChoices} role="group" aria-label="Filter by emoji">
                    {reactions.map(reaction => <button key={emojiKey(reaction.emoji)} type="button" className={styles.reactionChip}
                        aria-pressed={emojiKey(reaction.emoji) === selected?.key} aria-label={`${emojiLabel(reaction.emoji)} (${reaction.count})`}
                        onClick={() => select(reaction)}><EmojiImage emoji={reaction.emoji}/> {reaction.count}</button>)}
                </div>
                {selected && normal > 0 && burst > 0 ?
                    <div className={styles.reactionKinds} role="group" aria-label="Reaction type">
                        {(["normal", "burst"] as const).map(kind => <button type="button" key={kind}
                            aria-pressed={activeKind === kind} onClick={() => setSelected({...selected, kind})}>
                            {kind === "normal" ? "Standard" : "Super"} <span>{kind === "normal" ? normal : burst}</span>
                        </button>)}
                    </div> : null}
                {selected && current ? (message.deletedMs != null || channel.kind === "legacy"
                    ? <p className={styles.reactionStatus}>Only the reaction count was saved for this message.</p>
                    : <ReactionRoster key={selected.key + ":" + activeKind} channel={channel} message={message} emoji={selected.key} kind={activeKind}/>)
                    : selected ? <p className={styles.reactionStatus}>This reaction is no longer on the message.</p> : null}
            </div>
        </dialog>
    </>;
}

function ReactionRoster({channel, message, emoji, kind}: {channel: ArchiveStream; message: ArchiveMessage; emoji: string; kind: ReactionKind}) {
    const [page, setPage] = useState<ReactionPage>({users: []});
    const [request, setRequest] = useState<{after?: string}>({});
    const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "error">("loading");

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({stream: message.streamId, emoji, kind});
        if (request.after) params.set("after", request.after);
        const url = `${API}/${channel.id}/messages/${message.id}/reactions?${params}`;
        void readArchive<ReactionPage>(url, controller.signal).then(result => {
            if (controller.signal.aborted) return;
            setPage(previous => ({
                users: [...new Map([...(request.after ? previous.users : []), ...result.users].map(user => [user.id, user])).values()],
                next: result.next !== request.after ? result.next : undefined,
            }));
            setStatus("ready");
        }).catch((problem: unknown) => {
            if (controller.signal.aborted) return;
            if (problem instanceof ArchiveError && [401, 403, 404].includes(problem.status)) {
                setPage({users: []});
                setStatus("unavailable");
            } else setStatus("error");
        });
        return () => controller.abort();
    }, [channel.id, emoji, kind, message.id, message.streamId, request]);

    function load(after?: string) {
        setStatus("loading");
        setRequest({after});
    }

    return <div className={styles.reactionRoster}>
        {page.users.length ? <ul aria-label="People who reacted">{page.users.map(user => <li key={user.id}>
            <Avatar author={user}/><span className={styles.authorLabel}><AuthorName author={user} channel={channel}/></span>
            {user.bot ? <span className={styles.bot}>APP</span> : null}
        </li>)}</ul> : null}
        {status === "loading" ? <p className={styles.reactionStatus} role="status">Loading people…</p> : null}
        {status === "unavailable" ? <p className={styles.reactionStatus} role="status">The list of people is unavailable for this reaction.</p> : null}
        {status === "error" ? <p className={styles.reactionStatus} role="alert">Couldn’t load reactions. <button type="button" onClick={() => load(request.after)}>Retry</button></p> : null}
        {status === "ready" && !page.users.length && !page.next ? <p className={styles.reactionStatus}>No people to show for this reaction.</p> : null}
        {status === "ready" && page.next ? <button className={styles.reactionMore} type="button" onClick={() => load(page.next)}>Show more</button> : null}
    </div>;
}
