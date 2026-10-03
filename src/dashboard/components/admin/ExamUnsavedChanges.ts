export const EXAM_UNSAVED_CHANGES_MESSAGE = "Your unsaved changes will be lost if you leave this page.";

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
        target?: {closest?: (selector: string) => {href?: string; target?: string; download?: string; hasAttribute?: (name: string) => boolean} | null};
    };
    if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return undefined;

    const anchor = click.target?.closest?.("a[href]");
    // Real anchors expose download="" even when the attribute is absent.
    const download = anchor?.hasAttribute ? anchor.hasAttribute("download") : anchor?.download !== undefined;
    if (!anchor?.href || anchor.target === "_blank" || download) return undefined;

    const destination = new URL(anchor.href, environment.window.location.href);
    return destination.origin === environment.window.location.origin ? destination.href : undefined;
};

export interface ExamUnsavedChangesGuard {
    activate(): void;
    confirmAndRun(run: () => void): Promise<boolean>;
    disarm(): void;
}

export const createExamUnsavedChangesGuard = (
    {isDirty, confirm}: {isDirty: () => boolean; confirm: () => Promise<boolean>},
    environment: ExamUnsavedChangesEnvironment | undefined = browserEnvironment(),
): ExamUnsavedChangesGuard => {
    let armed = false;
    let pending = false;
    let restoringHistory = false;

    const disarm = () => {
        if (!armed || !environment) return;
        armed = false;
        environment.window.removeEventListener("beforeunload", onBeforeUnload);
        environment.document.removeEventListener("click", onDocumentClick, true);
        environment.window.removeEventListener("popstate", onPopState);
    };

    const confirmAndRun = async (run: () => void): Promise<boolean> => {
        if (!armed || !isDirty()) {
            run();
            return true;
        }
        if (pending) return false;
        pending = true;
        let accepted = false;
        try { accepted = await confirm(); }
        finally { pending = false; }
        if (!accepted || !armed) return false;
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
        void confirmAndRun(() => environment.window.location.assign(destination));
    };

    const onPopState: Listener = () => {
        if (!armed || !isDirty() || !environment) return;
        if (restoringHistory) { restoringHistory = false; return; }
        restoringHistory = true;
        environment.window.history.go(1);
        void confirmAndRun(() => environment.window.history.go(-2));
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
