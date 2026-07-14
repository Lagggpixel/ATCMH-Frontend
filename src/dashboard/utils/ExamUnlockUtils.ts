import type {AtcmhUser} from "../types/AtcmhUser.ts";
import type {ExamQuizUnlock} from "../types/Exam.ts";

const DISCORD_ID = /^\d{15,20}$/;

export const isDiscordId = (value: string) => DISCORD_ID.test(value.trim());

export const isAlreadyUnlocked = (unlocks: ExamQuizUnlock[], discordId: string) =>
    unlocks.some(unlock => unlock.discordId === discordId.trim());

export const isCurrentUnlockListRequest = (
    requestVersion: number,
    activeVersion: number,
    requestQuizId: string,
    selectedQuizId: string
) => requestVersion === activeVersion && requestQuizId === selectedQuizId;

export const filterUnlockCandidates = (users: AtcmhUser[], unlocks: ExamQuizUnlock[], query: string) => {
    const normalized = query.trim().toLowerCase();
    const unlockedIds = new Set(unlocks.map(unlock => unlock.discordId));
    if (!normalized) return [];
    return users.filter(user => !unlockedIds.has(user.id) && [user.username, user.id].some(value => value.toLowerCase().includes(normalized))).slice(0, 8);
};

export const applyConfirmedUnlockUpdate = (unlocks: ExamQuizUnlock[], update: ExamQuizUnlock, unlocked: boolean) => unlocked
    ? [...unlocks.filter(item => item.discordId !== update.discordId), update].sort((left, right) => (left.userName ?? left.discordId).localeCompare(right.userName ?? right.discordId))
    : unlocks.filter(item => item.discordId !== update.discordId);
