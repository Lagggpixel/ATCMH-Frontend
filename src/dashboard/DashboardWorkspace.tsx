import type {ReactNode} from "react";
import styles from "./DashboardWorkspace.module.css";
import DashboardQuickSearch from "./components/admin/DashboardQuickSearch";

interface DashboardWorkspaceProps {
    label: string;
    children: ReactNode;
}

export default function DashboardWorkspace({label, children}: DashboardWorkspaceProps) {
    return <div className={styles.workspace} data-dashboard-workspace>
        <h1 className={styles.screenLabel}>{label}</h1>
        <DashboardQuickSearch/>
        {children}
    </div>;
}
