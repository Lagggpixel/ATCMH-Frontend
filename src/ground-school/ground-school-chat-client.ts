import type {CourseEnrollment, GroundSchoolStatus} from "@/src/dashboard/types/Course";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";

export const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 4;
export const ALLOWED_CHAT_IMAGE_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]);

export interface ChatAttachmentSummary {
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    url: string;
    image: boolean;
}

export interface ChatMessage {
    id: number;
    learnerDiscordId: string;
    discordThreadId: string;
    discordMessageId: string | null;
    source: "WEBSITE" | "DISCORD" | "SYSTEM";
    senderRole: "LEARNER" | "MENTOR" | "MODERATOR" | "ADMIN" | "SYSTEM";
    authorDiscordId: string | null;
    authorDisplayName: string;
    authorAvatarUrl: string | null;
    content: string;
    createdAt: string;
    editedAt: string | null;
    deleted: boolean;
    attachments: ChatAttachmentSummary[];
}

export interface ChatThreadInfo {
    id: string;
    locked: boolean;
    archived: boolean;
    deleted: boolean;
}

export interface ChatStateResponse {
    enrolled: boolean;
    inDiscord: boolean;
    discordUnavailable?: boolean;
    hasIfc?: boolean;
    ifcName?: string | null;
    thread?: ChatThreadInfo | null;
    messages: ChatMessage[];
    hasMore: boolean;
    unreadCount: number;
}

export interface EnrollResponse {
    enrolled: boolean;
    alreadyEnrolled: boolean;
    enrollment: CourseEnrollment;
    thread?: {id: string; locked: boolean; archived: boolean};
}

export class GroundSchoolApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string | undefined,
        message: string,
    ) {
        super(message);
        this.name = "GroundSchoolApiError";
    }
}

export const GROUND_SCHOOL_ENROLLED_EVENT = "atcmh:ground-school-enrolled";

export function dispatchGroundSchoolEnrolled() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(GROUND_SCHOOL_ENROLLED_EVENT));
    }
}

export function shouldShowGroundSchoolChat(pathname: string, courseIdParam: string | null): boolean {
    if (pathname === "/ground-school" || pathname.startsWith("/ground-school/")) {
        return true;
    }
    if (pathname.startsWith("/exams/quizzes/") && Boolean(courseIdParam?.trim())) {
        return true;
    }
    return false;
}

export function validateChatImageFile(file: Pick<File, "type" | "size" | "name">): string | null {
    if (!ALLOWED_CHAT_IMAGE_TYPES.has(file.type.toLowerCase())) {
        return "Only PNG, JPEG, WEBP, and GIF images are supported.";
    }
    if (file.size <= 0) {
        return "Image file is empty.";
    }
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        return "Images must be 8 MB or smaller.";
    }
    return null;
}

export function formatSenderRoleBadge(role: ChatMessage["senderRole"]): string | null {
    switch (role) {
        case "MENTOR": return "Mentor";
        case "MODERATOR": return "Mod";
        case "ADMIN": return "Admin";
        default: return null;
    }
}

export function mergeChatMessages(existing: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
    const byId = new Map<number, ChatMessage>();
    for (const msg of existing) byId.set(msg.id, msg);
    for (const msg of incoming) byId.set(msg.id, msg);
    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

async function parseError(response: Response): Promise<GroundSchoolApiError> {
    const body = await response.json().catch(() => ({})) as {error?: string; code?: string};
    return new GroundSchoolApiError(
        response.status,
        typeof body.code === "string" ? body.code : undefined,
        typeof body.error === "string" && body.error.trim()
            ? body.error
            : `Request failed with status ${response.status}.`,
    );
}

export async function getGroundSchoolStatus(refresh = false): Promise<GroundSchoolStatus> {
    const response = await fetch(`${ApiUtils.apiOrigin}/ground-school/status${refresh ? "?refresh=true" : ""}`, {
        credentials: "include",
        cache: "no-store",
    });
    if (!response.ok) throw await parseError(response);
    const body = await response.json() as {groundSchool: GroundSchoolStatus};
    return body.groundSchool;
}

export async function enrollInGroundSchoolCourse(courseId: string, csrfToken: string): Promise<EnrollResponse> {
    const response = await fetch(`${ApiUtils.apiOrigin}/courses/${encodeURIComponent(courseId)}/enroll`, {
        method: "POST",
        credentials: "include",
        headers: {
            "X-CSRF-Token": csrfToken,
            "Content-Type": "application/json",
        },
        body: "{}",
    });
    if (!response.ok) throw await parseError(response);
    return response.json() as Promise<EnrollResponse>;
}

export async function fetchGroundSchoolChat(beforeId?: number): Promise<ChatStateResponse> {
    const query = beforeId ? `?beforeId=${encodeURIComponent(String(beforeId))}` : "";
    const response = await fetch(`${ApiUtils.apiOrigin}/ground-school/chat${query}`, {
        credentials: "include",
        cache: "no-store",
    });
    if (!response.ok) throw await parseError(response);
    return response.json() as Promise<ChatStateResponse>;
}

export async function uploadGroundSchoolChatAttachment(file: File, csrfToken: string): Promise<ChatAttachmentSummary> {
    const validation = validateChatImageFile(file);
    if (validation) throw new GroundSchoolApiError(400, "INVALID_IMAGE", validation);
    const filename = encodeURIComponent(file.name || "screenshot.png");
    const response = await fetch(`${ApiUtils.apiOrigin}/ground-school/chat/attachments?filename=${filename}`, {
        method: "POST",
        credentials: "include",
        headers: {
            "X-CSRF-Token": csrfToken,
            "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
    });
    if (!response.ok) throw await parseError(response);
    const body = await response.json() as {attachment: ChatAttachmentSummary};
    return body.attachment;
}

export async function sendGroundSchoolChatMessage(
    content: string,
    attachmentIds: readonly string[],
    csrfToken: string,
): Promise<ChatMessage> {
    const response = await fetch(`${ApiUtils.apiOrigin}/ground-school/chat/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
            "X-CSRF-Token": csrfToken,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({content, attachmentIds}),
    });
    if (!response.ok) throw await parseError(response);
    const body = await response.json() as {message: ChatMessage};
    return body.message;
}

export async function markGroundSchoolChatRead(lastMessageId: number, csrfToken: string): Promise<number> {
    const response = await fetch(`${ApiUtils.apiOrigin}/ground-school/chat/read`, {
        method: "POST",
        credentials: "include",
        headers: {
            "X-CSRF-Token": csrfToken,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({lastMessageId}),
    });
    if (!response.ok) throw await parseError(response);
    const body = await response.json() as {unreadCount?: number};
    return body.unreadCount ?? 0;
}
