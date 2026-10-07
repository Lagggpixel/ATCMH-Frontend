import Link from "next/link";
import Image from "next/image";
import {ArrowRightIcon} from "@phosphor-icons/react/dist/ssr/ArrowRight";
import type {LearnerCourseSummary} from "@/src/dashboard/types/Course";
import styles from "./CourseCatalogue.module.css";

function courseCover(course: LearnerCourseSummary) {
    const subject = `${course.slug} ${course.title}`.toLowerCase();
    if (subject.includes("tower") && !subject.includes("ground")) return "/assets/courses/tower.webp";
    if (subject.includes("ground") && !subject.includes("tower")) return "/assets/courses/ground.webp";
    return "/assets/courses/airport.webp";
}

export default function CourseCatalogue({courses, unavailable = false}: {courses: readonly LearnerCourseSummary[]; unavailable?: boolean}) {
    return <main className={styles.catalogue} aria-labelledby="course-catalogue-title" data-course-page>
        <header className={styles.intro}>
            <h1 id="course-catalogue-title">Your courses</h1>
            <p>Build your knowledge and confidence. Explore our interactive courses designed for air traffic control, from the basics to more advanced operations.</p>
        </header>
        {unavailable ? <div className={styles.empty} role="status"><h2>Courses are temporarily unavailable</h2><p>Please try again in a moment.</p><Link href="/exams/courses">Try again<ArrowRightIcon size={18}/></Link></div>
            : courses.length === 0 ? <div className={styles.empty}><h2>No courses available yet</h2><p>Published courses will appear here when they are ready.</p></div>
            : <section className={styles.grid} aria-label="Available courses">
                {courses.map((course, index) => <article className={styles.card} key={course.id}>
                    <Image className={styles.cover} src={courseCover(course)} alt="" width={1200} height={480} loading={index < 4 ? "eager" : "lazy"} sizes="(max-width: 650px) calc(100vw - 64px), (max-width: 1280px) calc((100vw - 112px) / 2), 566px"/>
                    <div className={styles.cardBody}>
                        <div className={styles.cardHeading}>
                            <h2>{course.title}</h2>
                            {course.locked ? <span className={styles.lockedBadge}>Locked</span> : null}
                        </div>
                        <p>{course.description || "A guided ATCMH learning course."}</p>
                        {(course.prerequisites.length > 0 || course.hasUnavailablePrerequisites) ? <div className={styles.prerequisites}>
                            <h3 className={styles.prerequisiteHeading}>Prerequisites</h3>
                            {course.prerequisites.length > 0 ? <ul className={styles.prerequisiteList}>
                                {course.prerequisites.map(prerequisite => <li className={styles.prerequisiteItem} key={prerequisite.courseId}>
                                    <Link href={"/exams/courses/" + encodeURIComponent(prerequisite.courseId)}>{prerequisite.title}</Link>
                                    <span className={prerequisite.completed ? styles.prerequisiteComplete : styles.prerequisiteIncomplete}>{prerequisite.completed ? "Completed" : "Not complete"}</span>
                                </li>)}
                            </ul> : null}
                            {course.hasUnavailablePrerequisites ? <p className={styles.unavailablePrerequisites} role="note">You cannot complete this course because a prerequisite course is private or unavailable. Contact an administrator for access.</p> : null}
                        </div> : null}
                        {course.locked
                            ? <button className={styles.openCourse} type="button" disabled aria-label={"Open course: " + course.title}>Open course<ArrowRightIcon size={19}/></button>
                            : <Link className={styles.openCourse} href={"/exams/courses/" + encodeURIComponent(course.id)} aria-label={"Open course: " + course.title}>Open course<ArrowRightIcon size={19}/></Link>}
                    </div>
                </article>)}
            </section>}
    </main>;
}
