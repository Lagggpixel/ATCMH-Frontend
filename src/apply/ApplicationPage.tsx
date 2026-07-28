"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useEffect, useMemo, useState} from "react";
import type {ApplicationQuestion, WebsiteApplicationState} from "@/src/dashboard/types/ApplicationQuestion";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import {loginPath} from "@/src/dashboard/utils/AuthSessionUtils";
import {discordUrl} from "@/src/marketing/SiteHeader";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {
    applicationTypes,
    parseApplicationType,
    pruneApplicationAnswers,
    validateApplicationAnswers,
    visibleApplicationQuestions,
} from "./application-form-state";
import styles from "./ApplicationPage.module.css";

const statusCopy: Partial<Record<WebsiteApplicationState["status"], {title: string; detail: string}>> = {
    ACTIVE_MENTORSHIP: {title: "You already have an active mentorship", detail: "A second application cannot be started while your current mentorship is active. Contact a Moderator in Discord if your circumstances have changed."},
    SUBMITTING: {title: "Your application is being submitted", detail: "Please do not start another application. Refresh shortly to see its final status."},
    SUBMITTED: {title: "Application submitted", detail: "Your answers have been received. Continue in Discord, where the team will contact you about the next step."},
    DELIVERY_FAILED: {title: "Your application was saved, but delivery needs attention", detail: "Do not start another application. Contact a Moderator in Discord so the team can safely complete the handoff without duplicating your submission."},
};

export default function ApplicationPage() {
    const params = useSearchParams();
    const applicationType = parseApplicationType(params.get("type"));
    const source = params.get("source") === "discord" ? "discord" : "website";
    const returnTo = applicationType ? `/apply?${new URLSearchParams({type: applicationType, ...(source === "discord" ? {source} : {})})}` : "/apply";
    const {session, loading: authLoading, error: authError} = usePortalAuth();
    const hasIfc = session?.identities.some(identity => identity.active !== false && identity.provider.toLowerCase() === "ifc") ?? false;
    const [questions, setQuestions] = useState<ApplicationQuestion[]>();
    const [application, setApplication] = useState<WebsiteApplicationState>();
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [requestError, setRequestError] = useState<string>();
    const [busy, setBusy] = useState<"save" | "submit" | "restart">();
    const [confirmRestart, setConfirmRestart] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!session || !applicationType) return;
        let current = true;
        const questionRequest = hasIfc ? ApiUtils.getApplicationQuestions() : Promise.resolve(undefined);
        void Promise.all([questionRequest, ApiUtils.getCurrentApplication(applicationType)])
            .then(([nextQuestions, nextApplication]) => {
                if (!current) return;
                setRequestError(undefined);
                if (nextQuestions) setQuestions(nextQuestions);
                setApplication(nextApplication);
                setAnswers(nextApplication.answers ?? {});
            })
            .catch(reason => { if (current) setRequestError(reason instanceof Error ? reason.message : String(reason)); });
        return () => { current = false; };
    }, [applicationType, hasIfc, session]);

    const visibleQuestions = useMemo(
        () => questions ? visibleApplicationQuestions(questions, answers) : [],
        [answers, questions],
    );

    const changeAnswer = (key: string, value: string) => {
        setAnswers(current => questions ? pruneApplicationAnswers(questions, {...current, [key]: value}) : {...current, [key]: value});
        setErrors(current => ({...current, [key]: ""}));
        setSaved(false);
    };

    const persist = async (submit: boolean) => {
        if (!session || !applicationType || !questions) return;
        const nextErrors = submit ? validateApplicationAnswers(questions, answers) : {};
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) {
            document.getElementById(`application-${Object.keys(nextErrors)[0]}`)?.focus();
            return;
        }
        const cleanAnswers = pruneApplicationAnswers(questions, answers);
        setBusy(submit ? "submit" : "save");
        setRequestError(undefined);
        setSaved(false);
        try {
            const next = submit
                ? await ApiUtils.submitCurrentApplication(session.csrfToken, applicationType, cleanAnswers)
                : await ApiUtils.saveCurrentApplication(session.csrfToken, applicationType, cleanAnswers);
            setApplication(next);
            setAnswers(next.answers ?? cleanAnswers);
            setSaved(!submit);
        } catch (reason) {
            setRequestError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(undefined);
        }
    };

    const restartInDiscord = async () => {
        if (!session || !applicationType) return;
        setBusy("restart");
        setRequestError(undefined);
        try {
            const result = await ApiUtils.restartApplicationInDiscord(session.csrfToken, application ?? {
                applicationType, applicationId: null, version: null,
            });
            window.location.assign(result.discordUrl || discordUrl);
        } catch (reason) {
            setRequestError(reason instanceof Error ? reason.message : String(reason));
            setConfirmRestart(false);
        } finally {
            setBusy(undefined);
        }
    };

    if (!applicationType) return <main className={styles.page}><section className={styles.intro}>
        <p className={styles.eyebrow}>Apply to ATCMH</p><h1>Choose the support that fits your next step</h1>
        <p>Your website application is the recommended path. You can save a draft and submit the same questions used by our Discord application.</p>
        <div className={styles.typeGrid}>{applicationTypes.map(option => <Link key={option.value} href={`/apply?type=${option.value}`} className={styles.typeCard}><span>{option.value === "mentor" ? "Recommended" : "Application"}</span><h2>{option.label}</h2><p>{option.description}</p><strong>Start on the website →</strong></Link>)}</div>
    </section></main>;

    const selectedType = applicationTypes.find(option => option.value === applicationType)!;
    if (authLoading) return <State title="Checking your ATCMH account" detail="Restoring your secure application session." loading/>;
    if (authError) return <State title="We could not restore your account" detail="Try again shortly or sign in again from the home page." error={authError}/>;
    if (!session) return <main className={styles.page}><section className={styles.stateCard}>
        <p className={styles.eyebrow}>{selectedType.label}</p><h1>Sign in to start your application</h1>
        <p>{source === "discord" ? "You came from Discord. Sign in with the same Discord account so we can safely continue on the website." : "Sign in with Discord to connect this application to the account our team will contact."}</p>
        <a className={styles.primary} href={loginPath(ApiUtils.apiOrigin, "discord", returnTo)}>Continue with Discord</a>
        <Link className={styles.backLink} href="/apply">Choose a different application</Link>
    </section></main>;

    if (!hasIfc || application?.status === "IFC_REQUIRED") return <main className={styles.page}><section className={styles.stateCard}>
        <p className={styles.eyebrow}>{selectedType.label}</p><h1>Link your Infinite Flight account</h1>
        <p>Your IFC identity is required to verify eligibility and attach the correct pilot profile. After linking, you will return to this website application.</p>
        {requestError ? <p className={styles.error} role="alert">{requestError}</p> : null}
        <a className={styles.primary} href={loginPath(ApiUtils.apiOrigin, "ifc", returnTo)}>Link Infinite Flight account</a>
        <button className={styles.textButton} type="button" onClick={() => setConfirmRestart(true)}>Restart this application in Discord instead</button>
        {confirmRestart ? <RestartConfirmation busy={busy === "restart"} onCancel={() => setConfirmRestart(false)} onConfirm={() => void restartInDiscord()}/> : null}
    </section></main>;

    if (application && statusCopy[application.status]) {
        const copy = statusCopy[application.status]!;
        return <main className={styles.page}><section className={styles.stateCard}><p className={styles.eyebrow}>{selectedType.label}</p><h1>{copy.title}</h1><p>{copy.detail}</p>{application.superAdminBypassActive === true ? <SuperAdminBypassNotice/> : null}<a className={styles.primary} href={discordUrl}>Open Discord</a></section></main>;
    }
    if (requestError && (!questions || !application)) return <State title="Application unavailable" detail="We could not load your application." error={requestError}/>;
    if (!questions || !application) return <State title="Loading your application" detail="Checking eligibility and restoring any saved answers." loading/>;

    return <main className={styles.page}>
        <section className={styles.applicationHeader}><div><p className={styles.eyebrow}>Website application · {selectedType.label}</p><h1>Tell us where you are in your IFATC journey</h1><p>The answers below come from the same question set used in Discord.</p></div><Link href="/apply">Change application</Link></section>
        {application.superAdminBypassActive === true ? <SuperAdminBypassNotice/> : null}
        <div className={styles.progress} aria-label={`${visibleQuestions.length} application questions`}><span>{visibleQuestions.filter(question => answers[question.key]?.trim()).length} of {visibleQuestions.length} answered</span><span>{application.status === "DRAFT" ? "Draft saved" : "Not submitted"}</span></div>
        {requestError ? <p className={styles.error} role="alert">{requestError}</p> : null}
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void persist(true); }}>
            {visibleQuestions.map((question, index) => <QuestionField key={question.key} question={question} index={index} value={answers[question.key] ?? ""} error={errors[question.key]} onChange={value => changeAnswer(question.key, value)}/>)}
            <div className={styles.formActions}>
                <div><button className={styles.secondary} type="button" disabled={Boolean(busy)} onClick={() => void persist(false)}>{busy === "save" ? "Saving…" : "Save draft"}</button>{saved ? <span role="status">Draft saved.</span> : null}</div>
                <button className={styles.primaryButton} type="submit" disabled={Boolean(busy)}>{busy === "submit" ? "Submitting…" : "Submit application"}</button>
            </div>
        </form>
        <section className={styles.discordAlternative}><div><h2>Prefer to apply in Discord?</h2><p>Discord remains available as a legacy alternative, but switching does not carry over any website answers.</p></div><button type="button" onClick={() => setConfirmRestart(true)}>Restart in Discord</button></section>
        {confirmRestart ? <RestartConfirmation busy={busy === "restart"} onCancel={() => setConfirmRestart(false)} onConfirm={() => void restartInDiscord()}/> : null}
    </main>;
}

function SuperAdminBypassNotice() {
    return <aside className={styles.bypassNotice} role="status" aria-label="Super Admin eligibility bypass active">
        <strong>Super Admin bypass active</strong>
        <p>The existing-role/IFATC eligibility restriction was overridden solely to test this application flow. Every other eligibility and safety check still applies. This application is marked for moderation audit.</p>
    </aside>;
}

function QuestionField({question, index, value, error, onChange}: {question: ApplicationQuestion; index: number; value: string; error?: string; onChange: (value: string) => void}) {
    const id = `application-${question.key}`;
    return <fieldset className={styles.question} aria-describedby={`${id}-help ${id}-error`}>
        <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.prompt}</legend>
        {question.helpText ? <p id={`${id}-help`} className={styles.help}>{question.helpText}</p> : null}
        {question.inputType === "YES_NO" ? <div className={styles.choiceRow}>{["yes", "no"].map(option => <label key={option}><input id={option === "yes" ? id : undefined} type="radio" name={question.key} value={option} checked={value === option} onChange={() => onChange(option)}/><span>{option === "yes" ? "Yes" : "No"}</span></label>)}</div>
            : question.inputType === "WEEKLY_AVAILABILITY" ? <textarea id={id} rows={9} value={value} onChange={event => onChange(event.target.value)} placeholder={"Monday: 0000-0000 UTC\nTuesday: Not available\n…"}/>
                : (
                    <input
                        id={id}
                        type={question.inputType === "POSITIVE_INTEGER" ? "number" : "text"}
                        min={question.inputType === "POSITIVE_INTEGER" ? 1 : undefined}
                        value={value}
                        onChange={event => onChange(event.target.value)}
                    />
                )}
        {error ? <p id={`${id}-error`} className={styles.fieldError} role="alert">{error}</p> : null}
    </fieldset>;
}

function RestartConfirmation({busy, onCancel, onConfirm}: {busy: boolean; onCancel: () => void; onConfirm: () => void}) {
    return <div className={styles.modalBackdrop} role="presentation"><section className={styles.confirmation} role="alertdialog" aria-modal="true" aria-labelledby="restart-title">
        <p className={styles.eyebrow}>Start over</p><h2 id="restart-title">Restart the entire application in Discord?</h2>
        <p>This permanently discards the website draft and all answers entered here. Discord starts a new application from question one; it cannot resume this website progress.</p>
        <div><button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>Keep website application</button><button type="button" className={styles.danger} disabled={busy} onClick={onConfirm}>{busy ? "Restarting…" : "Discard draft and restart"}</button></div>
    </section></div>;
}

function State({title, detail, loading, error}: {title: string; detail: string; loading?: boolean; error?: string}) {
    return <main className={styles.page}><section className={styles.stateCard}>{loading ? <span className={styles.spinner}/> : null}<h1>{title}</h1><p>{detail}</p>{error ? <p className={styles.error} role="alert">{error}</p> : null}</section></main>;
}
