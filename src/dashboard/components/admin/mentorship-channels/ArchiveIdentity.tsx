"use client";

import {useState} from "react";
import {authorName, type ArchiveAuthor, type ArchiveStream} from "./archive";
import styles from "./mentorship-channels.module.css";

export function ParticipantName({role, children}: {role: "mentee" | "mentor"; children: string}) {
    return <span className={styles.participant} data-participant={role}>{children}</span>;
}

export function AuthorName({author, channel}: {author?: ArchiveAuthor; channel: ArchiveStream}) {
    const name = authorName({author});
    const id = author?.id;
    if (id && id === channel.menteeId) return <ParticipantName role="mentee">{name}</ParticipantName>;
    if (id && id === channel.mentorId) return <ParticipantName role="mentor">{name}</ParticipantName>;
    return name;
}

export function Avatar({author}: {author?: ArchiveAuthor}) {
    const [failed, setFailed] = useState<string[]>([]);
    const avatar = author?.avatar;
    const id = author?.id;
    let url: string | undefined;
    if (id && /^[1-9]\d{0,19}$/.test(id)) {
        const discriminator = Number(author.discriminator);
        const index = Number.isInteger(discriminator) && discriminator > 0
            ? discriminator % 5 : Number((BigInt(id) >> BigInt(22)) % BigInt(6));
        const fallback = `https://cdn.discordapp.com/embed/avatars/${index}.png`;
        const custom = avatar && /^(a_)?[0-9a-f]{32}$/.test(avatar)
            ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.webp?size=80` : undefined;
        url = custom && !failed.includes(custom) ? custom : !failed.includes(fallback) ? fallback : undefined;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return url ? <img className={styles.avatar} src={url} alt="" loading="lazy" referrerPolicy="no-referrer"
        onError={() => setFailed(previous => [...previous, url])}/>
        : <span className={styles.avatar} aria-hidden="true">{authorName({author}).slice(0, 2).toUpperCase()}</span>;
}
