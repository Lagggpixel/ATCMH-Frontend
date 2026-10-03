"use client";

import {useEffect, useRef, useState} from "react";
import {useLocation, Link} from "@/src/dashboard/next-navigation";
import {CaretDown} from "@phosphor-icons/react";
import styles from "./AdminNav.module.css";
import type {AdminUser} from "../../types/AdminUser.ts";
import {adminNavigationGroups} from "./AdminNavigation.ts";

interface AdminNavProps {
    adminUser?: AdminUser;
    embedded?: boolean;
    onNavigate?: () => void;
}

const EXAM_CENTER_ENABLED = true;

const AdminNav = ({adminUser, embedded = false, onNavigate}: AdminNavProps) => {
    const location = useLocation();
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const navigationRef = useRef<HTMLElement>(null);
    const navGroups = adminNavigationGroups(adminUser, EXAM_CENTER_ENABLED);

    useEffect(() => {
        const closeOutside = (event: PointerEvent) => {
            if (!navigationRef.current?.contains(event.target as Node)) setOpenGroup(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                const trigger = (document.activeElement as HTMLElement | null)?.closest("[data-nav-group]")?.querySelector<HTMLButtonElement>("button");
                setOpenGroup(null);
                trigger?.focus();
            }
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    const navigation = <nav ref={navigationRef} className={`${styles.adminNav} ${embedded ? styles.adminNavEmbedded : ""}`} aria-label="Dashboard sections">
        {navGroups.map(group => {
            const groupId = `dashboard-nav-${group.label.toLowerCase()}`;
            const menuId = `${groupId}-menu`;
            const hasActiveItem = group.items.some(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
            const expanded = openGroup === group.label;
            return <div key={group.label} data-nav-group={group.label} className={`${styles.adminNavDropdown} ${hasActiveItem ? styles.adminNavDropdownActive : ""}`}>
                <button type="button" id={groupId} className={styles.adminNavDropdownSummary} aria-controls={menuId} aria-expanded={expanded} onClick={() => setOpenGroup(expanded ? null : group.label)}>
                    {group.label}<CaretDown className={styles.chevron} size={15} weight="bold" aria-hidden="true"/>
                </button>
                <div id={menuId} className={styles.adminNavDropdownMenu} aria-labelledby={groupId} hidden={!expanded}>
                    {group.sections.map((section, sectionIndex) => <div key={section.label ?? sectionIndex} className={styles.adminNavDropdownSection}>
                        {section.label ? <span className={styles.adminNavDropdownSectionLabel}>{section.label}</span> : null}
                        <div className={styles.adminNavDropdownSectionItems}>
                            {section.items.map(item => {
                                const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                                // A new document applies the guide's narrowly scoped video CSP.
                                if (item.path === "/dashboard/pilot-guide" || location.pathname === "/dashboard/pilot-guide") return <a key={item.path} href={item.path} className={`${styles.adminNavDropdownItem} ${isActive ? styles.adminNavDropdownItemActive : ""}`} aria-current={isActive ? "page" : undefined} onClick={() => {setOpenGroup(null); onNavigate?.();}}>{item.label}</a>;
                                return <Link key={item.path} to={item.path} className={`${styles.adminNavDropdownItem} ${isActive ? styles.adminNavDropdownItemActive : ""}`} aria-current={isActive ? "page" : undefined} onClick={() => {setOpenGroup(null); onNavigate?.();}}>{item.label}</Link>;
                            })}
                        </div>
                    </div>)}
                </div>
            </div>;
        })}
    </nav>;

    return embedded ? navigation : <header className={styles.adminHeader}>{navigation}</header>;
};

export default AdminNav;
