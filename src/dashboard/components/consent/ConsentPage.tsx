"use client";

import {useEffect, useState} from "react";
import {Link, useSearchParams} from "@/src/dashboard/next-navigation";
import type {PolicyConsentContext} from "../../types/PolicyConsent.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import styles from "./ConsentPage.module.css";

export type ConsentPageState =
    | {kind: "loading"}
    | {kind: "ready"; context: PolicyConsentContext}
    | {kind: "invalid"}
    | {kind: "unavailable"};

export interface ConsentPageNotice {
    message: string;
    requestId?: string;
}

interface ConsentPageViewProps {
    state: ConsentPageState;
    notice?: ConsentPageNotice;
}

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const completionNotice = (authError: string | null, requestId: string | null): ConsentPageNotice | undefined => {
    if (authError !== "login_completion_failed") return undefined;
    return {
        message: "We could not complete sign-in. Please try again.",
        requestId: requestId && requestIdPattern.test(requestId) ? requestId : undefined,
    };
};

const RetryLogin = () => <div className={styles.recoveryActions}>
    <Link className={styles.primaryLink} to="/?loginFor=dashboard&amp;returnTo=%2Faccount">Return to Dashboard login</Link>
    <Link className={styles.secondaryLink} to="/?loginFor=exams&amp;returnTo=%2Fexams">Return to Exams login</Link>
</div>;

export const ConsentPageView = ({state, notice}: ConsentPageViewProps) => {
    if (state.kind === "loading") {
        return <main className={styles.page}><section className={styles.card} role="status"><p>Loading policy agreement…</p></section></main>;
    }
    if (state.kind === "invalid") {
        return <main className={styles.page}><section className={styles.card}><h1>Agreement request expired</h1><p>This agreement request is invalid or has expired. Start a new sign-in to continue.</p><RetryLogin/></section></main>;
    }
    if (state.kind === "unavailable") {
        return <main className={styles.page}><section className={styles.card}><h1>Agreement unavailable</h1><p>We could not load the policy agreement. Please try signing in again.</p><RetryLogin/></section></main>;
    }

    const {context} = state;
    const applicationName = context.application === "exams" ? "ATCMH Exam Center" : "ATCMH Dashboard";
    return <main className={styles.page}>
        <section className={styles.card} aria-labelledby="consent-title">
            <p className={styles.eyebrow}>ATCMH account</p>
            <h1 id="consent-title">Before you continue</h1>
            <p className={styles.intro}>Review the policies that apply while signing in to {applicationName}.</p>
            {notice ? <div className={styles.notice} role="alert"><p>{notice.message}</p>{notice.requestId ? <small>Request ID: {notice.requestId}</small> : null}</div> : null}
            <form action={`${ApiUtils.apiOrigin}/auth/consent`} method="post" className={styles.form}>
                <input type="hidden" name="csrf" value={context.csrfToken}/>
                <label className={styles.agreement}>
                    <input type="checkbox" name="agreement" value="agreed" required/>
                    <span>I agree to the <a href={context.terms.url} target="_blank" rel="noopener noreferrer">Terms of Service</a> and acknowledge the <a href={context.privacy.url} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
                </label>
                <p className={styles.version}>Terms {context.terms.version} · Privacy {context.privacy.version}</p>
                <div className={styles.actions}>
                    <button className={styles.acceptButton} type="submit" name="action" value="accept">Agree and continue</button>
                    <button className={styles.declineButton} type="submit" name="action" value="decline" formNoValidate>Decline</button>
                </div>
            </form>
        </section>
    </main>;
};

const ConsentPage = () => {
    const [searchParams] = useSearchParams();
    const [state, setState] = useState<ConsentPageState>({kind: "loading"});
    const notice = completionNotice(searchParams.get("authError"), searchParams.get("requestId"));

    useEffect(() => {
        let active = true;
        void ApiUtils.getConsentContext()
            .then(context => {
                if (active) setState(context ? {kind: "ready", context} : {kind: "invalid"});
            })
            .catch(() => {
                if (active) setState({kind: "unavailable"});
            });
        return () => { active = false; };
    }, []);

    return <ConsentPageView state={state} notice={notice}/>;
};

export default ConsentPage;
