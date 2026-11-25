"use client";

import {useState, type CSSProperties} from "react";
import {authorName, type ArchiveAuthor, type ArchiveStream} from "./archive";
import styles from "./mentorship-channels.module.css";

export function ParticipantName({role, children}: {role: "mentee" | "mentor"; children: string}) {
    return <span className={styles.participant} data-participant={role}>{children}</span>;
}

function DiscordRoleName({color, children}: {color?: string; children: string}) {
    return color && /^#[0-9a-f]{6}$/i.test(color)
        ? <span className={styles.participant} data-participant="discord" style={{"--discord-role-color": color} as CSSProperties}>{children}</span>
        : children;
}

export function MenteeName({channel, children}: {channel: ArchiveStream; children: string}) {
    if (channel.mentorshipState === "waitlisted") return children;
    if (channel.mentorshipState === "passed") {
        return <DiscordRoleName color={channel.menteeColor}>{children}</DiscordRoleName>;
    }
    return <ParticipantName role="mentee">{children}</ParticipantName>;
}

export function AuthorName({author, channel}: {author?: ArchiveAuthor; channel: ArchiveStream}) {
    const name = authorName({author});
    const id = author?.id;
    if (id && id === channel.menteeId) return <MenteeName channel={channel}>{name}</MenteeName>;
    if (id && id === channel.mentorId) return <ParticipantName role="mentor">{name}</ParticipantName>;
    if (author?.archive_role === "mentor" || author?.archive_role === "mentee") {
        return <ParticipantName role={author.archive_role}>{name}</ParticipantName>;
    }
    return <DiscordRoleName color={author?.archive_role_color}>{name}</DiscordRoleName>;
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
