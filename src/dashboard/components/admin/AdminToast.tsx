import {useEffect} from "react";
import styles from "./AdminToast.module.css";

interface AdminToastProps {
    message?: string;
    onDismiss: () => void;
}

const AdminToast = ({message, onDismiss}: AdminToastProps) => {
    useEffect(() => {
        if (!message) return;
        const timeout = window.setTimeout(onDismiss, 7000);
        return () => window.clearTimeout(timeout);
    }, [message, onDismiss]);

    if (!message) return null;

    return (
        <div className={styles.toast} role="alert" aria-live="assertive">
            <span>{message}</span>
            <button type="button" onClick={onDismiss} aria-label="Dismiss error">x</button>
        </div>
    );
};

export default AdminToast;
