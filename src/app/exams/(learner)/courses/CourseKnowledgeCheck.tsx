"use client";

import {useId, useState} from "react";
import type {CourseCheckBlock} from "@/src/lib/course-document";
import styles from "./CourseReader.module.css";

export default function CourseKnowledgeCheck({block}: {block: CourseCheckBlock}) {
  const name = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const correct = selected === block.correctOption;
  return <aside className={styles.knowledgeCheck} aria-label="Ungraded knowledge check">
    <p className={styles.quizEyebrow}>Quick check · ungraded</p>
    <fieldset><legend>{block.prompt}</legend>{block.options.map((option, index) => <label key={index}>
      <input type="radio" name={name} checked={selected === index} onChange={() => setSelected(index)}/><span>{option}</span>
    </label>)}</fieldset>
    {selected !== null ? <div className={styles.checkFeedback} role="status"><strong>{correct ? "Correct." : "Not quite."}</strong> {correct ? block.explanation : block.incorrectExplanation ?? block.explanation}</div> : null}
    <p className={styles.checkNote}>Practice only. Your answer is not saved and does not affect course completion.</p>
    {selected !== null ? <button type="button" onClick={() => setSelected(null)}>Try again</button> : null}
  </aside>;
}
