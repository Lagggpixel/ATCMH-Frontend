import {useEffect, useMemo, useRef, useState} from "react";
import { Link, useSearchParams } from "@/src/dashboard/next-navigation";
import { ApiUtils } from "../../utils/ApiUtils.ts";
import type { AtcmhUser } from "../../types/AtcmhUser.ts";
import type { DashboardAuthSession } from "../../types/Account.ts";
import type { AdminUser } from "../../types/AdminUser.ts";
import icon from "../../icon.png";
import styles from "./Home.module.css";
import { accountAuthErrorMessage } from "../account/AccountPageState.ts";
import {initialsFromDisplayName, UserMenuController} from "./HomeUserMenuState.ts";

interface HomeProps {
    session: DashboardAuthSession | null;
    authLoading: boolean;
    adminUser?: AdminUser;
    onLogout: (all?: boolean) => Promise<void>;
}

const preferredIdentity = (session: DashboardAuthSession) => {
    const identities = session.identities.filter(identity => identity.active !== false);
    return identities.find(identity => identity.provider.toLowerCase() === "discord") ?? identities[0];
};

const sessionLabel = (session: DashboardAuthSession) => {
    const preferred = preferredIdentity(session);
    return preferred?.displayName?.trim() || preferred?.subject || `Account ${session.accountId}`;
};

const UserFallbackIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/>
</svg>;

const ChevronIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <path d="m7 10 5 5 5-5H7Z"/>
</svg>;

export const HomeHeaderActions = ({session, authLoading, adminUser, onLogout}: HomeProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const onLogoutRef = useRef(onLogout);
    const menuControllerRef = useRef<UserMenuController | null>(null);
    onLogoutRef.current = onLogout;

    if (menuControllerRef.current == null) {
        menuControllerRef.current = new UserMenuController({
            onOpenChange: setIsMenuOpen,
            focusTrigger: () => window.setTimeout(() => triggerRef.current?.focus()),
            containsTarget: (target) => menuRef.current?.contains(target as Node) || triggerRef.current?.contains(target as Node) || false,
            onLogout: (all) => onLogoutRef.current(all),
        });
    }

    const menuController = menuControllerRef.current;

    useEffect(() => {
        if (!isMenuOpen) return;
        const handlePointerDown = (event: PointerEvent) => menuController.handlePointerDown(event.target);
        const handleKeyDown = (event: KeyboardEvent) => menuController.handleKeyDown(event.key);
        document.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isMenuOpen, menuController]);

    if (authLoading) {
        return <div className={styles.homeHeaderActions}><span className={styles.homeSessionLoading} role="status">Checking session…</span></div>;
    }

    if (!session) {
        return <div className={styles.homeHeaderActions}><Link className={styles.homeAdminPanelButton} to="/auth?returnTo=/home">Sign in</Link></div>;
    }

    const label = sessionLabel(session);
    const initials = initialsFromDisplayName(preferredIdentity(session)?.displayName);
    return <div className={styles.homeHeaderActions}>
        <button
            ref={triggerRef}
            className={styles.homeUserMenuTrigger}
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="home-user-menu"
            aria-label={`Open user menu for ${label}`}
            onClick={() => menuController.toggle()}
        >
            <span className={styles.homeUserAvatar}>{initials || <UserFallbackIcon/>}</span>
            <span className={styles.homeUserMenuChevron}><ChevronIcon/></span>
        </button>
        <div ref={menuRef} id="home-user-menu" className={styles.homeUserMenu} hidden={!isMenuOpen}>
            <Link to="/account" onClick={() => menuController.closeForNavigation()}>Settings</Link>
            {adminUser ? <Link to="/dashboard" onClick={() => menuController.closeForNavigation()}>Admin Dashboard</Link> : null}
            <button type="button" onClick={() => void menuController.logout()}>Log out</button>
        </div>
    </div>;
};

const HomeHeader = (props: HomeProps) => {
    const [params] = useSearchParams();
    const authMessage = accountAuthErrorMessage(params.get("authError"));

    return <>
        <header className={styles.homeHeader}>
            <div className={styles.homeBrand}>
                <img src={icon.src} alt="" className={styles.homeLogo} />
                <div>
                    <span className={styles.homeBrandName}>ATCMH</span>
                    <span className={styles.homeBrandMeta}>Attendance dashboard</span>
                </div>
            </div>
            <HomeHeaderActions {...props}/>
        </header>
        {authMessage ? <p className={styles.homeAuthAlert} role="alert">{authMessage}</p> : null}
    </>;
};

const Home = ({session, authLoading, adminUser, onLogout}: HomeProps) => {
    const [hasLoaded, setHasLoaded] = useState(false);
    const [atcmhUsers, setAtcmhUsers] = useState<AtcmhUser[] | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"allTime" | "recent">("allTime");
    const [filter, setFilter] = useState("");

    useEffect(() => {
        ApiUtils.getAtcmhUsers()
            .then((users) => {
                setAtcmhUsers(users);
                setHasLoaded(true);
            })
            .catch((err) => {
                setError(err.message || "Failed to load data");
                setHasLoaded(true);
            });
    }, []);

    const handleSort = (type: "allTime" | "recent") => {
        setSortBy(type);
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilter(e.target.value.toLowerCase());
    };

    const displayedUsers = useMemo(() => {
        if (!atcmhUsers) return [];

        let users = [...atcmhUsers];

        // Filter by username
        if (filter) {
            users = users.filter(user => user.username.toLowerCase().includes(filter));
        }

        // Sort by selected criteria
        users.sort((a, b) => {
            if (sortBy === "allTime") {
                return b.allTimeAttendance - a.allTimeAttendance;
            } else {
                return b.recentAttendance - a.recentAttendance;
            }
        });

        return users;
    }, [atcmhUsers, filter, sortBy]);

    const attendanceSummary = useMemo(() => {
        if (!atcmhUsers || atcmhUsers.length === 0) {
            return {
                users: 0,
                allTimeAttendance: 0,
                recentAttendance: 0,
            };
        }

        return atcmhUsers.reduce(
            (summary, user) => ({
                users: summary.users + 1,
                allTimeAttendance: summary.allTimeAttendance + user.allTimeAttendance,
                recentAttendance: summary.recentAttendance + user.recentAttendance,
            }),
            {
                users: 0,
                allTimeAttendance: 0,
                recentAttendance: 0,
            }
        );
    }, [atcmhUsers]);

    if (!hasLoaded) {
        return (
            <div className={styles.homeContainer}>
                <HomeHeader session={session} authLoading={authLoading} adminUser={adminUser} onLogout={onLogout}/>
                <main className={styles.homeLoadingContainer}>
                    <div className={styles.homeLoadingSpinner}></div>
                    <p>Loading users...</p>
                </main>
            </div>
        );
    }

    if (error || !atcmhUsers) {
        return (
            <div className={styles.homeContainer}>
                <HomeHeader session={session} authLoading={authLoading} adminUser={adminUser} onLogout={onLogout}/>
                <main className={styles.homeErrorContainer}>
                    <h2>Error Loading Data</h2>
                    <p>{error || "Unknown error occurred"}</p>
                    <button onClick={() => window.location.reload()}>Retry</button>
                </main>
            </div>
        );
    }

    if (atcmhUsers.length === 0) {
        return (
            <div className={styles.homeContainer}>
                <HomeHeader session={session} authLoading={authLoading} adminUser={adminUser} onLogout={onLogout}/>
                <main className={styles.homeEmptyContainer}>
                    <h2>No Users Found</h2>
                    <p>There are currently no users to display.</p>
                </main>
            </div>
        );
    }

    return (
        <div className={styles.homeContainer}>
            <HomeHeader session={session} authLoading={authLoading} adminUser={adminUser} onLogout={onLogout}/>

            <main className={styles.homeMain}>
                <section className={styles.homeHero}>
                    <div className={styles.homeHeroCopy}>
                        <h1>User Attendance</h1>
                    </div>

                    <div className={styles.homeStats} aria-label="Attendance summary">
                        <div className={styles.homeStatCard}>
                            <span>All time</span>
                            <strong>{attendanceSummary.allTimeAttendance.toLocaleString()}</strong>
                        </div>
                    </div>
                </section>

                <section className={styles.homePanel}>
                    <div className={styles.homePanelHeader}>
                        <div>
                            <h2>Leaderboard</h2>
                            <p>{displayedUsers.length.toLocaleString()} of {atcmhUsers.length.toLocaleString()} users shown</p>
                        </div>

                        <div className={styles.homeControls}>
                            <div className={styles.homeFilterControl}>
                                <label htmlFor="username-filter">Search users</label>
                                <input
                                    id="username-filter"
                                    type="search"
                                    placeholder="Name..."
                                    value={filter}
                                    onChange={handleFilterChange}
                                />
                            </div>

                            <div className={styles.homeSortControls} aria-label="Sort leaderboard">
                                <span>Sort</span>
                                <button
                                    className={`${styles.homeSortButton} ${sortBy === "allTime" ? styles.homeSortButtonActive : ""}`}
                                    onClick={() => handleSort("allTime")}
                                    aria-pressed={sortBy === "allTime"}
                                >
                                    All time
                                </button>
                                <button
                                    className={`${styles.homeSortButton} ${sortBy === "recent" ? styles.homeSortButtonActive : ""}`}
                                    onClick={() => handleSort("recent")}
                                    aria-pressed={sortBy === "recent"}
                                >
                                    Recent
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={styles.homeUsersTable}>
                        <table className={styles.homeUsersDataTable}>
                            <thead>
                            <tr>
                                <th scope="col">Rank</th>
                                <th scope="col">Username</th>
                                <th scope="col">All Time</th>
                                <th scope="col">Recent</th>
                            </tr>
                            </thead>
                            <tbody>
                            {displayedUsers.length > 0 ? (
                                displayedUsers.map((user, index) => (
                                    <tr key={user.id}>
                                        <td data-label="Rank">#{index + 1}</td>
                                        <td data-label="Username" className={styles.homeUsernameCell}>{user.username}</td>
                                        <td data-label="All time">{user.allTimeAttendance.toLocaleString()}</td>
                                        <td data-label="Recent">{user.recentAttendance.toLocaleString()}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td className={styles.homeNoResults} colSpan={4}>
                                        No users match your filter criteria.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Home;
