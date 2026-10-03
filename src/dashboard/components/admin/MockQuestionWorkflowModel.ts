import type {MockQuestionAttachmentPayload, MockQuestionBank, MockQuestionDraft, MockQuestionSlot, MockQuestionTemplate} from "../../types/MockQuestionTemplate";

export const emptyMockQuestion = (): MockQuestionDraft => ({questionText: "", sortOrder: 1, modelAnswer: null, attachments: []});

export function questionDraft(question: MockQuestionTemplate | MockQuestionDraft): MockQuestionDraft {
    return {id: question.id, questionText: question.questionText, sortOrder: question.sortOrder,
        modelAnswer: question.modelAnswer ?? null,
        attachments: question.attachments.map(attachment => ({id: attachment.id, filename: attachment.filename,
            contentType: attachment.contentType, ...("dataBase64" in attachment ? {dataBase64: attachment.dataBase64} : {})}))};
}

export function questionError(question: MockQuestionDraft): string | undefined {
    if (!question.questionText.trim()) return "Question text is required";
    if (question.questionText.trim().length > 2000) return "Question text must be 2000 characters or fewer";
    if ((question.modelAnswer?.trim().length ?? 0) > 8000) return "Model answer must be 8000 characters or fewer";
    return undefined;
}

export function bankUsage(sequence: MockQuestionSlot[]): Map<number, number> {
    const usage = new Map<number, number>();
    for (const slot of sequence) if (slot.kind === "BANK") usage.set(slot.bankId, (usage.get(slot.bankId) ?? 0) + 1);
    return usage;
}

export function setupErrors(sequence: MockQuestionSlot[], banks: MockQuestionBank[]): (string | undefined)[] {
    const byId = new Map(banks.map(bank => [bank.id, bank]));
    const usage = bankUsage(sequence);
    return sequence.map(slot => {
        if (slot.kind === "MANUAL") return questionError(slot.question);
        const bank = byId.get(slot.bankId);
        if (!bank) return "Question bank is unavailable";
        if (!bank.questions.length) return "At least 1 question required in this bank";
        if ((usage.get(bank.id) ?? 0) > bank.questions.length) return `Only ${bank.questions.length} questions available`;
        return undefined;
    });
}

export function bankCountError(value: number, remaining: number): string | undefined {
    if (!Number.isSafeInteger(value) || value < 1) return "Select at least 1 question";
    if (value > remaining) return `Only ${remaining} question${remaining === 1 ? "" : "s"} remaining`;
    return undefined;
}

export async function mockFilePayloads(files: File[], current: MockQuestionAttachmentPayload[]) {
    if (files.length + current.length > 3) throw new Error("A question can have at most three attachments");
    const currentBytes = current.reduce((sum, attachment) => sum + (attachment.dataBase64 ? decodedSize(attachment.dataBase64) : 0), 0);
    if (currentBytes + files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) throw new Error("Attachments exceed the 10 MB total limit");
    for (const file of files) if (file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error("Each attachment must be between 1 byte and 8 MB");
    return Promise.all(files.map(file => new Promise<MockQuestionAttachmentPayload>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.onload = () => resolve({filename: file.name, contentType: file.type || "application/octet-stream", dataBase64: String(reader.result).split(",")[1]});
        reader.readAsDataURL(file);
    })));
}

function decodedSize(encoded: string) { return encoded.length * 3 / 4 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0); }
