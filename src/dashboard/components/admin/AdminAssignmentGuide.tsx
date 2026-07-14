import type {AdminUser} from "../../types/AdminUser.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import styles from "./AdminAssignmentGuide.module.css";
import {Link} from "../../next-navigation";

interface AdminAssignmentGuideProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    adminUser: AdminUser | undefined;
}

const guideSteps = [
    {
        title: "Create the assignment template",
        body: "Open Assignments, choose New Assignment, then fill in the airport, runways, pattern altitude, server type, title, description, and footer. These fields become reusable details for every session that uses the template.",
    },
    {
        title: "Build slot groups",
        body: "Use groups for sections such as Ground, Inbound, Tower, or Observer. Add one slot per attendee task. Put the position or departure point in Label, then put the full instruction in Details.",
    },
    {
        title: "Use placeholders",
        body: "The template text controls the copied output. Keep {{groups}} where the generated slot list should appear, and use {{airport}}, {{runways}}, {{patternAltitude}}, {{serverType}}, {{description}}, and {{footer}} where those details belong.",
    },
    {
        title: "Generate from a mentee session",
        body: "On a non-cancelled session in the mentee page, open Assignment, pick a template, and use autofill to place attendees into slots. Review the order, move attendees if needed, then copy the generated Discord-ready text.",
    },
];

const AdminAssignmentGuide = ({loaded, loggedIn, error, adminUser}: AdminAssignmentGuideProps) => {
    if (!loggedIn) {
        return <AdminLoginScreen/>;
    }

    if (!loaded) {
        return <AdminLoadingScreen/>;
    }

    if (error) {
        return <AdminErrorScreen content={error}/>;
    }

    if (!adminUser) {
        return <AdminUnauthorizedScreen/>;
    }

    return (
        <div className={styles.assignmentGuideContainer}>
            <main className={styles.assignmentGuideMain}>
                <div className={styles.guideActions}>
                    <Link className={styles.primaryLink} to="/dashboard/assignments">
                        Open Assignments
                    </Link>
                </div>

                <section className={styles.guidePanel} aria-labelledby="quick-start-heading">
                    <div className={styles.panelHeader}>
                        <h2 id="quick-start-heading">Quick Start</h2>
                        <span>Recommended workflow</span>
                    </div>
                    <div className={styles.stepList}>
                        {guideSteps.map((step, index) => (
                            <article className={styles.stepItem} key={step.title}>
                                <span className={styles.stepNumber}>{index + 1}</span>
                                <div>
                                    <h3>{step.title}</h3>
                                    <p>{step.body}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles.guideGrid} aria-label="Assignment details">
                    <article className={styles.guideCard}>
                        <h2>Template Fields</h2>
                        <dl>
                            <div>
                                <dt>Airport</dt>
                                <dd>ICAO for the assignment. This is also used to match likely templates in the session generator.</dd>
                            </div>
                            <div>
                                <dt>Runways</dt>
                                <dd>Runways in use, for example 32L and 32R.</dd>
                            </div>
                            <div>
                                <dt>Pattern altitude</dt>
                                <dd>The expected circuit altitude for pilots.</dd>
                            </div>
                            <div>
                                <dt>Server type</dt>
                                <dd>Free text such as Training, IFATC, Expert, or Mock Practical.</dd>
                            </div>
                        </dl>
                    </article>

                    <article className={styles.guideCard}>
                        <h2>Ownership Rules</h2>
                        <ul>
                            <li>All active assignments can be viewed and reused by mentors.</li>
                            <li>You can edit or remove assignments that you created.</li>
                            <li>Moderators and the technical manager can edit or remove any assignment.</li>
                            <li>Removing an assignment hides it from future use; existing copied text is not affected.</li>
                        </ul>
                    </article>

                    <article className={styles.guideCard}>
                        <h2>Session Generator</h2>
                        <ul>
                            <li>Cancelled sessions do not show the assignment generator.</li>
                            <li>Autofill maps session attendees into slots from top to bottom.</li>
                            <li>Unfilled slots stay as @ so they can be assigned manually in Discord.</li>
                            <li>Assigned attendees copy as Discord mentions using the format &lt;@discord_id&gt;.</li>
                        </ul>
                    </article>

                    <article className={styles.guideCard}>
                        <h2>Good Template Habits</h2>
                        <ul>
                            <li>Keep labels short and put the instruction detail in Details.</li>
                            <li>Use separate groups when the session has different traffic types.</li>
                            <li>Put briefing reminders and feedback instructions in the footer.</li>
                            <li>Preview the copied text before posting it in Discord.</li>
                        </ul>
                    </article>
                </section>

                <section className={styles.examplePanel} aria-labelledby="example-heading">
                    <div>
                        <h2 id="example-heading">Example Slot Setup</h2>
                        <p>For an EDDK session, the template might use two groups with slots like this.</p>
                    </div>
                    <pre>{`Ground
- Cargo Apron Stand F21 | Pushback conflict with BELOW
- Cargo Apron Stand F23 | Pushback conflict with ABOVE
- Cargo Apron Stand W34 | Give way conflict with one of ABOVE | Request runway 32R

Inbound
- EDKZ | Runway 25 | Transition + inbound for touch and go once overhead
- EDGS | Runway 31 | Inbound for touch and go
- ETAD | Runway 05 | Inbound for landing | File R32L | VTF APP`}</pre>
                </section>
            </main>
        </div>
    );
};

export default AdminAssignmentGuide;
