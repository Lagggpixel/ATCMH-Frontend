"use client";
import {useSyncExternalStore, type ReactNode} from "react";
import Link from "next/link";
import LearningFrame from "../learning/LearningFrame";
import {TrainingNav} from "./TrainingLibrary";
import styles from "./LibraryPages.module.css";

const query = "(max-width: 700px), (max-width: 950px) and (orientation: portrait)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => window.matchMedia(query).matches;

export default function EditorScreen({children}: {children: ReactNode}) {
  const narrow = useSyncExternalStore(subscribe, snapshot, () => true);
  if (!narrow) return children;
  return <LearningFrame product="Simulator"><main className={styles.library}>
    <TrainingNav active="scenarios"/><section className={styles.libraryContent}>
      <h1>Scenario editor</h1><p>Use a computer or turn your tablet to landscape to create and edit scenarios.</p>
      <Link href="/simulator/scenarios">Back to scenarios</Link>
    </section>
  </main></LearningFrame>;
}
