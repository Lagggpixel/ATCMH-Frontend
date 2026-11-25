export const API = "/api/dashboard/admin/mentorship-channels";
export const ROUTE = "/dashboard/mentorship-channels";

export interface ArchiveStream {
    id: string;
    rootId: string;
    discordId?: string;
    title: string;
    kind: "channel" | "thread" | "legacy";
    menteeName?: string;
    mentorName?: string;
    menteeId?: string;
    mentorId?: string;
    parentMessageId?: string;
    state: "importing" | "ready" | "closed" | "unavailable";
    syncedMs?: number;
    gap: boolean;
}

export interface MediaRef {
    archive_media_id?: string;
    archive_media_state?: "pending" | "saved" | "unavailable";
    filename?: string;
    description?: string;
    content_type?: string;
    width?: number;
    height?: number;
}

export interface Embed {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    timestamp?: string;
    author?: MediaRef & {name?: string; url?: string};
    footer?: MediaRef & {text?: string};
    image?: MediaRef;
    thumbnail?: MediaRef;
    video?: MediaRef;
    provider?: {name?: string; url?: string};
    fields?: {name: string; value: string; inline?: boolean}[];
}

export interface Emoji {
    id?: string;
    name?: string;
    animated?: boolean;
}

export interface DiscordBody {
    author?: {id?: string; display_name?: string; global_name?: string; username?: string; avatar?: string; discriminator?: string; bot?: boolean};
    content?: string;
    type?: number;
    flags?: number;
    mention_labels?: Record<string, string>;
    embeds?: Embed[];
    attachments?: MediaRef[];
    sticker_items?: {id?: string; name?: string; format_type?: number}[];
    message_reference?: {message_id?: string; channel_id?: string};
    edited_timestamp?: string;
    last_change_ms?: number;
    last_change_kind?: "edit" | "embed" | "recovered";
    reactions?: {count: number; emoji: Emoji}[];
    poll?: {
        question?: {text?: string};
        answers?: {answer_id: number; poll_media?: {text?: string; emoji?: Emoji}}[];
        results?: {answer_counts?: {id: number; count: number}[]};
    };
    erased?: boolean;
}

export interface ArchiveMessage {
    id: string;
    streamId: string;
    sentMs: number;
    deletedMs?: number;
    deletedRecovered?: boolean;
    body: DiscordBody;
}

export interface ArchiveRevision {
    changedMs: number;
    kind: string;
    body: DiscordBody;
}

export interface ArchivePage {messages: ArchiveMessage[]; older?: string}
export interface ArchiveConversation {channel: ArchiveStream; streams: ArchiveStream[]}
export interface ArchiveLocation {root?: string; stream?: string; message?: string}
export type RangePreset = "14" | "30" | "60" | "90" | "all" | "custom";
export interface ArchiveRange {preset: RangePreset; start: string; end: string}

export function archiveRange(range: ArchiveRange, now = new Date()): URLSearchParams | null {
    if (range.preset === "all") return new URLSearchParams();
    let start: Date;
    let end: Date;
    if (range.preset === "custom") {
        if (!range.start || !range.end || range.start > range.end) return null;
        start = new Date(range.start + "T00:00:00");
        end = new Date(range.end + "T00:00:00");
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > now) return null;
    } else {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(range.preset) + 1);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    end.setDate(end.getDate() + 1);
    return new URLSearchParams({from: start.toISOString(), until: end.toISOString()});
}

export function archiveLink(root: string, stream?: string, message?: string) {
    const hash = new URLSearchParams({channel: root});
    if (stream && stream !== root) hash.set("thread", stream);
    if (message) hash.set("message", message);
    return ROUTE + "#" + hash.toString();
}

export function archiveLocation(hash: string): ArchiveLocation {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const read = (key: string, pattern: RegExp) => {
        const value = params.get(key);
        return value && pattern.test(value) ? value : undefined;
    };
    const stream = /^(d\d{1,20}|a[0-9a-f]{64})$/;
    return {root: read("channel", stream), stream: read("thread", stream), message: read("message", /^\d{1,20}$/)};
}

export class ArchiveError extends Error {
    constructor(readonly status: number) { super("The archive request failed."); }
}

export async function readArchive<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, {signal, cache: "no-store"});
    if (!response.ok) throw new ArchiveError(response.status);
    return response.json() as Promise<T>;
}

export function authorName(body: DiscordBody) {
    const name = body.author?.display_name || body.author?.global_name || body.author?.username || "";
    return withoutDefaultDiscriminator(name) || "Unknown author";
}

export function channelNames(channel: ArchiveStream) {
    const mentee = withoutDefaultDiscriminator(channel.menteeName?.trim() ?? "");
    const name = withoutDefaultDiscriminator(channel.mentorName?.trim() ?? "");
    const mentor = name && !/^(unknown mentor|n\/a)$/i.test(name) ? name : undefined;
    const title = mentee ? `${mentee} - ${mentor ?? "N/A"}` : channel.title.replace(/ - Unknown mentor$/i, " - N/A");
    return {mentee, mentor, title};
}

function withoutDefaultDiscriminator(name: string) {
    return name.replace(/#0000$/, "");
}

