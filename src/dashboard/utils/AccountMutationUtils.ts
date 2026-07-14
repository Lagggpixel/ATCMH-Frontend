import type {AccountDetail, AccountIdentity, AdminMutationPreview, AdminMutationRequest, AdminOperation, IdentityProvider} from "../types/Account.ts";

export interface MutationDraft {
    operation: AdminOperation;
    sourceAccountId: string;
    targetAccountId: string;
    provider: "DISCORD" | "IFC";
    subject: string;
    displayName: string;
    suspensionUntil: string;
    discordSubject: string;
    ifcSubject: string;
}

export const createMutationDraft = (accountId = ""): MutationDraft => ({operation: "LINK", sourceAccountId: accountId, targetAccountId: "", provider: "DISCORD", subject: "", displayName: "", suspensionUntil: "", discordSubject: "", ifcSubject: ""});

export interface MutationUiState {draft: MutationDraft; preview: AdminMutationPreview | null; reason: string}
export type MutationUiAction = {type: "EDIT_DRAFT"; patch: Partial<MutationDraft>} | {type: "SELECT_ACCOUNT"; accountId: string} |
    {type: "PREVIEW_RECEIVED"; preview: AdminMutationPreview} | {type: "SET_REASON"; reason: string} | {type: "CANCEL_PREVIEW"};
export const createMutationUiState = (accountId = ""): MutationUiState => ({draft: createMutationDraft(accountId), preview: null, reason: ""});
export const mutationUiReducer = (state: MutationUiState, action: MutationUiAction): MutationUiState => {
    switch (action.type) {
        case "EDIT_DRAFT": {
            const targetChanged = action.patch.targetAccountId != null && action.patch.targetAccountId !== state.draft.targetAccountId;
            return {draft: {...state.draft, ...action.patch, ...(targetChanged ? {discordSubject: "", ifcSubject: ""} : {})}, preview: null, reason: ""};
        }
        case "SELECT_ACCOUNT": return createMutationUiState(action.accountId);
        case "PREVIEW_RECEIVED": return {...state, preview: action.preview, reason: ""};
        case "SET_REASON": return {...state, reason: action.reason};
        case "CANCEL_PREVIEW": return {...state, preview: null, reason: ""};
    }
};

export interface MergeIdentityOption {value: string; label: string; accountId?: string}
const identitySubject = (identity: AccountIdentity) => identity.providerSubject ?? identity.subject;
export const mergeIdentityOptions = (source: AccountDetail, target: AccountDetail | null, provider: IdentityProvider): MergeIdentityOption[] => {
    const identities = [source, target].filter((account): account is AccountDetail => account != null)
        .flatMap(account => account.identities.filter(identity => identity.active !== false && String(identity.provider).toLowerCase() === provider)
            .map(identity => ({value: identitySubject(identity), label: `${identity.displayName || identitySubject(identity)} — account ${account.id}`, accountId: account.id})));
    return identities.length ? identities : [{value: "NONE", label: `No active ${provider.toUpperCase()} identity`}];
};

export const buildMutationRequest = (draft: MutationDraft): AdminMutationRequest => {
    const parameters: Record<string, string> = {};
    if (["LINK", "REASSIGN", "UNLINK"].includes(draft.operation)) {
        parameters.provider = draft.provider;
        parameters.subject = draft.subject.trim();
        if (draft.displayName.trim()) parameters.displayName = draft.displayName.trim();
    }
    if (draft.operation === "SUSPEND" && draft.suspensionUntil) {
        parameters.until = new Date(draft.suspensionUntil).toISOString();
    }
    if (draft.operation === "MERGE") {
        parameters.discordSubject = draft.discordSubject || "NONE";
        parameters.ifcSubject = draft.ifcSubject || "NONE";
    }
    return {
        operation: draft.operation,
        sourceAccountId: draft.sourceAccountId,
        targetAccountId: ["MERGE", "REASSIGN"].includes(draft.operation) ? draft.targetAccountId : null,
        parameters,
    };
};
