import {BookOpenText} from "@phosphor-icons/react";
import styles from "./CourseLoadingState.module.css";

type CourseLoadingKind = "center" | "preview";

const copy = {
    center: {
        eyebrow: "Course management",
        title: "Loading Course Center…",
        description: "Getting your courses and learning tools ready.",
    },
    preview: {
        eyebrow: "Course preview",
        title: "Loading course preview…",
        description: "Preparing the lesson as your learners will see it.",
    },
} as const;

export default function CourseLoadingState({kind, headingId}: {kind: CourseLoadingKind; headingId: string}) {
    const content = copy[kind];
    return <section className={styles.screen} data-course-page data-course-loading role="status" aria-live="polite" aria-labelledby={headingId}>
        <div className={styles.card}>
            <span className={styles.icon} aria-hidden="true"><BookOpenText size={30} weight="duotone"/></span>
            <span className={styles.eyebrow}>{content.eyebrow}</span>
            <h2 id={headingId}>{content.title}</h2>
            <p>{content.description}</p>
            <span className={styles.progress} aria-hidden="true"><span/></span>
        </div>
    </section>;
}
