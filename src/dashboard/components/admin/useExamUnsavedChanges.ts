import {useCallback, useEffect, useRef} from "react";
import {createExamUnsavedChangesGuard, type ExamUnsavedChangesGuard} from "./ExamUnsavedChanges.ts";

export const useExamUnsavedChanges = ({isDirty}: {isDirty: boolean}) => {
    const dirtyRef = useRef(isDirty);
    const guardRef = useRef<ExamUnsavedChangesGuard | null>(null);
    dirtyRef.current = isDirty;

    useEffect(() => {
        if (!isDirty) {
            guardRef.current?.disarm();
            guardRef.current = null;
            return;
        }

        const guard = createExamUnsavedChangesGuard({isDirty: () => dirtyRef.current});
        guard.activate();
        guardRef.current = guard;
        return () => {
            guard.disarm();
            if (guardRef.current === guard) guardRef.current = null;
        };
    }, [isDirty]);

    const confirmAndRun = useCallback((run: () => void) => {
        const guard = guardRef.current;
        if (!guard) {
            run();
            return true;
        }
        return guard.confirmAndRun(run);
    }, []);

    const disarm = useCallback(() => {
        guardRef.current?.disarm();
        guardRef.current = null;
    }, []);

    return {confirmAndRun, disarm};
};
