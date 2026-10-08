import Image from "next/image";
import CareersFrame from "./CareersFrame";
import CareersApplyAction from "./CareersApplyAction";
import CareersApplicationGate from "./CareersApplicationStatus";
import styles from "./CareersPage.module.css";

const qualifications = [
    "ATCMH and IFATC sessions regularly attended",
    "Ability to give high-quality feedback",
    "Full understanding of the IFATC Manual",
    "IFATC Officer and/or Tester",
    "Consistent engagement and professionalism within the community",
    "Consistent availability",
    "Good standing on the IFC",
];

export default function CareersPage({showExpectations = false}: {showExpectations?: boolean}) {
    return <CareersFrame>
        <CareersApplicationGate showExpectations={showExpectations}>
        <main className={styles.page}>
            <header className={styles.imageFrame}>
                <Image src="/assets/mentor-applications-airport.png" alt="" fill priority sizes="100vw"/>
                <div className={styles.intro}>
                    <h1>Mentor Applications</h1>
                    <p>Mentor applications are currently open! If you have a passion for helping others succeed and believe you would be a good candidate for the position, you are welcome to apply.</p>
                    <span className={styles.rule} aria-hidden="true"/>
                </div>
            </header>

            <section className={styles.content} aria-label="Mentor application information">
                <ol className={styles.timeline}>
                    <li className={styles.step}>
                        <span className={styles.number} aria-hidden="true">1</span>
                        <div className={styles.stepCopy}>
                            <h2>The role</h2>
                            <p>Mentors support others with high-quality feedback and help aspiring controllers succeed.</p>
                        </div>
                    </li>
                    <li className={styles.step}>
                        <span className={styles.number} aria-hidden="true">2</span>
                        <div className={styles.stepCopy}>
                            <h2>Recommended qualifications</h2>
                            <p>We recommend applicants have:</p>
                            <ul className={styles.qualifications}>{qualifications.map(qualification => <li key={qualification}>{qualification}</li>)}</ul>
                            <p className={styles.note}>If you don&apos;t meet all of these qualifications you are still welcome to apply. Thanks and good luck!</p>
                        </div>
                    </li>
                    <li className={`${styles.step} ${styles.lastStep}`}>
                        <span className={styles.number} aria-hidden="true">3</span>
                        <div className={styles.stepCopy}>
                            <h2>Application notes</h2>
                            <p>If you don&apos;t hear back from us, don&apos;t worry, we haven&apos;t denied you. We will continuously add mentors as needed to meet mentee demand.</p>
                            <p>If you have previously applied for a Mentor position and are unsure if your application is still active, please open a mod-support ticket in Discord or reapply.</p>
                        </div>
                    </li>
                </ol>

                <CareersApplyAction/>
            </section>
        </main>
        </CareersApplicationGate>
    </CareersFrame>;
}
