import type {ReactNode} from "react";
import styles from "./DashboardWorkspace.module.css";

interface DashboardWorkspaceProps {
    label: string;
    children: ReactNode;
}

export default function DashboardWorkspace({label, children}: DashboardWorkspaceProps) {
    return <div className={styles.workspace}>
        <h1 className={styles.screenLabel}>{label}</h1>
        {children}
    </div>;
}
