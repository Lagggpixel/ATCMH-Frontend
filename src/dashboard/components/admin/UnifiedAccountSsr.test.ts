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

test("actual account route renders signed-out and restored lowercase-status outcomes", async () => {
    const {default: AccountPage} = await load<{default: React.ComponentType<any>}>("/src/dashboard/components/account/AccountPage.tsx");
    const signedOut = inRouter(React.createElement(AccountPage, {session: null, loading: false, error: null, onLogout: async () => {}}), "/account");
    assert.match(signedOut, /Return home to sign in/);
    assert.match(signedOut, /loginFor=dashboard/);
    const restored = inRouter(React.createElement(AccountPage, {session: {accountId: "7", status: "active", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "x", impersonating: false, identities: []}, loading: false, error: null, onLogout: async () => {}}), "/account");
    assert.match(restored, /Account 7/); assert.match(restored, />Active</);
    const cancelled = inRouter(React.createElement(AccountPage, {session: null, loading: false, error: null, onLogout: async () => {}}), "/account?authError=cancelled");
    assert.match(cancelled, /Sign-in was cancelled/); assert.match(cancelled, /No account changes were made/);
    const providerFailure = inRouter(React.createElement(AccountPage, {session: null, loading: false, error: null, onLogout: async () => {}}), "/account?authError=provider_failure");
    assert.match(providerFailure, /could not verify your sign-in/); assert.match(providerFailure, /contact support/);
});

test("account page keeps staff dashboard navigation out of the personal account surface", async () => {
    const {default: AccountPage} = await load<{default: React.ComponentType<any>}>("/src/dashboard/components/account/AccountPage.tsx");
    const session = {accountId: "7", status: "ACTIVE", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "x", impersonating: false, identities: []};
    const html = inRouter(React.createElement(AccountPage, {session, loading: false, error: null, onLogout: async () => {}}), "/account");
    assert.doesNotMatch(html, /Open staff dashboard|href="\/dashboard"/);
});

test("account logout controls use explicit high-contrast marketing colors", async () => {
    const css = await (await import("node:fs/promises")).readFile(new URL("../account/AccountPage.module.css", import.meta.url), "utf8");
    assert.match(css, /\.actions button, \.primary\s*\{[^}]*background:\s*var\(--primary-strong\)[^}]*color:\s*#fff/s);
    assert.match(css, /\.actions \.danger\s*\{[^}]*background:\s*#7f1d1d[^}]*color:\s*#fff/s);
});

test("actual capability navigation includes privileged routes only for capable users", async () => {
    const {default: AdminNav} = await load<{default: React.ComponentType<any>}>("/src/dashboard/components/admin/AdminNav.tsx");
    const base = {id:"1",username:"Staff",canManageAllAssignments:false,canViewAuditLogs:false,canViewManual:false,canManageAccounts:false,canReviewAltAccounts:false,canViewSensitiveAuditDetails:false,canImpersonate:false};
    assert.doesNotMatch(inRouter(React.createElement(AdminNav,{adminUser:base}),"/dashboard"), />Accounts</);
    const privileged = inRouter(React.createElement(AdminNav,{adminUser:{...base,canManageAccounts:true,canReviewAltAccounts:true}}),"/dashboard");
    assert.match(privileged, />Accounts</); assert.match(privileged, /Alt Evidence/);
});

test("admin navigation uses compact integrated tabs", async () => {
    const {default: AdminNav} = await load<{default: React.ComponentType<any>}>("/src/dashboard/components/admin/AdminNav.tsx");
    const html = inRouter(React.createElement(AdminNav, {adminUser: {id:"1",username:"Staff",canManageAllAssignments:false,canViewAuditLogs:false,canViewManual:false,canManageAccounts:false,canReviewAltAccounts:false,canViewSensitiveAuditDetails:false,canImpersonate:false}}), "/dashboard");
    const css = await (await import("node:fs/promises")).readFile(new URL("./AdminNav.module.css", import.meta.url), "utf8");

    assert.match(html, /<nav[^>]*aria-label="Dashboard sections"/);
    assert.doesNotMatch(html, /Admin Dashboard|dashboard-icon\.png/);
    assert.doesNotMatch(css, /position:\s*sticky/);
    assert.match(css, /\.adminHeader\s*\{[^}]*border-bottom:/s);
    assert.match(css, /\.adminNavButtonActive::after\s*\{[^}]*bottom:\s*-1px/s);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.adminNav\s*\{[^}]*overflow-x:\s*auto/s);
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
