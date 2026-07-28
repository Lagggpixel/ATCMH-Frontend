import Link from "next/link";
import {discordUrl} from "@/src/marketing/SiteHeader";
import type {ApplicationIfcLinkOutcome, ApplicationIfcLinkResult} from "@/src/lib/application-ifc-link-result";
import styles from "./ApplicationIfcLinkResultPage.module.css";

interface Presentation {
  eyebrow: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "error";
}
const presentations: Record<ApplicationIfcLinkOutcome, Presentation> = {
  linked: {
    eyebrow: "Link complete",
    title: "Infinite Flight account linked",
    detail: "Your pilot account is now securely linked to ATCMH. Continue your website application where you left off.",
    tone: "success",
  },
  cancelled_or_not_approved: {
    eyebrow: "Authorization incomplete",
    title: "Authorization cancelled or not approved",
    detail: "Infinite Flight cannot tell us whether you selected Deny, closed the authorization page, or went back before approving. No account was linked. Return to Discord and start a new linking attempt when you are ready.",
    tone: "warning",
  },
  temporarily_unavailable: {
    eyebrow: "Provider unavailable",
    title: "Infinite Flight is temporarily unavailable",
    detail: "Infinite Flight could not complete authorization right now. Return to Discord and start a new linking attempt later.",
    tone: "warning",
  },
  login_required: {
    eyebrow: "Sign-in required",
    title: "Infinite Flight needs you to sign in again",
    detail: "Return to Discord, start a new linking attempt, and sign in to Infinite Flight when prompted.",
    tone: "warning",
  },
  interaction_required: {
    eyebrow: "More authorization needed",
    title: "Infinite Flight needs another approval step",
    detail: "Account selection, consent, or another sign-in step is still required. Return to Discord and start a new linking attempt to continue.",
    tone: "warning",
  },
  provider_failure: {
    eyebrow: "Authorization failed",
    title: "Infinite Flight could not verify this account",
    detail: "No account was linked. Return to Discord and start a new linking attempt. If the problem continues, contact ATCMH staff and include the attempt reference below.",
    tone: "error",
  },
  invalid_attempt: {
    eyebrow: "Attempt unavailable",
    title: "This linking attempt is invalid or expired",
    detail: "The attempt may have expired or already been used. Return to Discord and start a new linking attempt.",
    tone: "error",
  },
  link_conflict: {
    eyebrow: "Account review required",
    title: "This Infinite Flight account is already linked",
    detail: "Nothing was changed. Contact ATCMH staff in Discord so they can review the account links safely.",
    tone: "error",
  },
  persistence_failure: {
    eyebrow: "ATCMH could not save the result",
    title: "Account linking could not be completed",
    detail: "ATCMH could not safely finish saving this attempt. Return to Discord before trying again, and include the attempt reference if you contact staff.",
    tone: "error",
  },
};

const unavailable: Presentation = {
  eyebrow: "Result unavailable",
  title: "This link result is invalid or expired",
  detail: "Return to Discord and start a new linking attempt. No account information was taken from this result link.",
  tone: "error",
};

export default function ApplicationIfcLinkResultPage({result}: {result?: ApplicationIfcLinkResult}) {
  const presentation = result ? presentations[result.outcome] : unavailable;
  const continuation = result?.outcome === "linked" && result.applicationType
    ? `/apply?${new URLSearchParams({type: result.applicationType, source: "discord"})}`
    : undefined;
  const role = presentation.tone === "success" ? "status" : "alert";

  return <main className={styles.page}>
    <section className={`${styles.card} ${styles[presentation.tone]}`} role={role} aria-labelledby="link-result-title">
      <div className={styles.badge} aria-hidden="true">{presentation.tone === "success" ? "✓" : presentation.tone === "warning" ? "!" : "×"}</div>
      <p className={styles.eyebrow}>{presentation.eyebrow}</p>
      <h1 id="link-result-title">{presentation.title}</h1>
      <p className={styles.detail}>{presentation.detail}</p>
      {result?.attemptReference ? <p className={styles.reference}><span>Attempt reference</span><code>{result.attemptReference}</code></p> : null}
      <div className={styles.actions}>
        {continuation ? <Link className={styles.primary} href={continuation}>Continue application</Link>
          : <a className={styles.primary} href={discordUrl} target="_blank" rel="noopener noreferrer">Return to Discord</a>}
        {continuation ? <a className={styles.secondary} href={discordUrl} target="_blank" rel="noopener noreferrer">Return to Discord</a>
          : <Link className={styles.secondary} href="/apply">Go to applications</Link>}
      </div>
    </section>
  </main>;
}
