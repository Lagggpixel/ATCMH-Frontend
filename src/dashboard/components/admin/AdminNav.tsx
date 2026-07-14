import {useLocation, useNavigate} from "@/src/dashboard/next-navigation";
import styles from "./AdminNav.module.css";
import type {AdminUser} from "../../types/AdminUser.ts";
import {adminNavigationItems} from "./AdminNavigation.ts";

interface AdminNavProps {
    adminUser?: AdminUser;
}

const EXAM_CENTER_ENABLED = true;

const AdminNav = ({adminUser}: AdminNavProps) => {
    const location = useLocation();
    const navigate = useNavigate();
    const navItems = adminNavigationItems(adminUser, EXAM_CENTER_ENABLED);

    return (
        <header className={styles.adminHeader}>
            <nav className={styles.adminNav} aria-label="Dashboard sections">
                {navItems.map(item => {
                    const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

                    return (
                        <button
                            key={item.path}
                            type="button"
                            className={`${styles.adminNavButton} ${isActive ? styles.adminNavButtonActive : ""}`}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => navigate(item.path)}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </nav>
        </header>
    );
};

export default AdminNav;
