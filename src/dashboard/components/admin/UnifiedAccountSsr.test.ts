/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";
import {createServer, type ViteDevServer} from "vite";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

let vite: ViteDevServer;
let MemoryRouter: React.ComponentType<{initialEntries?: string[]; children: React.ReactNode}>;
const root = new URL("../../../..", import.meta.url).pathname;
test.before(async () => {
    vite = await createServer({appType: "custom", root, resolve: {alias: {"@": root}}, server: {middlewareMode: true}, logLevel: "silent"});
    ({MemoryRouter} = await vite.ssrLoadModule("/src/dashboard/next-navigation.tsx") as {MemoryRouter: typeof MemoryRouter});
});
test.after(async () => { await vite.close(); });
const load = async <T>(path: string) => await vite.ssrLoadModule(path) as T;
const inRouter = (element: React.ReactElement, entry = "/") => renderToStaticMarkup(React.createElement(MemoryRouter, {initialEntries: [entry]}, element));
const children = (node: unknown): unknown[] => React.isValidElement(node) ? React.Children.toArray((node.props as {children?: React.ReactNode}).children) : [];
const findElement = (node: unknown, predicate: (element: React.ReactElement) => boolean): React.ReactElement | undefined => {
    if (React.isValidElement(node) && predicate(node)) return node;
    for (const child of children(node)) { const found = findElement(child, predicate); if (found) return found; }
};

test("actual provider chooser renders both central providers", async () => {
    const {DiscordAuth} = await load<{DiscordAuth: React.ComponentType<{session: null}>}>("/src/dashboard/components/discord/DiscordAuth.tsx");
    const html = inRouter(React.createElement(DiscordAuth, {session: null}), "/auth?returnTo=/account");
    assert.match(html, /Continue with Discord/); assert.match(html, /Continue with Infinite Flight/);
    assert.match(html, /provider=discord/); assert.match(html, /provider=ifc/);
    assert.match(html, /Before access is granted/);
    assert.match(html, /href="https:\/\/atcmh\.org\/terms"[^>]*>Terms of Service</);
    assert.match(html, /href="https:\/\/atcmh\.org\/policy"[^>]*>Privacy Policy</);
});

test("actual account route renders signed-out and restored lowercase-status outcomes", async () => {
    const {default: AccountPage} = await load<{default: React.ComponentType<any>}>("/src/dashboard/components/account/AccountPage.tsx");
    const signedOut = inRouter(React.createElement(AccountPage, {session: null, loading: false, error: null, onLogout: async () => {}}), "/account");
    assert.match(signedOut, />Sign in</);
    const restored = inRouter(React.createElement(AccountPage, {session: {accountId: "7", status: "active", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "x", impersonating: false, identities: []}, loading: false, error: null, onLogout: async () => {}}), "/account");
    assert.match(restored, /Account 7/); assert.match(restored, />Active</);
    const cancelled = inRouter(React.createElement(AccountPage, {session: null, loading: false, error: null, onLogout: async () => {}}), "/account?authError=cancelled");
    assert.match(cancelled, /Sign-in was cancelled/); assert.match(cancelled, /No account changes were made/);
    const providerFailure = inRouter(React.createElement(AccountPage, {session: null, loading: false, error: null, onLogout: async () => {}}), "/account?authError=provider_failure");
    assert.match(providerFailure, /could not verify your sign-in/); assert.match(providerFailure, /contact support/);
});

test("home header actions distinguish loading, signed-out, account, and staff states", async () => {
    const {HomeHeaderActions} = await load<{HomeHeaderActions: React.ComponentType<any>}>("/src/dashboard/components/home/Home.tsx");
    const session = {accountId: "7", status: "ACTIVE", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "x", impersonating: false, identities: [{provider: "discord", subject: "123", displayName: "Pilot"}]};
    const staff = {id: "123", username: "Pilot", canManageAllAssignments: false, canViewAuditLogs: false, canViewManual: false, canManageAccounts: false, canReviewAltAccounts: false, canViewSensitiveAuditDetails: false, canImpersonate: false};
    const onLogout = async () => {};

    const loading = inRouter(React.createElement(HomeHeaderActions, {session: null, authLoading: true, onLogout}), "/home");
    assert.match(loading, /Checking session/);
    assert.doesNotMatch(loading, /href="\/auth|href="\/account|Admin Dashboard/);

    const signedOut = inRouter(React.createElement(HomeHeaderActions, {session: null, authLoading: false, onLogout}), "/home");
    assert.match(signedOut, /href="\/auth\?returnTo=\/leaderboard"/);
    assert.match(signedOut, />Sign in</);
    assert.doesNotMatch(signedOut, /Admin Dashboard/);

    const nonStaff = inRouter(React.createElement(HomeHeaderActions, {session, authLoading: false, onLogout}), "/home");
    assert.match(nonStaff, /href="\/account"/);
    assert.match(nonStaff, /aria-expanded="false"/);
    assert.match(nonStaff, /aria-controls="home-user-menu"/);
    assert.match(nonStaff, /aria-label="Open user menu for Pilot"/);
    assert.match(nonStaff, />Settings</);
    assert.match(nonStaff, />Log out</);
    assert.doesNotMatch(nonStaff, /Session expires/);
    assert.doesNotMatch(nonStaff, /Admin Dashboard/);

    const authorizedStaff = inRouter(React.createElement(HomeHeaderActions, {session, authLoading: false, adminUser: staff, onLogout}), "/home");
    assert.match(authorizedStaff, /href="\/dashboard"/);
    assert.match(authorizedStaff, /Admin Dashboard/);
});

test("home safely renders every policy-consent login outcome as an alert", async () => {
    const {default: Home} = await load<{default: React.ComponentType<any>}>('/src/dashboard/components/home/Home.tsx');
    const outcomes = new Map([
        ['consent_declined', 'You did not agree to the required policies'],
        ['invalid_consent', 'This policy agreement request is invalid'],
        ['consent_expired', 'This policy agreement request has expired'],
    ]);

    for (const [code, message] of outcomes) {
        const html = inRouter(React.createElement(Home, {session: null, authLoading: false}), `/home?authError=${code}`);
        assert.match(html, /role="alert"/);
        assert.match(html, new RegExp(message));
    }
});

test("account page exposes staff navigation only after authorized staff resolution", async () => {
    const {default: AccountPage} = await load<{default: React.ComponentType<any>}>("/src/dashboard/components/account/AccountPage.tsx");
    const session = {accountId: "7", status: "ACTIVE", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "x", impersonating: false, identities: []};
    const ordinary = inRouter(React.createElement(AccountPage, {session, loading: false, error: null, canAccessAdmin: false, onLogout: async () => {}}), "/account");
    assert.doesNotMatch(ordinary, /Open staff dashboard/);
    const staff = inRouter(React.createElement(AccountPage, {session, loading: false, error: null, canAccessAdmin: true, onLogout: async () => {}}), "/account");
    assert.match(staff, /href="\/dashboard"/);
    assert.match(staff, /Open staff dashboard/);
});

test("actual capability navigation includes privileged routes only for capable users", async () => {
    const {default: AdminNav} = await load<{default: React.ComponentType<any>}>("/src/dashboard/components/admin/AdminNav.tsx");
    const base = {id:"1",username:"Staff",canManageAllAssignments:false,canViewAuditLogs:false,canViewManual:false,canManageAccounts:false,canReviewAltAccounts:false,canViewSensitiveAuditDetails:false,canImpersonate:false};
    assert.doesNotMatch(inRouter(React.createElement(AdminNav,{adminUser:base}),"/dashboard"), />Accounts</);
    const privileged = inRouter(React.createElement(AdminNav,{adminUser:{...base,canManageAccounts:true,canReviewAltAccounts:true}}),"/dashboard");
    assert.match(privileged, />Accounts</); assert.match(privileged, /Alt Evidence/);
});

test("actual confirmation and stale-error views wire commit and cancel callbacks", async () => {
    const {AccountMutationConfirmation, AccountRequestError} = await load<any>("/src/dashboard/components/admin/AdminAccounts.tsx");
    let committed=0,cancelled=0;
    const preview={token:"p",operation:"DELETE",sourceAccountId:"7",targetAccountId:null,sourceVersion:2,targetVersion:null,parameters:{},expiresAt:"2026-07-14T00:00:00Z"};
    const tree=AccountMutationConfirmation({preview,reason:"security review",onReason:()=>{},onCommit:()=>committed++,onCancel:()=>cancelled++});
    const buttons: React.ReactElement[]=[]; const walk=(node:unknown)=>{if(React.isValidElement(node)&&node.type==="button")buttons.push(node);children(node).forEach(walk);};walk(tree);
    (buttons[0].props as {onClick:()=>void}).onClick(); (buttons[1].props as {onClick:()=>void}).onClick();
    assert.equal(committed,1);assert.equal(cancelled,1);
    assert.match(renderToStaticMarkup(React.createElement(AccountRequestError,{error:"account changed after preview"})),/account changed after preview/);
});

test("actual alt dialog and impersonation banner expose their actions", async () => {
    const {AltActionDialog,AltEvidenceActions}=await load<any>("/src/dashboard/components/admin/AdminAltAccounts.tsx");
    let cancelled=0;
    let action:any;const actions=AltEvidenceActions({candidate:{evidenceType:"SHARED_IP",accounts:["7"],ip:"203.0.113.1",firstSeen:"",lastSeen:"",count:2},onAction:(value:any)=>{action=value;}});const detach=findElement(actions,e=>e.type==="button");(detach!.props as any).onClick({currentTarget:{}});assert.equal(action.kind,"detach");assert.equal(action.accountId,"7");
    const dialog=AltActionDialog({pending:{kind:"vpn",ip:"203.0.113.1"},reason:"vpn",onReason:()=>{},onSubmit:()=>{},onCancel:()=>cancelled++});
    assert.match(renderToStaticMarkup(dialog),/Classify as VPN/);
    const cancel=findElement(dialog,element=>element.type==="button"&&(element.props as any).children==="Cancel");(cancel!.props as any).onClick();assert.equal(cancelled,1);
    const {default:Banner}=await load<any>("/src/dashboard/components/account/ImpersonationBanner.tsx");let exited=0;const banner=Banner({accountId:"42",onExit:async()=>{exited++;}});assert.match(renderToStaticMarkup(banner),/Impersonating account 42/);const exit=findElement(banner,e=>e.type==="button");await (exit!.props as any).onClick();assert.equal(exited,1);
});

test("actual audit row renders only the server-projected payload", async () => {
    const {ProjectedAuditRow}=await load<any>("/src/dashboard/components/admin/AdminAuditLogs.tsx");
    const html=renderToStaticMarkup(React.createElement("table",null,React.createElement("tbody",null,React.createElement(ProjectedAuditRow,{log:{id:1,createdAt:0,source:"dashboard",action:"auth.login.succeeded",summary:"Login succeeded",detailsJson:null},actor:"System",onDetails:()=>{}}))));
    assert.match(html,/Login succeeded/);assert.match(html,/auth.login.succeeded/);assert.doesNotMatch(html,/clientIp|failureReason/);
});
