"use client";

import {createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode} from "react";
import styles from "./ConfirmationProvider.module.css";

export interface ConfirmationOptions {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
}

type Confirm = (options: ConfirmationOptions) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

export function useConfirmation(): Confirm {
    const confirm = useContext(ConfirmationContext);
    if (!confirm) throw new Error("ConfirmationProvider is required");
    return confirm;
}

export default function ConfirmationProvider({children}: {children: ReactNode}) {
    const [request, setRequest] = useState<ConfirmationOptions | null>(null);
    const resolver = useRef<((confirmed: boolean) => void) | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const messageId = useId();

    const settle = useCallback((confirmed: boolean) => {
        const resolve = resolver.current;
        resolver.current = null;
        setRequest(null);
        resolve?.(confirmed);
    }, []);

    const confirm = useCallback<Confirm>(options => {
        if (resolver.current) return Promise.resolve(false);
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setRequest(options);
        return new Promise<boolean>(resolve => { resolver.current = resolve; });
    }, []);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!request || !dialog) return;
        dialog.showModal();
        cancelRef.current?.focus();
        return () => {
            if (dialog.open) dialog.close();
            if (openerRef.current?.isConnected) openerRef.current.focus();
        };
    }, [request]);

    useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);

    return <ConfirmationContext.Provider value={confirm}>
        {children}
        {request ? <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={messageId}
            onCancel={event => { event.preventDefault(); settle(false); }}
            onClick={event => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) settle(false);
            }}>
            <h2 id={titleId}>{request.title}</h2>
            <p id={messageId}>{request.message}</p>
            <div className={styles.actions}>
                <button ref={cancelRef} type="button" className={styles.cancel} onClick={() => settle(false)}>{request.cancelLabel ?? "Cancel"}</button>
                <button type="button" className={request.tone === "danger" ? styles.danger : styles.confirm} onClick={() => settle(true)}>{request.confirmLabel}</button>
            </div>
        </dialog> : null}
    </ConfirmationContext.Provider>;
}
