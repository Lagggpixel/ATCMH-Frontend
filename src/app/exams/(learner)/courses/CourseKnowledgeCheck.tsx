"use client";

import {useId, useState} from "react";
import {GraduationCapIcon} from "@phosphor-icons/react/GraduationCap";
import type {CourseCheckBlock} from "@/src/lib/course-document";
import styles from "./CourseReader.module.css";

export default function CourseKnowledgeCheck({block}: {block: CourseCheckBlock}) {
  const name = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const correct = selected === block.correctOption;
  return <aside className={styles.knowledgeCheck} aria-label="Ungraded knowledge check">
    <p className={styles.knowledgeLabel}><GraduationCapIcon size={22} weight="fill"/>Knowledge check</p>
    <fieldset><legend>{block.prompt}</legend>{block.options.map((option, index) => <label key={index}>
      <input type="radio" name={name} checked={selected === index} onChange={() => {setSelected(index); setChecked(false);}}/><span>{option}</span>
    </label>)}</fieldset>
    {checked ? <div className={styles.checkFeedback} role="status"><strong>{correct ? "Correct." : "Not quite."}</strong> {correct ? block.explanation : block.incorrectExplanation ?? block.explanation}</div> : null}
    <div className={styles.checkActions}><span className={styles.checkNote}>Practice only · answers are not saved</span><button type="button" disabled={selected === null} onClick={() => {if (checked) {setSelected(null); setChecked(false);} else setChecked(true);}}>{checked ? "Try again" : "Check answer"}</button></div>
  </aside>;
}
