import {useLocation, Link} from "@/src/dashboard/next-navigation";
import styles from "./AdminNav.module.css";
import type {AdminUser} from "../../types/AdminUser.ts";
import {adminNavigationGroups} from "./AdminNavigation.ts";

interface AdminNavProps {
    adminUser?: AdminUser;
}

const EXAM_CENTER_ENABLED = true;

const AdminNav = ({adminUser}: AdminNavProps) => {
    const location = useLocation();
    const navGroups = adminNavigationGroups(adminUser, EXAM_CENTER_ENABLED);

    return (
        <header className={styles.adminHeader}>
            <nav className={styles.adminNav} aria-label="Dashboard sections">
                {navGroups.map(group => {
                    const groupId = `dashboard-nav-${group.label.toLowerCase()}`;
                    const menuId = `${groupId}-menu`;
                    const hasActiveItem = group.items.some(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
                    return (
                        <details key={group.label} className={`${styles.adminNavDropdown} ${hasActiveItem ? styles.adminNavDropdownActive : ""}`}>
                            <summary id={groupId} className={styles.adminNavDropdownSummary} aria-controls={menuId}>{group.label}</summary>
                            <div id={menuId} className={styles.adminNavDropdownMenu} aria-labelledby={groupId}>
                                {group.sections.map((section, sectionIndex) => (
                                    <div key={section.label ?? sectionIndex} className={styles.adminNavDropdownSection}>
                                        {section.label ? <span className={styles.adminNavDropdownSectionLabel}>{section.label}</span> : null}
                                        <div className={styles.adminNavDropdownSectionItems}>
                                            {section.items.map(item => {
                                                const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                                                return <Link key={item.path} to={item.path} className={`${styles.adminNavDropdownItem} ${isActive ? styles.adminNavDropdownItemActive : ""}`} aria-current={isActive ? "page" : undefined}>{item.label}</Link>;
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    );
                })}
            </nav>
        </header>
    );
};

export default AdminNav;
