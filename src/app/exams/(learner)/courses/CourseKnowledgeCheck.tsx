"use client";

import {useId, useState} from "react";
import {GraduationCapIcon} from "@phosphor-icons/react/GraduationCap";
import type {CourseCheckBlock} from "@/src/lib/course-document";
import styles from "./CourseReader.module.css";

interface CourseKnowledgeCheckImage {
  mediaId: string;
  alt: string;
  caption?: string;
  src: string;
}

export default function CourseKnowledgeCheck({block, images = []}: {block: CourseCheckBlock; images?: CourseKnowledgeCheckImage[]}) {
  const name = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const correct = selected === block.correctOption;
  return <aside className={styles.knowledgeCheck} aria-label="Ungraded knowledge check">
    <p className={styles.knowledgeLabel}><GraduationCapIcon size={22} weight="fill"/>Quick check · ungraded</p>
    <fieldset>
      <legend>{block.prompt}</legend>
      {images.length > 0 ? <div className={styles.knowledgeCheckImages}>{images.map((image, index) => <figure className={styles.knowledgeCheckImage} key={image.mediaId + "-" + index}>
        <img src={image.src} alt={image.alt} loading="lazy"/>
        {image.caption ? <figcaption>{image.caption}</figcaption> : null}
      </figure>)}</div> : null}
      {block.options.map((option, index) => <label key={index}>
        <input type="radio" name={name} checked={selected === index} onChange={() => {setSelected(index); setChecked(false);}}/><span>{option}</span>
      </label>)}
    </fieldset>
    {checked ? <div className={styles.checkFeedback} role="status"><strong>{correct ? "Correct." : "Not quite."}</strong> {correct ? block.explanation : block.incorrectExplanation ?? block.explanation}</div> : null}
    <div className={styles.checkActions}><span className={styles.checkNote}>Practice only. Answers are not saved or graded and do not affect course completion.</span><button type="button" disabled={selected === null} onClick={() => {if (checked) {setSelected(null); setChecked(false);} else setChecked(true);}}>{checked ? "Try again" : "Check answer"}</button></div>
  </aside>;
}
