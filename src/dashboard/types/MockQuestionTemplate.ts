export interface MockQuestionAttachment {
    id: number;
    filename: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
}

export interface MockQuestionTemplate {
    id: number;
    questionText: string;
    sortOrder: number;
    modelAnswer: string | null;
    active: boolean;
    attachments: MockQuestionAttachment[];
}

export interface MockQuestionAttachmentPayload {
    id?: number;
    filename: string;
    contentType: string;
    dataBase64?: string;
}

export interface MockQuestionTemplatePayload {
    questionText: string;
    sortOrder: number;
    modelAnswer: string | null;
    attachments: MockQuestionAttachmentPayload[];
}

export interface MockQuestionDraft extends MockQuestionTemplatePayload {
    id?: number;
}

export interface MockQuestionBank {
    id: number;
    name: string;
    questions: MockQuestionTemplate[];
}

export type MockQuestionSlot =
    | {kind: "BANK"; bankId: number; question?: null}
    | {kind: "MANUAL"; bankId?: null; question: MockQuestionDraft};

export interface MockQuestionWorkflow {
    revision: number;
    banks: MockQuestionBank[];
    sequence: MockQuestionSlot[];
}
