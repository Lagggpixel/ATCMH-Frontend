import assert from "node:assert/strict";
import test from "node:test";
import {
    formatSenderRoleBadge,
    MAX_CHAT_ATTACHMENT_BYTES,
    mergeChatMessages,
    shouldShowGroundSchoolChat,
    validateChatImageFile,
    type ChatMessage,
} from "./ground-school-chat-client";

const sampleMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
    id: 1,
    learnerDiscordId: "111",
    discordThreadId: "999",
    discordMessageId: "m-1",
    source: "WEBSITE",
    senderRole: "LEARNER",
    authorDiscordId: "111",
    authorDisplayName: "CaptainReid",
    authorAvatarUrl: null,
    content: "Hello",
    createdAt: "2026-11-23T12:00:00Z",
    editedAt: null,
    deleted: false,
    attachments: [],
    ...overrides,
});

test("Ground School support chat appears on Ground School pages and course-linked quizzes only", () => {
    assert.equal(shouldShowGroundSchoolChat("/ground-school", null), true);
    assert.equal(shouldShowGroundSchoolChat("/ground-school/course-123", null), true);
    assert.equal(shouldShowGroundSchoolChat("/exams/quizzes/quiz-1", "course-123"), true);
    assert.equal(shouldShowGroundSchoolChat("/exams/quizzes/quiz-1/attempt", "course-123"), true);
    assert.equal(shouldShowGroundSchoolChat("/exams/quizzes/quiz-1", null), false);
    assert.equal(shouldShowGroundSchoolChat("/exams", null), false);
    assert.equal(shouldShowGroundSchoolChat("/", null), false);
});

test("image attachment validator enforces allowed types and 8 MB limit", () => {
    assert.equal(validateChatImageFile({type: "image/png", size: 1024, name: "shot.png"}), null);
    assert.equal(validateChatImageFile({type: "image/jpeg", size: MAX_CHAT_ATTACHMENT_BYTES, name: "shot.jpg"}), null);
    assert.match(validateChatImageFile({type: "image/png", size: MAX_CHAT_ATTACHMENT_BYTES + 1, name: "huge.png"}) ?? "", /8 MB/);
    assert.match(validateChatImageFile({type: "application/pdf", size: 100, name: "doc.pdf"}) ?? "", /PNG, JPEG, WEBP, and GIF/);
    assert.match(validateChatImageFile({type: "image/png", size: 0, name: "empty.png"}) ?? "", /empty/);
});

test("mergeChatMessages deduplicates, preserves older history, and applies edits and deletions", () => {
    const existing = [
        sampleMessage({id: 1, content: "Older message"}),
        sampleMessage({id: 2, senderRole: "MENTOR", content: "Original reply"}),
    ];
    const incoming = [
        sampleMessage({id: 2, senderRole: "MENTOR", content: "Edited reply", editedAt: "2026-11-23T12:05:00Z"}),
        sampleMessage({id: 3, senderRole: "MODERATOR", content: "", deleted: true}),
    ];
    const merged = mergeChatMessages(existing, incoming);
    assert.deepEqual(merged.map(m => m.id), [1, 2, 3]);
    assert.equal(merged[0].content, "Older message");
    assert.equal(merged[1].content, "Edited reply");
    assert.equal(merged[1].editedAt, "2026-11-23T12:05:00Z");
    assert.equal(merged[2].deleted, true);
});

test("role badges format staff roles cleanly and omit learner/system", () => {
    assert.equal(formatSenderRoleBadge("MENTOR"), "Mentor");
    assert.equal(formatSenderRoleBadge("MODERATOR"), "Mod");
    assert.equal(formatSenderRoleBadge("ADMIN"), "Admin");
    assert.equal(formatSenderRoleBadge("LEARNER"), null);
    assert.equal(formatSenderRoleBadge("SYSTEM"), null);
});
