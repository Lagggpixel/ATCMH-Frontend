import Link from "next/link";
import Image from "next/image";
import {ArrowRightIcon} from "@phosphor-icons/react/dist/ssr/ArrowRight";
import type {ManagedCourseSummary} from "@/src/dashboard/types/Course";
import styles from "./CourseCatalogue.module.css";

function courseCover(course: ManagedCourseSummary) {
    const subject = `${course.slug} ${course.title}`.toLowerCase();
    if (subject.includes("tower") && !subject.includes("ground")) return "/assets/courses/tower.webp";
    if (subject.includes("ground") && !subject.includes("tower")) return "/assets/courses/ground.webp";
    return "/assets/courses/airport.webp";
}

export default function CourseCatalogue({courses, unavailable = false}: {courses: readonly ManagedCourseSummary[]; unavailable?: boolean}) {
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
                        <h2>{course.title}</h2>
                        <p>{course.description || "A guided ATCMH learning course."}</p>
                        <Link className={styles.openCourse} href={`/exams/courses/${course.id}`} aria-label={`Open course: ${course.title}`}>Open course<ArrowRightIcon size={19}/></Link>
                    </div>
                </article>)}
            </section>}
    </main>;
}
