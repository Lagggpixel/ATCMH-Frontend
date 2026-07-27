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
