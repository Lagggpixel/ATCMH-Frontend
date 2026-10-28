"use client";
import {useState} from "react";
import {ArrowSquareOut} from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import {Circle} from "@phosphor-icons/react/dist/csr/Circle";
import LearningFrame from "../../learning/LearningFrame";
import SessionAccess from "../SessionAccess";
import ChangelogDialog from "./ChangelogDialog";
import {CHANGELOG_PATH, changelogDate, visibleChangelog} from "./changelog";
import styles from "./Changelog.module.css";

export default function ChangelogPage() {
  return <LearningFrame product="Sweatbox"><SessionAccess embedded role="staff" returnTo={CHANGELOG_PATH}>{() => <ChangelogFeed/>}</SessionAccess></LearningFrame>;
}
function ChangelogFeed() {
  const days = visibleChangelog();
  const [preview, setPreview] = useState(false);
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1>Changelog</h1><p>What’s new in Ground &amp; Tower training.</p></div>{days.length ? <button type="button" className={styles.preview} onClick={() => setPreview(true)}>Preview latest updates<ArrowSquareOut size={19} aria-hidden="true"/></button> : null}</header>
    {days.length ? <div className={styles.feed}>{days.map((day, index) => <section key={day.date} className={styles.day} data-latest={index === 0} aria-label={`Updates for ${changelogDate(day.date, "date")}`}>
      <time dateTime={day.date} className={styles.date}><span>{changelogDate(day.date, "weekday")}</span>{changelogDate(day.date, "date")}</time>
      <div className={styles.updates}><Circle className={styles.marker} size={10} weight="fill" aria-hidden="true"/>{day.updates.map(update => <article key={update.title}><h2>{update.title}</h2><p>{update.description}</p></article>)}</div>
    </section>)}</div> : <p className={styles.empty}>No changelogs yet. Check back for Ground &amp; Tower updates.</p>}
    <ChangelogDialog open={preview} days={days.slice(0, 1)} onClose={() => setPreview(false)}/>
  </main>;
}
