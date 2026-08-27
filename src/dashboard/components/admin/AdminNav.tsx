import {type MouseEvent} from "react";
import {useLocation, Link} from "@/src/dashboard/next-navigation";
import styles from "./AdminNav.module.css";
import type {AdminUser} from "../../types/AdminUser.ts";
import {adminNavigationGroups} from "./AdminNavigation.ts";

interface AdminNavProps {
    adminUser?: AdminUser;
    embedded?: boolean;
}

const EXAM_CENTER_ENABLED = true;

const supportsDesktopHover = () => typeof window !== "undefined"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const openNavDropdownOnHover = (event: MouseEvent<HTMLDetailsElement>) => {
    if (supportsDesktopHover()) event.currentTarget.open = true;
};

const closeNavDropdownOnLeave = (event: MouseEvent<HTMLDetailsElement>) => {
    if (supportsDesktopHover()) event.currentTarget.open = false;
};

const closeNavDropdownOnSelection = (event: MouseEvent<HTMLAnchorElement>) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
};

const AdminNav = ({adminUser, embedded = false}: AdminNavProps) => {
    const location = useLocation();
    const navGroups = adminNavigationGroups(adminUser, EXAM_CENTER_ENABLED);

    const navigation = <nav className={`${styles.adminNav} ${embedded ? styles.adminNavEmbedded : ""}`} aria-label="Dashboard sections">
                {navGroups.map(group => {
                    const groupId = `dashboard-nav-${group.label.toLowerCase()}`;
                    const menuId = `${groupId}-menu`;
                    const hasActiveItem = group.items.some(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
                    return (
                        <details
                            key={group.label}
                            name="dashboard-navigation"
                            className={`${styles.adminNavDropdown} ${hasActiveItem ? styles.adminNavDropdownActive : ""}`}
                            onMouseEnter={openNavDropdownOnHover}
                            onMouseLeave={closeNavDropdownOnLeave}
                        >
                            <summary id={groupId} className={styles.adminNavDropdownSummary} aria-controls={menuId} aria-label={`${group.label} sections`}>{group.label}</summary>
                            <div id={menuId} className={styles.adminNavDropdownMenu} aria-labelledby={groupId}>
                                {group.sections.map((section, sectionIndex) => (
                                    <div key={section.label ?? sectionIndex} className={styles.adminNavDropdownSection}>
                                        {section.label ? <span className={styles.adminNavDropdownSectionLabel}>{section.label}</span> : null}
                                        <div className={styles.adminNavDropdownSectionItems}>
                                            {section.items.map(item => {
                                                const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                                                return <Link key={item.path} to={item.path} className={`${styles.adminNavDropdownItem} ${isActive ? styles.adminNavDropdownItemActive : ""}`} aria-current={isActive ? "page" : undefined} onClick={closeNavDropdownOnSelection}>{item.label}</Link>;
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    );
                })}
            </nav>;

    return embedded ? navigation : <header className={styles.adminHeader}>{navigation}</header>;
};

export default AdminNav;
