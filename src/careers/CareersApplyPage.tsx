"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useState, type FormEvent} from "react";
import CareersFrame from "./CareersFrame";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import type {MentorApplicationContext, MentorApplicationSubmission} from "@/src/dashboard/types/MentorApplication";
import {RegionInput, TimezoneInput} from "@/src/apply/LocationInputs";
import styles from "./CareersApplyPage.module.css";

const emptySubmission: MentorApplicationSubmission = {
    region: "",
    timezone: "",
    availabilityOutline: "",
    leadershipRoles: "",
    whyMentor: "",
    anythingElse: "",
};

export default function CareersApplyPage() {
    const router = useRouter();
    const {session, loading: authLoading} = usePortalAuth();
    const [context, setContext] = useState<MentorApplicationContext>();
    const [contextLoading, setContextLoading] = useState(false);
    const [contextError, setContextError] = useState<string>();
    const [submission, setSubmission] = useState(emptySubmission);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string>();
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (!session) return;
        let current = true;
        void Promise.resolve().then(async () => {
            if (!current) return;
            setContextLoading(true);
            setContextError(undefined);
            try {
                const value = await ApiUtils.getMentorApplicationContext();
                if (current && ["pending", "approved", "cooldown"].includes(value.status)) router.replace("/careers/application");
                if (current) setContext(value);
            } catch (reason) {
                if (current) setContextError(reason instanceof Error ? reason.message : String(reason));
            } finally {
                if (current) setContextLoading(false);
            }
        });
        return () => {current = false;};
    }, [session, router]);

    const update = (field: keyof MentorApplicationSubmission, value: string) => {
        setSubmission(current => ({...current, [field]: value}));
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!session) return;
        setSubmitting(true);
        setSubmitError(undefined);
        try {
            await ApiUtils.submitMentorApplication(session.csrfToken, submission);
            setSubmitted(true);
            router.replace("/careers/application");
        } catch (reason) {
            setSubmitError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSubmitting(false);
        }
    };

    const loginHref = homeLoginHref("dashboard", "/careers/apply");

    return <CareersFrame>
        <main className={styles.page}>
            <header className={styles.header}>
                <p className={styles.eyebrow}>Careers</p>
                <h1>Mentor application</h1>
                <p>Complete the questions below to apply for a mentor position.</p>
                <nav className={styles.headerLinks} aria-label="Mentor application links">
                    <Link href="/careers?view=expectations">Review expectations</Link>
                    {session && <Link href="/careers/application">View application history</Link>}
                </nav>
            </header>

            {authLoading ? <section className={styles.stateCard} aria-live="polite"><p>Checking your account…</p></section>
                : !session ? <section className={styles.stateCard}>
                    <h2>Sign in to apply</h2>
                    <p>Your IFC username, Discord account, and IFATC rank are filled from your linked accounts.</p>
                    <Link className={styles.primaryButton} href={loginHref}>Sign in</Link>
                </section>
                    : contextLoading ? <section className={styles.stateCard} aria-live="polite"><p>Checking your eligibility…</p></section>
                        : contextError ? <section className={styles.stateCard}>
                            <h2>Unable to load your application</h2>
                            <p role="alert">{contextError}</p>
                            <button type="button" className={styles.secondaryButton} onClick={() => window.location.reload()}>Try again</button>
                        </section>
                            : context?.status !== "eligible" ? <section className={styles.stateCard}>
                                <h2>Unable to apply</h2>
                                <p role="status">{context?.message || "Your eligibility could not be confirmed."}</p>
                                {context?.status === "link_required" ? <Link className={styles.secondaryButton} href="/account">Review linked accounts</Link> : null}
                            </section>
                                : submitted ? <section className={styles.stateCard}>
                                    <p className={styles.eyebrow}>Submitted</p>
                                    <h2>Thank you for applying</h2>
                                    <p>Your mentor application has been submitted.</p>
                                    <Link className={styles.secondaryButton} href="/careers">Back to Careers</Link>
                                </section>
                                    : <form className={styles.form} onSubmit={submit}>
                                        <section className={styles.accountCard} aria-labelledby="account-heading">
                                            <div><p className={styles.eyebrow}>Signed-in account</p><h2 id="account-heading">Your details</h2></div>
                                            <dl>
                                                <div><dt>IFC Username</dt><dd>{context.ifcUsername}</dd></div>
                                                <div><dt>Discord</dt><dd>{context.discord}</dd></div>
                                                <div><dt>IFATC Rank</dt><dd>{context.ifatcRank}</dd></div>
                                            </dl>
                                        </section>

                                        <div className={styles.fields}>
                                            <div className={styles.question}>
                                                <label id="region-label" htmlFor="region">Region <span>Required</span></label>
                                                <RegionInput id="region" value={submission.region} required invalid={false} onChange={value => update("region", value)}/>
                                            </div>
                                            <div className={styles.question}>
                                                <label id="timezone-label" htmlFor="timezone">Timezone <span>Required</span></label>
                                                <TimezoneInput id="timezone" value={submission.timezone} required invalid={false} onChange={value => update("timezone", value)}/>
                                            </div>
                                            <div className={styles.question}>
                                                <label htmlFor="availability">Specific availability outline <span>Required</span></label>
                                                <p id="availability-help">List the days and times you are usually available, including your timezone.</p>
                                                <textarea id="availability" required maxLength={6000} rows={5} aria-describedby="availability-help" value={submission.availabilityOutline} onChange={event => update("availabilityOutline", event.target.value)}/>
                                            </div>
                                            <div className={styles.question}>
                                                <label htmlFor="leadership">Other Leadership Roles (VA, VO, etc.) <span>Optional</span></label>
                                                <textarea id="leadership" maxLength={2000} rows={3} value={submission.leadershipRoles} onChange={event => update("leadershipRoles", event.target.value)}/>
                                            </div>
                                            <div className={styles.question}>
                                                <label htmlFor="why-mentor">Why do you think you would be a good mentor? <span>Required</span></label>
                                                <textarea id="why-mentor" required maxLength={6000} rows={6} value={submission.whyMentor} onChange={event => update("whyMentor", event.target.value)}/>
                                            </div>
                                            <div className={styles.question}>
                                                <label htmlFor="anything-else">Anything else we should know? <span>Optional</span></label>
                                                <textarea id="anything-else" maxLength={4000} rows={4} value={submission.anythingElse} onChange={event => update("anythingElse", event.target.value)}/>
                                            </div>
                                        </div>

                                        {submitError ? <p className={styles.error} role="alert">{submitError}</p> : null}
                                        <div className={styles.actions}>
                                            <p>Applications may remain active while mentors are added to meet mentee demand.</p>
                                            <button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</button>
                                        </div>
                                    </form>}
        </main>
    </CareersFrame>;
}
