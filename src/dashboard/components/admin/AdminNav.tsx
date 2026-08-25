import {useEffect, useRef} from "react";
import {useLocation, useNavigate} from "@/src/dashboard/next-navigation";
import styles from "./AdminNav.module.css";
import type {AdminUser} from "../../types/AdminUser.ts";
import {adminNavigationGroups} from "./AdminNavigation.ts";

interface AdminNavProps {
    adminUser?: AdminUser;
}

const EXAM_CENTER_ENABLED = true;

const AdminNav = ({adminUser}: AdminNavProps) => {
    const location = useLocation();
    const navigate = useNavigate();
    const navGroups = adminNavigationGroups(adminUser, EXAM_CENTER_ENABLED);
    const activeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        activeButton.current?.scrollIntoView({block: "nearest", inline: "center"});
    }, [location.pathname]);

    return (
        <header className={styles.adminHeader}>
            <nav className={styles.adminNav} aria-label="Dashboard sections">
                {navGroups.map(group => {
                    const groupId = `dashboard-nav-${group.label.toLowerCase()}`;
                    return (
                        <div key={group.label} className={styles.adminNavGroup} role="group" aria-labelledby={groupId}>
                            <span id={groupId} className={styles.adminNavGroupLabel}>{group.label}</span>
                            <div className={styles.adminNavGroupItems}>
                                {group.items.map(item => {
                                    const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

                                    return (
                                        <button
                                            key={item.path}
                                            ref={isActive ? activeButton : undefined}
                                            type="button"
                                            className={`${styles.adminNavButton} ${isActive ? styles.adminNavButtonActive : ""}`}
                                            aria-current={isActive ? "page" : undefined}
                                            onClick={() => navigate(item.path)}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>
        </header>
    );
};

export default AdminNav;
