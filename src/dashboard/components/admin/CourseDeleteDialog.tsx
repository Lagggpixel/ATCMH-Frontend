import {useEffect, useId, useRef, useState} from "react";
import type {ManagedCourseSummary} from "../../types/Course.ts";
import styles from "./CourseDeleteDialog.module.css";

interface CourseDeleteDialogProps {
    course: ManagedCourseSummary;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}

export default function CourseDeleteDialog({course, onCancel, onConfirm}: CourseDeleteDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const pendingRef = useRef(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        const dialog = dialogRef.current;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog?.showModal();
        cancelRef.current?.focus();
        return () => {
            dialog?.close();
            if (opener?.isConnected) opener.focus();
        };
    }, []);

    const confirm = async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError(null);
        try {
            await onConfirm();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "The course could not be deleted. Please try again.");
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    };

    return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
        onCancel={event => { event.preventDefault(); if (!pendingRef.current) onCancel(); }}>
        <h2 id={titleId}>Delete “{course.title}”?</h2>
        <div id={descriptionId} className={styles.description}>
            <p>This permanently deletes the course, its sections, uploaded media, learner progress, activity results, and course statistics.</p>
            <p>Linked quizzes and exam attempts are kept. This action cannot be undone.</p>
        </div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {pending ? <p role="status">Deleting course…</p> : null}
        <div className={styles.actions}>
            <button ref={cancelRef} type="button" disabled={pending} onClick={onCancel}>Keep course</button>
            <button className={styles.deleteButton} type="button" disabled={pending} onClick={() => void confirm()}>{pending ? "Deleting…" : "Delete course"}</button>
        </div>
    </dialog>;
}
