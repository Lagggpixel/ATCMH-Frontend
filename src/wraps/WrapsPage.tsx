"use client";

import {useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode} from "react";
import {Airplane} from "@phosphor-icons/react/dist/csr/Airplane";
import {CalendarBlank} from "@phosphor-icons/react/dist/csr/CalendarBlank";
import {ChartBar} from "@phosphor-icons/react/dist/csr/ChartBar";
import {Check} from "@phosphor-icons/react/dist/csr/Check";
import {FileText} from "@phosphor-icons/react/dist/csr/FileText";
import {GraduationCap} from "@phosphor-icons/react/dist/csr/GraduationCap";
import {LockSimple} from "@phosphor-icons/react/dist/csr/LockSimple";
import {Trophy} from "@phosphor-icons/react/dist/csr/Trophy";
import {User} from "@phosphor-icons/react/dist/csr/User";
import {Users} from "@phosphor-icons/react/dist/csr/Users";
import type {AttendanceSummary, MentorSummary, WrapData, WrapExam, WrapMilestone, WrapPeriod, WrapView} from "./wraps-preview";
import styles from "./WrapsPage.module.css";
import {wrapStoryStats, type WrapStoryStat} from "./wraps-story";

const views = [
    {id: "member", label: "Member", icon: User},
    {id: "mentee", label: "Mentee", icon: GraduationCap},
    {id: "mentor", label: "Mentor", icon: Users},
] as const;
const milestoneIcons = {calendar: CalendarBlank, people: Users, exam: FileText, plane: Airplane, chart: ChartBar, trophy: Trophy};
const subtitles: Record<WrapView, string> = {
    member: "A year of showing up and supporting the skies.",
    mentee: "From your first session to a new chapter in the skies.",
    mentor: "A year of helping others find their confidence.",
};

function Count({value}: {value: number}) {
    const node = useRef<HTMLSpanElement>(null);
    const [displayed, setDisplayed] = useState(value);
    useEffect(() => {
        if (!node.current) return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = 0;
        const finish = () => {window.cancelAnimationFrame(frame); setDisplayed(value);};
        const animate = () => {
            if (motion.matches) return finish();
            const started = performance.now();
            const tick = (time: number) => {
                const progress = Math.min(1, (time - started) / 1050);
                setDisplayed(Math.round(value * (1 - Math.pow(1 - progress, 3))));
                if (progress < 1) frame = window.requestAnimationFrame(tick);
            };
            frame = window.requestAnimationFrame(tick);
        };
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {animate(); observer.disconnect();}
        }, {threshold: 0.4});
        observer.observe(node.current);
        motion.addEventListener("change", finish);
        return () => {observer.disconnect(); window.cancelAnimationFrame(frame); motion.removeEventListener("change", finish);};
    }, [value]);
    return <span ref={node} className={styles.count} aria-label={String(value)}><span aria-hidden="true">{displayed}</span></span>;
}

function ScrollStat({stat, index, total}: {stat: WrapStoryStat; index: number; total: number}) {
    const scene = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(false);
    useEffect(() => {
        if (!scene.current) return;
        const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), {rootMargin: "-18% 0px -18% 0px", threshold: .25});
        observer.observe(scene.current);
        return () => observer.disconnect();
    }, []);
    const Icon = milestoneIcons[stat.icon];
    return <section className={styles.scrollChapter} aria-labelledby={`highlight-${index}`}>
        <div className={styles.story} data-active={active}>
            <div className={styles.storyTop}><span className={styles.eyebrow}>{stat.period}</span><span className={styles.storyPosition}>{String(index + 1).padStart(2, "0")} <span>/ {String(total).padStart(2, "0")}</span></span></div>
            <div className={styles.storyProgress} aria-hidden="true"><span style={{width: `${(index + 1) / total * 100}%`}}/></div>
            <div ref={scene} className={styles.storyScene}>
                <strong className={`${styles.storyValue}${typeof stat.value === "string" ? ` ${styles.storyWord}` : ""}`}>{typeof stat.value === "number" && active ? <Count value={stat.value}/> : stat.value}</strong>
                <div className={styles.storyCopy}><span className={styles.storyIcon}><Icon size={28} aria-hidden="true"/></span><h2 id={`highlight-${index}`}>{stat.label}</h2><p>{stat.description}</p></div>
            </div>
        </div>
    </section>;
}

function WrapExperience({data, view, children}: {data: WrapData; view: WrapView; children: ReactNode}) {
    const stats = useMemo(() => wrapStoryStats(data, view), [data, view]);
    return <div className={styles.experience}>
        <div className={styles.scrollStory} aria-label="Your wrap highlights">{stats.map((stat, index) => <ScrollStat key={`${stat.period}-${stat.label}`} stat={stat} index={index} total={stats.length}/>)}</div>
        <div className={styles.overviewHeading}><span className={styles.eyebrow}>Your wrap, all together</span><h2>The whole picture.</h2></div>
        <div className={styles.overview}>{children}</div>
    </div>;
}

function Journey({title, milestones}: {title: string; milestones: WrapMilestone[]}) {
    return <section className={styles.journey} aria-label={title}>
        <h2 className={styles.eyebrow}>{title}</h2>
        {milestones.length ? <ol className={styles.timeline}>
            {milestones.map((milestone, index) => {
                const Icon = milestoneIcons[milestone.icon];
                return <li key={`${milestone.date}-${milestone.title}`} className={`${styles.milestone}${milestone.achievement ? ` ${styles.achievement}` : ""}`} style={{"--step": index} as CSSProperties}>
                    <span className={styles.date}>{milestone.date}</span>
                    <span className={styles.marker}><Icon size={22} weight={milestone.achievement ? "fill" : "regular"} aria-hidden="true"/></span>
                    <div className={styles.milestoneCopy}>
                        <h3>{milestone.title}</h3>
                        <p>{milestone.description}</p>
                        {milestone.detail ? <span className={styles.detail}>{milestone.detail}</span> : null}
                    </div>
                </li>;
            })}
        </ol> : <p className={styles.empty}>Your next chapter starts with your first session.</p>}
    </section>;
}

function SmallMetric({value, label, description}: {value: number; label: string; description?: string}) {
    return <div className={styles.smallMetric}><strong><Count value={value}/></strong><span>{label}</span>{description ? <p>{description}</p> : null}</div>;
}

function Exams({exams}: {exams: WrapExam[]}) {
    return <section className={styles.secondarySection} aria-label="Your exam attempts">
        <h3 className={styles.eyebrow}>Your exam attempts</h3>
        {exams.length ? <ul className={styles.examList}>{exams.map(exam => <li key={exam.name}>
            <FileText size={22} aria-hidden="true"/>
            <strong>{exam.name}</strong>
            <span>{exam.attempts} {exam.attempts === 1 ? "attempt" : "attempts"}</span>
            <span className={exam.passed ? styles.passed : styles.attempted}>{exam.passed ? <Check size={14} weight="bold" aria-hidden="true"/> : null}{exam.passed ? "Passed" : "Attempted"}</span>
        </li>)}</ul> : <p className={styles.empty}>No exam attempts recorded in this period.</p>}
    </section>;
}

function Attendance({summary, exams, showHighlight = false}: {summary: AttendanceSummary; exams?: WrapExam[]; showHighlight?: boolean}) {
    return <section className={styles.summary} aria-label="Member attendance statistics">
        <h2 className={styles.eyebrow}>You showed up</h2>
        <div className={styles.principal}><strong><Count value={summary.attended}/></strong><h3>Recorded attendances</h3><p>Sessions you attended with a recorded attendance.</p></div>
        <div className={styles.metricRow}>
            <SmallMetric value={summary.joined} label="Sessions joined" description="Your sign-ups in this period."/>
            <SmallMetric value={summary.cancelled} label="Sign-ups cancelled" description="Your personal cancellations."/>
        </div>
        {exams ? <Exams exams={exams}/> : null}
        {showHighlight ? <section className={styles.secondarySection}>
            <h3 className={styles.eyebrow}>Your busiest month</h3>
            <strong className={styles.monthName}>{summary.busiestMonth}</strong>
            <p className={styles.highlight}>{summary.busiestCount} recorded attendances</p>
            <p className={styles.supporting}>Your presence helps the next generation of controllers.</p>
        </section> : null}
    </section>;
}

function MentorStats({summary}: {summary: MentorSummary}) {
    return <section className={styles.summary} aria-label="Mentoring statistics">
        <h2 className={styles.eyebrow}>You helped others take off</h2>
        <div className={styles.principal}><strong><Count value={summary.delivered}/></strong><h3>Sessions delivered</h3><p>Completed mentoring sessions in this period.</p></div>
        <div className={`${styles.metricRow} ${styles.threeMetrics}`}>
            <SmallMetric value={summary.supported} label="Mentees supported"/>
            <SmallMetric value={summary.passed} label="Mentees passed"/>
            <SmallMetric value={summary.cancelled} label="Sessions cancelled"/>
        </div>
        <section className={styles.secondarySection} aria-label="Your mock exams">
            <h3 className={styles.eyebrow}>Your mock exams</h3>
            <div className={styles.mockMetrics}><SmallMetric value={summary.mocks} label="Conducted"/><SmallMetric value={summary.mockPasses} label="Passed attempts"/></div>
            <p className={styles.supporting}>Recorded mock assessments, separate from official IFATC exam results.</p>
        </section>
    </section>;
}

function PeriodContent({period, view, monthly = false}: {period: WrapPeriod; view: WrapView; monthly?: boolean}) {
    const journey = view === "member" ? period.memberJourney : view === "mentee" ? period.menteeJourney : period.mentorJourney;
    const title = view === "member" ? "Your attendance journey" : view === "mentee" ? "Your mentorship journey" : "Your mentoring journey";
    return <>
        <div className={styles.periodGrid}>
            <Journey title={title} milestones={journey}/>
            {view === "mentor" ? <MentorStats summary={period.mentor}/> : <Attendance summary={period.attendance} exams={view === "mentee" ? period.exams : undefined} showHighlight={view === "member" && !monthly}/>}
        </div>
        {view === "mentor" ? <div className={styles.memberSection}>
            <div className={styles.sectionHeading}><span className={styles.eyebrow}>Your place in the community</span><h2>You showed up, too.</h2><p>Your sessions as a participant, alongside the sessions you hosted.</p></div>
            <div className={styles.periodGrid}><Journey title="Your attendance journey" milestones={period.memberJourney}/><Attendance summary={period.attendance} showHighlight={!monthly}/></div>
        </div> : null}
    </>;
}

export default function WrapsPage({data}: {data: WrapData}) {
    const [view, setView] = useState<WrapView>("member");
    const [floating, setFloating] = useState(false);
    const control = useRef<HTMLDivElement>(null);
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    useEffect(() => {
        if (!control.current) return;
        const observer = new IntersectionObserver(([entry]) => {
            setFloating(!entry.isIntersecting && entry.boundingClientRect.top < 80);
        }, {rootMargin: "-80px 0px 0px 0px"});
        observer.observe(control.current);
        return () => observer.disconnect();
    }, []);
    function selectView(next: WrapView) {
        setView(next);
        if (floating) window.scrollTo({top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
    }
    function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        const next = event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        selectView(views[next].id);
        tabs.current[next]?.focus();
    }
    return <main className={styles.page}>
        <div className={styles.radar} aria-hidden="true"/>
        <div className={styles.container}>
            <header className={styles.hero}>
                <div className={styles.preview}><LockSimple size={15} aria-hidden="true"/>Super admin preview{data.example ? <span>Example activity</span> : null}</div>
                <div className={styles.heroRow}>
                    <div><h1>Your <span>2026</span> wrap</h1><p className={styles.subtitle}>{subtitles[view]}</p><p className={styles.period}>1 January – {data.asOf}<span>Year to date</span></p></div>
                    <div className={styles.viewControl} ref={control}><div className={floating ? styles.floatingControl : undefined}><span className={styles.controlLabel}>Preview as</span>
                        <div className={styles.tabs} role="tablist" aria-label="Preview wrap views" style={{"--active-view": views.findIndex(item => item.id === view)} as CSSProperties}>
                            {views.map((item, index) => <button key={item.id} ref={node => {tabs.current[index] = node;}} type="button" id={`wrap-tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls="wrap-panel" tabIndex={view === item.id ? 0 : -1} onClick={() => selectView(item.id)} onKeyDown={event => moveTab(event, index)}><item.icon size={17} aria-hidden="true"/>{item.label}</button>)}
                        </div>
                    </div></div>
                </div>
            </header>
            <div id="wrap-panel" role="tabpanel" aria-labelledby={`wrap-tab-${view}`} tabIndex={0} className={styles.panel}>
                <WrapExperience key={view} data={data} view={view}>
                    <PeriodContent period={data.year} view={view}/>
                    <div className={styles.chapterDivider}><Airplane size={22} weight="fill" aria-hidden="true"/><span>A closer look at your last month</span></div>
                    <section className={styles.monthly} aria-labelledby="august-heading">
                        <header className={styles.monthHeader}><div><span className={styles.eyebrow}>A month to remember</span><h2 id="august-heading">Your <span>August</span> highlights</h2><p>1–31 August 2026</p></div><span className={styles.completed}><Check size={14} aria-hidden="true"/>Complete</span></header>
                        <PeriodContent period={data.august} view={view} monthly/>
                    </section>
                    <footer className={styles.closing}><div className={styles.flightLine} aria-hidden="true"><Airplane size={26} weight="fill"/></div><h2>Every session is a step forward.</h2><p>Thanks for being part of ATCMH.</p></footer>
                </WrapExperience>
            </div>
        </div>
    </main>;
}
