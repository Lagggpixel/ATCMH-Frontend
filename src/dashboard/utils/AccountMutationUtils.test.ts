import test from "node:test";
import assert from "node:assert/strict";
import {buildMutationRequest, createMutationUiState, mergeIdentityOptions, mutationUiReducer, type MutationDraft, type MutationUiState} from "./AccountMutationUtils.ts";
import type {AccountDetail, AdminMutationPreview} from "../types/Account.ts";

const draft = (operation: MutationDraft["operation"]): MutationDraft => ({operation, sourceAccountId: "1", targetAccountId: "2", provider: "IFC", subject: "ifc-7", displayName: "Pilot", suspensionUntil: "", discordSubject: "discord-1", ifcSubject: "ifc-7"});

test("link and reassign previews name the exact provider identity", () => {
    assert.deepEqual(buildMutationRequest(draft("REASSIGN")), {operation: "REASSIGN", sourceAccountId: "1", targetAccountId: "2", parameters: {provider: "IFC", subject: "ifc-7", displayName: "Pilot"}});
});

test("merge previews preserve explicit retained Discord and IFC choices", () => {
    assert.deepEqual(buildMutationRequest(draft("MERGE")).parameters, {discordSubject: "discord-1", ifcSubject: "ifc-7"});
});

test("irreversible lifecycle actions carry no client-invented fields", () => {
    assert.deepEqual(buildMutationRequest(draft("DELETE")), {operation: "DELETE", sourceAccountId: "1", targetAccountId: null, parameters: {}});
});

const preview = {token: "preview", operation: "LINK", sourceAccountId: "1", targetAccountId: null, sourceVersion: 1, targetVersion: null, parameters: {}, expiresAt: "2026-07-14T00:00:00Z"} as AdminMutationPreview;
test("every visible draft edit invalidates both preview and reason", () => {
    const patches: Array<Partial<MutationDraft>> = [{operation: "UNLINK"}, {provider: "IFC"}, {subject: "new"}, {displayName: "New"}, {targetAccountId: "3"}, {discordSubject: "d"}, {ifcSubject: "i"}, {suspensionUntil: "2026-07-14T12:00"}];
    for (const patch of patches) {
        const dirty = {draft: draft("LINK"), preview, reason: "old reason"};
        const next = mutationUiReducer(dirty, {type: "EDIT_DRAFT", patch});
        assert.equal(next.preview, null); assert.equal(next.reason, "");
    }
});

test("changing a merge participant requires fresh retained-identity choices", () => {
    const state = {draft: draft("MERGE"), preview, reason: "reason"};
    const next = mutationUiReducer(state, {type: "EDIT_DRAFT", patch: {targetAccountId: "9"}});
    assert.equal(next.draft.discordSubject, ""); assert.equal(next.draft.ifcSubject, "");
});

test("account selection, cancellation, and a new preview cannot reuse a reason", () => {
    let state: MutationUiState = {...createMutationUiState("1"), preview, reason: "old"};
    state = mutationUiReducer(state, {type: "SELECT_ACCOUNT", accountId: "2"});
    assert.equal(state.draft.sourceAccountId, "2"); assert.equal(state.reason, "");
    state = mutationUiReducer({...state, reason: "another"}, {type: "PREVIEW_RECEIVED", preview});
    assert.equal(state.reason, "");
    state = mutationUiReducer({...state, reason: "cancelled"}, {type: "CANCEL_PREVIEW"});
    assert.equal(state.reason, ""); assert.equal(state.preview, null);
});

const account = (id: string, identities: AccountDetail["identities"]): AccountDetail => ({id, status: "ACTIVE", version: 1, createdAt: "", updatedAt: "", identities, sessions: [], linkHistory: [], loginHistory: [], managementAudits: []});
test("merge choices combine active identities from both owners with ownership labels", () => {
    const options = mergeIdentityOptions(account("1", [{provider: "discord", subject: "d1", displayName: "Source"}]), account("2", [{provider: "DISCORD", subject: "d2", displayName: "Target"}]), "discord");
    assert.deepEqual(options.map(option => [option.value, option.accountId]), [["d1", "1"], ["d2", "2"]]);
    assert.match(options[1].label, /account 2/);
});

test("NONE is explicit only when neither merge account has an active provider identity", () => {
    assert.deepEqual(mergeIdentityOptions(account("1", []), account("2", []), "ifc"), [{value: "NONE", label: "No active IFC identity"}]);
});
