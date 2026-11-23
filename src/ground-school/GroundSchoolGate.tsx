"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {ArrowLeftIcon} from "@phosphor-icons/react/ArrowLeft";
import {ArrowRightIcon} from "@phosphor-icons/react/ArrowRight";
import {ArrowSquareOutIcon} from "@phosphor-icons/react/ArrowSquareOut";
import {ArrowsClockwiseIcon} from "@phosphor-icons/react/ArrowsClockwise";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import {loginPath} from "@/src/dashboard/utils/AuthSessionUtils";
import {discordUrl} from "@/src/marketing/SiteHeader";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {
    dispatchGroundSchoolEnrolled,
    enrollInGroundSchoolCourse,
    getGroundSchoolStatus,
    GroundSchoolApiError,
} from "./ground-school-chat-client";
import styles from "./GroundSchoolGate.module.css";

export type GroundSchoolGateMode =
    | "SIGN_IN"
    | "DISCORD_REQUIRED"
    | "IFC_REQUIRED"
    | "DISCORD_SERVER_REQUIRED"
    | "ENROLLMENT_REQUIRED";

interface Props {
    mode: GroundSchoolGateMode;
    returnTo: string;
    course?: {id: string; slug: string; title: string; description: string};
    onResolved?: () => void;
    onBack?: () => void;
}

export default function GroundSchoolGate({mode, returnTo, course, onResolved, onBack}: Props) {
    const router = useRouter();
    const {session} = usePortalAuth();
    const [currentMode, setCurrentMode] = useState<GroundSchoolGateMode>(mode);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string>();

    const checkDiscordAgain = async () => {
        setBusy(true);
        setFeedback(undefined);
        try {
            const status = await getGroundSchoolStatus(true);
            if (!status.authenticated) {
                setCurrentMode("SIGN_IN");
                return;
            }
            if (!status.hasDiscord) {
                setCurrentMode("DISCORD_REQUIRED");
                return;
            }
            if (!status.hasIfc) {
                setCurrentMode("IFC_REQUIRED");
                return;
            }
            if (status.inDiscord) {
                if (course) {
                    setCurrentMode("ENROLLMENT_REQUIRED");
                }
                if (onResolved) onResolved();
                else router.refresh();
                return;
            }
            setFeedback(status.discordUnavailable
                ? "Discord verification is temporarily unavailable. Please try again shortly."
                : "We still don't see you in the ATCMH Discord server. Join via the link above, then check again.");
        } catch (reason) {
            setFeedback(reason instanceof Error ? reason.message : "Could not check Discord membership.");
        } finally {
            setBusy(false);
        }
    };

    const enroll = async () => {
        if (!course) return;
        if (!session?.csrfToken) {
            setCurrentMode("SIGN_IN");
            return;
        }
        setBusy(true);
        setFeedback(undefined);
        try {
            await enrollInGroundSchoolCourse(course.id, session.csrfToken);
            dispatchGroundSchoolEnrolled();
            if (onResolved) {
                onResolved();
            } else {
                router.push(`/ground-school/${encodeURIComponent(course.id)}`);
                router.refresh();
            }
        } catch (reason) {
            if (reason instanceof GroundSchoolApiError) {
                if (reason.code === "DISCORD_SERVER_REQUIRED") {
                    setCurrentMode("DISCORD_SERVER_REQUIRED");
                    return;
                }
                if (reason.code === "DISCORD_REQUIRED") {
                    setCurrentMode("DISCORD_REQUIRED");
                    return;
                }
                if (reason.code === "IFC_REQUIRED") {
                    setCurrentMode("IFC_REQUIRED");
                    return;
                }
            }
            setFeedback(reason instanceof Error ? reason.message : "Unable to enroll right now.");
        } finally {
            setBusy(false);
        }
    };

    const backControl = onBack
        ? <button type="button" className={styles.backLink} onClick={onBack}><ArrowLeftIcon size={16}/>Back to Ground School</button>
        : <Link className={styles.backLink} href="/ground-school"><ArrowLeftIcon size={16}/>Back to Ground School</Link>;

    if (currentMode === "SIGN_IN") {
        return <section className={styles.gateCard} aria-labelledby="gs-gate-title">
            {backControl}
            <p className={styles.eyebrow}>Ground School</p>
            <h1 id="gs-gate-title">Sign in to participate in the Ground School</h1>
            <p className={styles.copy}>
                Sign in with Discord or Infinite Flight to enroll{course ? ` in ${course.title}` : ""}. Both Discord and Infinite Flight accounts must be linked to participate.
            </p>
            <div className={styles.actions}>
                <a className={styles.primary} href={loginPath(ApiUtils.apiOrigin, "discord", returnTo)}>Continue with Discord</a>
                <a className={styles.secondary} href={loginPath(ApiUtils.apiOrigin, "ifc", returnTo)}>Continue with Infinite Flight</a>
            </div>
        </section>;
    }

    if (currentMode === "DISCORD_REQUIRED" || currentMode === "IFC_REQUIRED") {
        const linkedProvider = currentMode === "IFC_REQUIRED" ? "discord" : "ifc";
        const missingLabel = currentMode === "IFC_REQUIRED" ? "Infinite Flight Community" : "Discord";
        return <section className={styles.gateCard} aria-labelledby="gs-gate-title">
            {backControl}
            <p className={styles.eyebrow}>Account setup</p>
            <h1 id="gs-gate-title">Finish setting up your ATCMH account</h1>
            <p className={styles.copy}>
                Ground School requires both Discord and {missingLabel} linked to your ATCMH account so we can create your private support thread under your IFC name.
            </p>
            <div className={styles.actions}>
                <a className={styles.primary} href={loginPath(ApiUtils.apiOrigin, linkedProvider, returnTo)}>
                    Continue account setup<ArrowRightIcon size={18}/>
                </a>
            </div>
        </section>;
    }

    if (currentMode === "DISCORD_SERVER_REQUIRED") {
        return <section className={styles.gateCard} aria-labelledby="gs-gate-title">
            {backControl}
            <p className={styles.eyebrow}>Discord server required</p>
            <h1 id="gs-gate-title">You must join our discord server to participate in the Ground School.</h1>
            <p className={styles.copy}>
                Ground School pairs interactive lessons with a private Discord support thread where ATCMH Mentors and Moderators answer your questions. Join our Discord server first, then check again below.
            </p>
            {feedback ? <p className={styles.feedback} role="alert">{feedback}</p> : null}
            <div className={styles.actions}>
                <a className={styles.primary} href={discordUrl} target="_blank" rel="noopener noreferrer">
                    Join Discord server<ArrowSquareOutIcon size={18}/>
                </a>
                <button type="button" className={styles.secondary} disabled={busy} onClick={() => void checkDiscordAgain()}>
                    <ArrowsClockwiseIcon size={18}/>{busy ? "Checking…" : "I've joined — Check again"}
                </button>
            </div>
        </section>;
    }

    return <section className={styles.gateCard} aria-labelledby="gs-gate-title">
        {backControl}
        <p className={styles.eyebrow}>Ground School enrollment</p>
        <h1 id="gs-gate-title">{course?.title ?? "Enroll in Ground School"}</h1>
        <p className={styles.copy}>
            {course?.description || "Enroll to access this Ground School course and connect directly with ATCMH Mentors and Moderators."}
        </p>
        <p className={styles.hint}>
            Enrolling opens your private Ground School thread in our Discord server and enables the on-site support chatbox.
        </p>
        {feedback ? <p className={styles.feedback} role="alert">{feedback}</p> : null}
        <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy || !course} onClick={() => void enroll()}>
                {busy ? "Enrolling…" : "Enroll in Ground School"}<ArrowRightIcon size={18}/>
            </button>
        </div>
    </section>;
}
