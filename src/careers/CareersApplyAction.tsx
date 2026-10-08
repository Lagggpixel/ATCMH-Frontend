"use client";

import Link from "next/link";
import {ArrowRightIcon} from "@phosphor-icons/react/ArrowRight";
import {LockKeyIcon} from "@phosphor-icons/react/LockKey";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import styles from "./CareersPage.module.css";

export default function CareersApplyAction() {
    const {session, loading} = usePortalAuth();
    return <div className={styles.applyCard}>
        <span className={styles.lock}>{session ? <ArrowRightIcon size={21} weight="bold" aria-hidden="true"/> : <LockKeyIcon size={21} weight="bold" aria-hidden="true"/>}</span>
        <div className={styles.applyCopy}>
            <h2>Apply to become a mentor</h2>
            <p aria-live="polite">{loading ? "Checking your account…" : session ? "Complete the mentor application form." : "Sign in to access the mentor application form."}</p>
        </div>
        {loading ? <button className={styles.primaryButton} type="button" disabled>Checking account…</button>
            : <Link className={styles.primaryButton} href="/careers/apply">{session ? "Apply now" : "Sign in to apply"} <ArrowRightIcon size={18} weight="bold" aria-hidden="true"/></Link>}
    </div>;
}
