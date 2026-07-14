import type {ReactNode} from "react";
import type {AdminUser} from "./types/AdminUser";
import AdminNav from "./components/admin/AdminNav";
import styles from "./DashboardWorkspace.module.css";

interface DashboardWorkspaceProps {
    adminUser?: AdminUser;
    label: string;
    children: ReactNode;
}

export default function DashboardWorkspace({adminUser, label, children}: DashboardWorkspaceProps) {
    return <div className={styles.workspace}>
        {adminUser ? <AdminNav adminUser={adminUser}/> : null}
        <h1 className={styles.screenLabel}>{label}</h1>
        {children}
    </div>;
}
