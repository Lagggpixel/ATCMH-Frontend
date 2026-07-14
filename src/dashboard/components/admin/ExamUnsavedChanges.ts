export const EXAM_UNSAVED_CHANGES_MESSAGE = "You have unsaved Exam Center changes. Leave and discard them?";

const normalizeExamValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalizeExamValue);
    if (value && typeof value === "object") {
        return Object.keys(value).sort().reduce<Record<string, unknown>>((normalized, key) => {
            normalized[key] = normalizeExamValue((value as Record<string, unknown>)[key]);
            return normalized;
        }, {});
    }
    return value;
};

export const stableExamValue = (value: unknown): string => JSON.stringify(normalizeExamValue(value)) ?? "undefined";

type Listener = (event: unknown) => void;

interface ListenerTarget {
    addEventListener(type: string, listener: Listener, options?: boolean): void;
    removeEventListener(type: string, listener: Listener, options?: boolean): void;
}

interface ExamUnsavedChangesEnvironment {
    window: ListenerTarget & {
        confirm(message: string): boolean;
        location: {
            href: string;
            origin: string;
            assign(url: string): void;
        };
        history: {
            state: unknown;
            pushState(state: unknown, unused: string, url?: string): void;
            go(delta: number): void;
            back(): void;
        };
    };
    document: ListenerTarget;
}

const browserEnvironment = (): ExamUnsavedChangesEnvironment | undefined => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    return {window, document};
};

const isPrimarySameOriginAnchor = (event: unknown, environment: ExamUnsavedChangesEnvironment): string | undefined => {
    const click = event as {
        button?: number;
        defaultPrevented?: boolean;
        metaKey?: boolean;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        altKey?: boolean;
        target?: {closest?: (selector: string) => {href?: string; target?: string; download?: string} | null};
    };
    if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return undefined;

    const anchor = click.target?.closest?.("a[href]");
    if (!anchor?.href || anchor.target === "_blank" || anchor.download !== undefined) return undefined;

    const destination = new URL(anchor.href, environment.window.location.href);
    return destination.origin === environment.window.location.origin ? destination.href : undefined;
};

export interface ExamUnsavedChangesGuard {
    activate(): void;
    confirmAndRun(run: () => void): boolean;
    disarm(): void;
}

export const createExamUnsavedChangesGuard = (
    {isDirty}: {isDirty: () => boolean},
    environment: ExamUnsavedChangesEnvironment | undefined = browserEnvironment(),
): ExamUnsavedChangesGuard => {
    let armed = false;

    const disarm = () => {
        if (!armed || !environment) return;
        armed = false;
        environment.window.removeEventListener("beforeunload", onBeforeUnload);
        environment.document.removeEventListener("click", onDocumentClick, true);
        environment.window.removeEventListener("popstate", onPopState);
    };

    const confirmAndRun = (run: () => void): boolean => {
        if (!armed || !isDirty()) {
            run();
            return true;
        }
        if (!environment?.window.confirm(EXAM_UNSAVED_CHANGES_MESSAGE)) return false;
        disarm();
        run();
        return true;
    };

    const onBeforeUnload: Listener = event => {
        if (!armed || !isDirty()) return;
        const beforeUnload = event as {preventDefault(): void; returnValue?: string};
        beforeUnload.preventDefault();
        beforeUnload.returnValue = "";
    };

    const onDocumentClick: Listener = event => {
        if (!armed || !isDirty() || !environment) return;
        const destination = isPrimarySameOriginAnchor(event, environment);
        if (!destination) return;
        (event as {preventDefault(): void}).preventDefault();
        confirmAndRun(() => environment.window.location.assign(destination));
    };

    const onPopState: Listener = () => {
        if (!armed || !isDirty() || !environment) return;
        if (environment.window.confirm(EXAM_UNSAVED_CHANGES_MESSAGE)) {
            disarm();
            environment.window.history.back();
            return;
        }
        environment.window.history.go(1);
    };

    return {
        activate() {
            if (armed || !isDirty() || !environment) return;
            armed = true;
            const state = environment.window.history.state;
            const preservedState = state && typeof state === "object" ? state : {};
            environment.window.history.pushState({...preservedState, examUnsavedChanges: true}, "", environment.window.location.href);
            environment.window.addEventListener("beforeunload", onBeforeUnload);
            environment.document.addEventListener("click", onDocumentClick, true);
            environment.window.addEventListener("popstate", onPopState);
        },
        confirmAndRun,
        disarm,
    };
};
