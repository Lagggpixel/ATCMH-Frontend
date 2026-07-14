export interface PolicyConsentDocument {
    version: string;
    url: string;
}

export interface PolicyConsentContext {
    application: "dashboard" | "exams";
    expiresAt: string;
    csrfToken: string;
    terms: PolicyConsentDocument;
    privacy: PolicyConsentDocument;
}
