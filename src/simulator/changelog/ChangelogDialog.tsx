"use client";
import {useEffect, useId, useRef} from "react";
import {createPortal} from "react-dom";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {CHANGELOG_PATH, changelogDate, type ChangelogDay} from "./changelog";
import styles from "./Changelog.module.css";

export default function ChangelogDialog({open, days, onClose, onPresented}: {open: boolean; days: readonly ChangelogDay[]; onClose: () => void; onPresented?: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId(), description = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element || element.open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal(); onPresented?.();
    return () => {
      element.close();
      if (returnFocus?.isConnected && returnFocus !== document.body) returnFocus.focus({preventScroll: true});
      else document.getElementById("learning-content")?.focus({preventScroll: true});
    };
  }, [open, onPresented]);
  if (!open) return null;
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={title} aria-describedby={description} onCancel={onClose} onClose={onClose} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]');
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
  }}>
    <header className={styles.dialogHeader}><div><h2 id={title}>Latest updates</h2><p id={description}>What’s new in Ground &amp; Tower training.</p></div><button type="button" className={styles.close} aria-label="Close latest updates" onClick={onClose}><X size={22} aria-hidden="true"/></button></header>
    <div className={styles.dialogBody}>{days.map(day => <section key={day.date} aria-label={`Updates for ${changelogDate(day.date, "date")}`}><h3><time dateTime={day.date}>{changelogDate(day.date, "date")}</time></h3><ul>{day.updates.map(update => <li key={update.title}><h4>{update.title}</h4><p>{update.description}</p></li>)}</ul></section>)}</div>
    {/* Full navigation, like the Sweatbox top bar, avoids WebKit's status-bar regression on client-side page changes. */}
    <footer className={styles.dialogFooter}><a href={CHANGELOG_PATH} onClick={onClose}>View all changelogs</a><button type="button" className={styles.primary} onClick={onClose}>Continue</button></footer>
  </dialog>, document.body);
}
