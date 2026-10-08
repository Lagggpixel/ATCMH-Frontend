"use client";

import {useEffect, useState} from "react";
import {useSearchParams} from "@/src/dashboard/next-navigation";
import {ArrowRightIcon, GearSixIcon, MagnifyingGlassIcon} from "@phosphor-icons/react";
import type {AdminUser} from "../../types/AdminUser";
import type {MentorApplicationDetail, MentorApplicationPolicy, MentorApplicationSummary} from "../../types/MentorApplication";
import {ApiUtils} from "../../utils/ApiUtils";
import AdminErrorScreen from "./AdminErrorScreen";
import AdminLoadingScreen from "./AdminLoadingScreen";
import AdminLoginScreen from "./AdminLoginScreen";
import MentorApplicationReview, {ApplicationStatus, applicationDate, ReapplicationSettings} from "./MentorApplicationReview";
import styles from "./AdminMentorApplications.module.css";

interface Props {loaded: boolean; loggedIn: boolean; error?: string; adminUser?: AdminUser; token: string | null}

export default function AdminMentorApplications({loaded, loggedIn, error, adminUser, token}: Props) {
    const [searchParams] = useSearchParams();
    const linkedId = Number(searchParams.get("applicationId"));
    const [applications, setApplications] = useState<MentorApplicationSummary[]>();
    const [policy, setPolicy] = useState<MentorApplicationPolicy>();
    const [selectedId, setSelectedId] = useState<number | null>(() => Number.isSafeInteger(linkedId) && linkedId > 0 ? linkedId : null);
    const [detail, setDetail] = useState<MentorApplicationDetail>();
    const [loadError, setLoadError] = useState<string>();
    const [detailError, setDetailError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [policyOpen, setPolicyOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("ALL");
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        if (!loaded || !loggedIn || !token || !adminUser?.canReviewMentorApplications) return;
        let current = true;
        void Promise.all([ApiUtils.getMentorApplications(token), ApiUtils.getMentorApplicationPolicy(token)]).then(([values, settings]) => {
            if (current) {setApplications(values); setPolicy(settings); setLoadError(undefined);}
        }).catch(reason => {if (current) setLoadError(reason instanceof Error ? reason.message : String(reason));});
        return () => {current = false;};
    }, [loaded, loggedIn, token, adminUser?.canReviewMentorApplications, refresh]);
    useEffect(() => {
        if (!token || selectedId == null || !adminUser?.canReviewMentorApplications) return;
        let current = true;
        void ApiUtils.getMentorApplication(token, selectedId).then(value => {
            if (current) {setDetail(value); setDetailError(undefined); setApplications(values => values?.map(a => a.id === value.id ? value : a));}
        }).catch(reason => {if (current) setDetailError(reason instanceof Error ? reason.message : String(reason));});
        return () => {current = false;};
    }, [selectedId, token, refresh, adminUser?.canReviewMentorApplications]);
    const select = (id: number | null) => {setDetail(undefined); setDetailError(undefined); setSelectedId(id);};
    const mutate = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        try {await operation(); setRefresh(value => value + 1);}
        catch (failure) {setRefresh(value => value + 1); throw failure;}
        finally {setBusy(false);}
    };
    if (!loaded) return <AdminLoadingScreen/>;
    if (error) return <AdminErrorScreen content={error}/>;
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!adminUser?.canReviewMentorApplications) return <AdminErrorScreen header="Forbidden" content="Only moderators and administrators can manage mentor applications."/>;
    if (loadError) return <AdminErrorScreen content={loadError}/>;
    if (!applications || !policy || !token) return <AdminLoadingScreen/>;
    const visible = applications.filter(a => (filter === "ALL" || a.status === filter) && `${a.ifcUsername} ${a.discord} ${a.region}`.toLowerCase().includes(search.toLowerCase()));
    const index = applications.findIndex(a => a.id === selectedId);
    return <div className={styles.container} data-view={selectedId == null ? "list" : "reader"}>
        <header className={styles.header}><h2>Mentor applications</h2>{selectedId == null && <button className={styles.secondary} type="button" onClick={() => setPolicyOpen(true)}><GearSixIcon size={18}/>Reapplication settings</button>}</header>
        {selectedId == null ? <>
            <div className={styles.toolbar}><label className={styles.search}><MagnifyingGlassIcon size={18}/><input aria-label="Search applications" placeholder="Search applicants…" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Application status" value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Next stage</option><option value="DENIED">Denied</option><option value="MENTOR">Mentor</option></select><span className={styles.muted}>{visible.length} {visible.length === 1 ? "application" : "applications"}</span></div>
            {visible.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Applicant</th><th>IFATC rank</th><th>Region / timezone</th><th>Submitted</th><th>Status</th><th><span className={styles.srOnly}>Open</span></th></tr></thead><tbody>{visible.map(a => <tr key={a.id}><td><button className={styles.applicantLink} type="button" onClick={() => select(a.id)}>{a.ifcUsername}</button><small>{a.discord}</small></td><td>{a.ifatcRank}</td><td>{a.region}<small>{a.timezone}</small></td><td>{applicationDate(a.submittedAt)}</td><td><ApplicationStatus status={a.status}/></td><td><button type="button" className={styles.iconButton} aria-label={`Review ${a.ifcUsername}'s application`} onClick={() => select(a.id)}><ArrowRightIcon size={20}/></button></td></tr>)}</tbody></table></div> : <section className={styles.empty}><h3>{applications.length ? "No matching applications" : "No mentor applications"}</h3><p>{applications.length ? "Try another search or status." : "Submitted applications will appear here."}</p></section>}
        </> : detailError ? <div className={styles.empty}><p role="alert">{detailError}</p><button type="button" className={styles.secondary} onClick={() => select(null)}>Back to applications</button><button type="button" className={styles.secondary} onClick={() => setRefresh(value => value + 1)}>Reload application</button></div> : detail ? <MentorApplicationReview key={detail.id} application={detail} policy={policy} busy={busy} onBack={() => select(null)} onSelect={select} previous={applications[index-1]?.id} next={applications[index+1]?.id} position={index+1} total={applications.length} onPolicy={() => setPolicyOpen(true)}
            onDecision={(status,reason) => mutate(() => ApiUtils.decideMentorApplication(token,detail.id,status,reason,detail.revision))}
            onWait={(months,date) => mutate(() => ApiUtils.updateMentorApplicantWait(token,detail.id,detail.revision,months,date))}/> : <p className={styles.empty} aria-live="polite">Loading application…</p>}
        {policyOpen && <ReapplicationSettings policy={policy} busy={busy} onClose={() => setPolicyOpen(false)} onSave={(months,_date,all) => mutate(() => ApiUtils.updateMentorApplicationPolicy(token,{...policy,waitMonths: months ?? 3},all))}/>}
    </div>;
}
