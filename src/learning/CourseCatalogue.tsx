"use client";

import Link from "next/link";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {ArrowRightIcon} from "@phosphor-icons/react/ArrowRight";
import type {GroundSchoolStatus, LearnerCourseSummary} from "@/src/dashboard/types/Course";
import GroundSchoolGate, {type GroundSchoolGateMode} from "@/src/ground-school/GroundSchoolGate";
import {
    dispatchGroundSchoolEnrolled,
    enrollInGroundSchoolCourse,
    GroundSchoolApiError,
} from "@/src/ground-school/ground-school-chat-client";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import styles from "./CourseCatalogue.module.css";

function courseCover(course: LearnerCourseSummary) {
    const subject = `${course.slug} ${course.title}`.toLowerCase();
    if (subject.includes("tower") && !subject.includes("ground")) return "/assets/courses/tower.webp";
    if (subject.includes("ground") && !subject.includes("tower")) return "/assets/courses/ground.webp";
    return "/assets/courses/airport.webp";
}

interface ActiveGate {
    mode: GroundSchoolGateMode;
    course: LearnerCourseSummary;
}

export default function CourseCatalogue({
    courses,
    groundSchool,
    unavailable = false,
}: {
    courses: readonly LearnerCourseSummary[];
    groundSchool?: GroundSchoolStatus;
    unavailable?: boolean;
}) {
    const router = useRouter();
    const {session} = usePortalAuth();
    const [activeGate, setActiveGate] = useState<ActiveGate | null>(null);
    const [enrollingId, setEnrollingId] = useState<string | null>(null);
    const [enrollError, setEnrollError] = useState<string>();

    const handleEnrollClick = async (course: LearnerCourseSummary) => {
        setEnrollError(undefined);
        const authenticated = Boolean(groundSchool?.authenticated || session);
        if (!authenticated) {
            setActiveGate({mode: "SIGN_IN", course});
            return;
        }
        if (groundSchool && !groundSchool.hasDiscord) {
            setActiveGate({mode: "DISCORD_REQUIRED", course});
            return;
        }
        if (groundSchool && !groundSchool.hasIfc) {
            setActiveGate({mode: "IFC_REQUIRED", course});
            return;
        }
        if (groundSchool && !groundSchool.inDiscord) {
            setActiveGate({mode: "DISCORD_SERVER_REQUIRED", course});
            return;
        }
        if (!session?.csrfToken) {
            router.push(`/ground-school/${encodeURIComponent(course.id)}`);
            return;
        }
        setEnrollingId(course.id);
        try {
            await enrollInGroundSchoolCourse(course.id, session.csrfToken);
            dispatchGroundSchoolEnrolled();
            router.push(`/ground-school/${encodeURIComponent(course.id)}`);
            router.refresh();
        } catch (reason) {
            if (reason instanceof GroundSchoolApiError) {
                if (reason.code === "DISCORD_SERVER_REQUIRED") {
                    setActiveGate({mode: "DISCORD_SERVER_REQUIRED", course});
                    return;
                }
                if (reason.code === "DISCORD_REQUIRED") {
                    setActiveGate({mode: "DISCORD_REQUIRED", course});
                    return;
                }
                if (reason.code === "IFC_REQUIRED") {
                    setActiveGate({mode: "IFC_REQUIRED", course});
                    return;
                }
            }
            setEnrollError(reason instanceof Error ? reason.message : "Unable to enroll right now.");
        } finally {
            setEnrollingId(null);
        }
    };

    if (activeGate) {
        return <main className={styles.catalogue} data-course-page>
            <GroundSchoolGate
                mode={activeGate.mode}
                returnTo={`/ground-school/${encodeURIComponent(activeGate.course.id)}`}
                course={activeGate.course}
                onBack={() => setActiveGate(null)}
                onResolved={() => {
                    const targetId = activeGate.course.id;
                    setActiveGate(null);
                    router.push(`/ground-school/${encodeURIComponent(targetId)}`);
                    router.refresh();
                }}
            />
        </main>;
    }

    return <main className={styles.catalogue} aria-labelledby="course-catalogue-title" data-course-page>
        <header className={styles.intro}>
            <h1 id="course-catalogue-title">Ground School</h1>
            <p>Build your knowledge and confidence with ATCMH Ground School. Enroll in an interactive course to learn air traffic control fundamentals and connect directly with Mentors and Moderators in your private Discord support thread.</p>
        </header>
        {enrollError ? <p className={styles.errorBanner} role="alert">{enrollError}</p> : null}
        {unavailable ? <div className={styles.empty} role="status"><h2>Ground School is temporarily unavailable</h2><p>Please try again in a moment.</p><Link href="/ground-school">Try again<ArrowRightIcon size={18}/></Link></div>
            : courses.length === 0 ? <div className={styles.empty}><h2>No Ground School courses available yet</h2><p>Published Ground School courses will appear here when they are ready.</p></div>
            : <section className={styles.grid} aria-label="Available Ground School courses">
                {courses.map((course, index) => {
                    const isEnrolled = Boolean(course.enrolled);
                    const isCompleted = course.enrollmentStatus === "completed";
                    const canOpenDirectly = isEnrolled && Boolean(groundSchool?.inDiscord);
                    return <article className={styles.card} key={course.id}>
                        <Image className={styles.cover} src={courseCover(course)} alt="" width={1200} height={480} loading={index < 4 ? "eager" : "lazy"} sizes="(max-width: 650px) calc(100vw - 64px), (max-width: 1280px) calc((100vw - 112px) / 2), 566px"/>
                        <div className={styles.cardBody}>
                            <div className={styles.cardHeading}>
                                <h2>{course.title}</h2>
                                {course.locked ? <span className={styles.lockedBadge}>Locked</span>
                                    : isCompleted ? <span className={styles.enrolledBadge}>Completed</span>
                                    : isEnrolled ? <span className={styles.enrolledBadge}>Enrolled</span>
                                    : null}
                            </div>
                            <p>{course.description || "A guided ATCMH Ground School course."}</p>
                            {(course.prerequisites.length > 0 || course.hasUnavailablePrerequisites) ? <div className={styles.prerequisites}>
                                <h3 className={styles.prerequisiteHeading}>Prerequisites</h3>
                                {course.prerequisites.length > 0 ? <ul className={styles.prerequisiteList}>
                                    {course.prerequisites.map(prerequisite => <li className={styles.prerequisiteItem} key={prerequisite.courseId}>
                                        <Link href={"/ground-school/" + encodeURIComponent(prerequisite.courseId)}>{prerequisite.title}</Link>
                                        {groundSchool?.authenticated ? <span className={prerequisite.completed ? styles.prerequisiteComplete : styles.prerequisiteIncomplete}>{prerequisite.completed ? "Completed" : "Not complete"}</span> : null}
                                    </li>)}
                                </ul> : null}
                                {course.hasUnavailablePrerequisites ? <p className={styles.unavailablePrerequisites} role="note">You cannot complete this course because a prerequisite course is private or unavailable. Contact an administrator for access.</p> : null}
                            </div> : null}
                            {course.locked ? (
                                <button className={styles.openCourse} type="button" disabled aria-label={"Locked: " + course.title}>Locked</button>
                            ) : canOpenDirectly ? (
                                <Link className={styles.openCourse} href={"/ground-school/" + encodeURIComponent(course.id)} aria-label={"Open " + course.title}>
                                    {isCompleted ? "Review course" : "Continue course"}<ArrowRightIcon size={19}/>
                                </Link>
                            ) : isEnrolled ? (
                                <Link className={styles.openCourse} href={"/ground-school/" + encodeURIComponent(course.id)} aria-label={"Open " + course.title}>
                                    Open course<ArrowRightIcon size={19}/>
                                </Link>
                            ) : (
                                <button
                                    className={styles.openCourse}
                                    type="button"
                                    disabled={enrollingId === course.id}
                                    onClick={() => void handleEnrollClick(course)}
                                    aria-label={"Enroll in " + course.title}
                                >
                                    {enrollingId === course.id ? "Enrolling…" : "Enroll"}<ArrowRightIcon size={19}/>
                                </button>
                            )}
                        </div>
                    </article>;
                })}
            </section>}
    </main>;
}
