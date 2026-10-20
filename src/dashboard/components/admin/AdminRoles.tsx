"use client";

import {useEffect, useRef, useState} from "react";
import {CaretRightIcon} from "@phosphor-icons/react/CaretRight";
import {InfoIcon} from "@phosphor-icons/react/Info";
import {LockSimpleIcon} from "@phosphor-icons/react/LockSimple";
import {MagnifyingGlassIcon} from "@phosphor-icons/react/MagnifyingGlass";
import {UserPlusIcon} from "@phosphor-icons/react/UserPlus";
import {UsersIcon} from "@phosphor-icons/react/Users";
import {XIcon} from "@phosphor-icons/react/X";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {canManageRoles, type DashboardRole, type DashboardRoleId, type RoleMember} from "../../types/DashboardRole";
import {RoleApi} from "../../utils/RoleApi";
import styles from "./AdminRoles.module.css";

type MemberAction = {role: DashboardRoleId; member?: RoleMember};
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function AdminRoles() {
    const {adminUser, session, loading: authLoading} = usePortalAuth();
    const allowed = canManageRoles(adminUser, session?.impersonating);
    const [roles, setRoles] = useState<DashboardRole[]>([]);
    const [selected, setSelected] = useState<DashboardRoleId>("ADMIN");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [filter, setFilter] = useState("");
    const [action, setAction] = useState<MemberAction | null>(null);
    const [query, setQuery] = useState("");
    const [candidates, setCandidates] = useState<RoleMember[]>([]);
    const [searching, setSearching] = useState(false);
    const [dialogError, setDialogError] = useState("");
    const [busy, setBusy] = useState(false);
    const [retry, setRetry] = useState(0);
    const dialog = useRef<HTMLDialogElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!allowed) return;
        const controller = new AbortController();
        setLoading(true); setError("");
        RoleApi.list(controller.signal).then(value => {if (!controller.signal.aborted) setRoles(value);})
            .catch(reason => {if (!controller.signal.aborted) setError(message(reason));})
            .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [allowed, retry]);

    useEffect(() => {
        if (action && allowed) {dialog.current?.showModal(); searchInput.current?.focus();}
        else dialog.current?.close();
    }, [action, allowed]);

    useEffect(() => {
        if (!action || action.member || !allowed) return;
        const controller = new AbortController();
        setSearching(true); setCandidates([]); setDialogError("");
        const timer = window.setTimeout(() => {
            RoleApi.candidates(query.trim(), controller.signal).then(value => {if (!controller.signal.aborted) setCandidates(value);})
                .catch(reason => {if (!controller.signal.aborted) setDialogError(message(reason));})
                .finally(() => {if (!controller.signal.aborted) setSearching(false);});
        }, 200);
        return () => {controller.abort(); window.clearTimeout(timer);};
    }, [action, query, allowed]);

    const open = (value: MemberAction) => {setQuery(""); setDialogError(""); setNotice(""); setAction(value);};
    const change = async (member: RoleMember) => {
        if (!action || !session?.csrfToken || busy) return;
        const roleId = action.role;
        const removing = Boolean(action.member);
        setBusy(true); setDialogError("");
        try {
            const result = removing ? await RoleApi.remove(roleId, member, session.csrfToken) : await RoleApi.add(roleId, member, session.csrfToken);
            setRoles(current => current.map(role => role.id === roleId ? {...role, members: result.members} : role));
            setNotice(`${member.displayName} ${removing ? "removed from" : "added to"} ${roles.find(role => role.id === roleId)?.name}.`);
            setAction(null);
        } catch (reason) {setDialogError(message(reason));}
        finally {setBusy(false);}
    };

    if (authLoading) return <main className={styles.page}><p role="status">Checking access…</p></main>;
    if (!allowed) return <main className={styles.page}><h2>Superadmin access required</h2><p>Only a superadmin using their own account can manage roles.</p></main>;
    const role = roles.find(value => value.id === selected);
    const actionRole = roles.find(value => value.id === action?.role);
    const members = role?.members.filter(member => `${member.displayName} ${member.discordId}`.toLowerCase().includes(filter.toLowerCase())) ?? [];

    return <main className={styles.page} data-roles-page>
        <div className={styles.breadcrumb}><span>Administration</span><CaretRightIcon size={14} aria-hidden="true"/><span>Roles</span></div>
        <header className={styles.heading}><h2>Roles</h2><p>Manage access to the dashboard and Sweatbox.</p><span className={styles.access}><LockSimpleIcon size={18} aria-hidden="true"/>Superadmin only</span></header>
        {error ? <div className={styles.error} role="alert">{error}<button type="button" className={styles.textButton} onClick={() => setRetry(value => value + 1)}>Try again</button></div> : null}
        <div className={styles.layout}>
            <nav className={styles.roles} aria-label="Roles">{roles.map(value => <button type="button" key={value.id} aria-current={selected === value.id ? "true" : undefined} onClick={() => {setSelected(value.id); setFilter(""); setNotice("");}}><UsersIcon size={22} aria-hidden="true"/><span>{value.name}</span><span>{value.members.length}</span></button>)}</nav>
            <section className={styles.members} aria-label={role ? `${role.name} members` : "Role members"} aria-busy={loading}>
                {loading ? <p role="status">Loading roles…</p> : role ? <>
                    <div className={styles.toolbar}><div><h3>{role.name}</h3><p>{role.description}</p></div><div className={styles.actions}><label className={styles.search}><MagnifyingGlassIcon size={20} aria-hidden="true"/><input aria-label="Search members" placeholder="Search members…" value={filter} onChange={event => setFilter(event.target.value)}/></label><button type="button" className={styles.primary} onClick={() => open({role: role.id})}><UserPlusIcon size={21} aria-hidden="true"/>Add member</button></div></div>
                    <div className={styles.notice} role="status">{notice}</div>
                    {members.length ? <table className={styles.table}><thead><tr><th scope="col">Member</th><th scope="col">Discord identity</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{members.map(member => <tr key={member.discordId}><td><div className={styles.member}><span className={styles.initial} aria-hidden="true">{member.displayName.slice(0, 1).toUpperCase()}</span><strong>{member.displayName}</strong></div></td><td className={styles.identity}>{member.discordId}</td><td><button type="button" className={styles.textButton} aria-label={`Remove ${member.displayName}`} onClick={() => open({role: role.id, member})}>Remove</button></td></tr>)}</tbody></table> : <div className={styles.empty}><UsersIcon size={30} aria-hidden="true"/><p>{filter ? "No matching members." : `No ${role.name === "Admin" ? "admins" : "Sweatbox testers"} yet.`}</p>{!filter ? <button type="button" className={styles.primary} onClick={() => open({role: role.id})}><UserPlusIcon size={20} aria-hidden="true"/>Add member</button> : null}</div>}
                    <p className={styles.footer}><InfoIcon size={21} aria-hidden="true"/>Superadmin access is managed separately.</p>
                </> : null}
            </section>
        </div>
        <dialog ref={dialog} className={styles.dialog} aria-labelledby="role-dialog-title" onCancel={event => {if (busy) event.preventDefault(); else setAction(null);}} onClose={() => {if (!busy) setAction(null);}}>
            <div className={styles.dialogHeader}><h3 id="role-dialog-title">{action?.member ? `Remove from ${actionRole?.name}?` : `Add member to ${actionRole?.name}`}</h3><button type="button" className={styles.close} aria-label="Close" disabled={busy} onClick={() => setAction(null)}><XIcon size={22}/></button></div>
            {dialogError ? <p className={styles.error} role="alert">{dialogError}</p> : null}
            {action?.member ? <><p>Remove <strong>{action.member.displayName}</strong> from {actionRole?.name}? Access granted by this role will end immediately. Other roles will remain.</p><div className={styles.dialogActions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => setAction(null)}>Cancel</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void change(action.member!)}>{busy ? "Removing…" : "Remove member"}</button></div></> : <>
                <p>Choose an active account with a linked Discord identity.</p><label className={styles.search}><MagnifyingGlassIcon size={20} aria-hidden="true"/><input ref={searchInput} aria-label="Find an account" placeholder="Search by name or Discord ID…" maxLength={100} value={query} disabled={busy} onChange={event => setQuery(event.target.value)}/></label>
                <div className={styles.candidates} aria-busy={searching}>{searching ? <p role="status">Searching accounts…</p> : !candidates.length && !dialogError ? <p>No matching accounts.</p> : candidates.map(member => {
                    const exists = actionRole?.members.some(value => value.discordId === member.discordId);
                    return <div className={styles.candidate} key={member.discordId}><div><strong>{member.displayName}</strong><small>{member.discordId}</small></div><button type="button" className={styles.textButton} aria-label={`Add ${member.displayName}`} disabled={busy || exists} onClick={() => void change(member)}>{exists ? "Already a member" : busy ? "Saving…" : "Add"}</button></div>;
                })}</div>
            </>}
        </dialog>
    </main>;
}
