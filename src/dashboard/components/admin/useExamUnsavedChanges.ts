import {useCallback, useEffect, useRef} from "react";
import {createExamUnsavedChangesGuard, type ExamUnsavedChangesGuard} from "./ExamUnsavedChanges.ts";
import {useConfirmation} from "../../../platform/confirmation/ConfirmationProvider.tsx";
import {EXAM_UNSAVED_CHANGES_MESSAGE} from "./ExamUnsavedChanges.ts";

export const useExamUnsavedChanges = ({isDirty}: {isDirty: boolean}) => {
    const confirm = useConfirmation();
    const dirtyRef = useRef(isDirty);
    const guardRef = useRef<ExamUnsavedChangesGuard | null>(null);
    dirtyRef.current = isDirty;

    useEffect(() => {
        if (!isDirty) {
            guardRef.current?.disarm();
            guardRef.current = null;
            return;
        }

        const guard = createExamUnsavedChangesGuard({isDirty: () => dirtyRef.current, confirm: () => confirm({
            title: "Discard unsaved changes?",
            message: EXAM_UNSAVED_CHANGES_MESSAGE,
            confirmLabel: "Discard and leave",
            cancelLabel: "Keep editing",
            tone: "danger",
        })});
        guard.activate();
        guardRef.current = guard;
        return () => {
            guard.disarm();
            if (guardRef.current === guard) guardRef.current = null;
        };
    }, [isDirty, confirm]);

    const confirmAndRun = useCallback((run: () => void) => {
        const guard = guardRef.current;
        if (!guard) {
            run();
            return Promise.resolve(true);
        }
        return guard.confirmAndRun(run);
    }, []);

    const disarm = useCallback(() => {
        guardRef.current?.disarm();
        guardRef.current = null;
    }, []);

    return {confirmAndRun, disarm};
};
