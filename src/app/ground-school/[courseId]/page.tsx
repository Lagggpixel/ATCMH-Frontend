import Link from "next/link";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {
    CourseLockedError,
    getCourseForLearner,
    GroundSchoolGateError,
} from "@/src/lib/course-api-client";
import {getVerifiedCentralSession} from "@/src/lib/learner-session";
import DashboardExamSessionBootstrap from "@/src/app/exams/(learner)/DashboardExamSessionBootstrap";
import CourseReadingView from "@/src/app/exams/(learner)/courses/CourseReadingView";
import CoursePrerequisiteStatus from "@/src/app/exams/(learner)/courses/CoursePrerequisiteStatus";
import styles from "@/src/app/exams/(learner)/courses/CourseReader.module.css";
import GroundSchoolGate from "@/src/ground-school/GroundSchoolGate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Ground School"};

export default async function GroundSchoolCoursePage({params, searchParams}: {
    params: Promise<{courseId: string}>;
    searchParams: Promise<{subsection?: string}>;
}) {
    const {courseId} = await params;
    const {subsection} = await searchParams;
    const returnTo = `/ground-school/${encodeURIComponent(courseId)}${subsection ? `?subsection=${encodeURIComponent(subsection)}` : ""}`;
    const session = await getVerifiedCentralSession();

    if (!session) {
        return <main className={`learner-main ${styles.catalogShell}`} data-course-page>
            <div className={styles.coursePage}>
                <DashboardExamSessionBootstrap/>
                <GroundSchoolGate mode="SIGN_IN" returnTo={returnTo}/>
            </div>
        </main>;
    }

    let course: Awaited<ReturnType<typeof getCourseForLearner>>;
    try {
        course = await getCourseForLearner(courseId);
    } catch (reason) {
        if (reason instanceof CourseLockedError) {
            return <main className="learner-main">
                <div className={styles.coursePage}>
                    <DashboardExamSessionBootstrap/>
                    <section className={`${styles.privateGate} ${styles.privateGateLocked}`} aria-labelledby="course-locked-title">
                        <Link className={styles.backLink} href="/ground-school">← Back to Ground School</Link>
                        <p className={styles.eyebrow}>Ground School</p>
                        <h1 id="course-locked-title">Course is locked</h1>
                        <p>Complete the available prerequisites below before enrolling in this Ground School course.</p>
                        <CoursePrerequisiteStatus prerequisites={reason.prerequisites} hasUnavailablePrerequisites={reason.hasUnavailablePrerequisites}/>
                    </section>
                </div>
            </main>;
        }
        if (reason instanceof GroundSchoolGateError) {
            return <main className={`learner-main ${styles.catalogShell}`} data-course-page>
                <div className={styles.coursePage}>
                    <DashboardExamSessionBootstrap/>
                    <GroundSchoolGate
                        mode={reason.code}
                        returnTo={returnTo}
                        course={reason.course}
                    />
                </div>
            </main>;
        }
        throw reason;
    }

    if (!course) notFound();
    return <CourseReadingView course={course} subsection={subsection}/>;
}
