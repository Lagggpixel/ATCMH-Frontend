"use client";

import {useEffect, useMemo, useState} from "react";
import {ApiUtils} from "../../utils/ApiUtils";
import type {AtcmhUser} from "../../types/AtcmhUser";
import styles from "./Home.module.css";

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [users, setUsers] = useState<AtcmhUser[]>();
  const [error, setError] = useState<string>();
  const [sortBy, setSortBy] = useState<"allTime" | "recent">("allTime");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    ApiUtils.getAtcmhUsers().then(value => setUsers(value ?? [])).catch(reason => setError(reason instanceof Error ? reason.message : "Failed to load data")).finally(() => setLoaded(true));
  }, []);

  const displayedUsers = useMemo(() => [...(users ?? [])]
    .filter(user => user.username.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => sortBy === "allTime" ? b.allTimeAttendance - a.allTimeAttendance : b.recentAttendance - a.recentAttendance), [filter, sortBy, users]);
  const allTimeAttendance = useMemo(() => (users ?? []).reduce((total, user) => total + user.allTimeAttendance, 0), [users]);

  if (!loaded) return <main className={styles.homeLoadingContainer}><div className={styles.homeLoadingSpinner}/><p>Loading users…</p></main>;
  if (error) return <main className={styles.homeErrorContainer}><h1>Unable to load the leaderboard</h1><p>{error}</p><button onClick={() => window.location.reload()}>Retry</button></main>;
  if (!users?.length) return <main className={styles.homeEmptyContainer}><h1>Attendance Leaderboard</h1><p>There are currently no users to display.</p></main>;

  return <main className={styles.homeContainer}>
    <div className={styles.homeMain}>
      <section className={styles.homeHero}>
        <div className={styles.homeHeroCopy}><p className={styles.homeEyebrow}>Community statistics</p><h1>Attendance Leaderboard</h1><p>Explore ATCMH attendance across recent and all-time activity.</p></div>
        <div className={styles.homeStats} aria-label="Attendance summary"><div className={styles.homeStatCard}><span>All-time attendance</span><strong>{allTimeAttendance.toLocaleString()}</strong></div></div>
      </section>
      <section className={styles.homePanel}>
        <div className={styles.homePanelHeader}>
          <div><h2>Leaderboard</h2><p>{displayedUsers.length.toLocaleString()} of {users.length.toLocaleString()} users shown</p></div>
          <div className={styles.homeControls}>
            <div className={styles.homeFilterControl}><label htmlFor="username-filter">Search users</label><input id="username-filter" type="search" placeholder="Name…" value={filter} onChange={event => setFilter(event.target.value)}/></div>
            <div className={styles.homeSortControls} aria-label="Sort leaderboard"><span>Sort</span><button className={`${styles.homeSortButton} ${sortBy === "allTime" ? styles.homeSortButtonActive : ""}`} onClick={() => setSortBy("allTime")} aria-pressed={sortBy === "allTime"}>All time</button><button className={`${styles.homeSortButton} ${sortBy === "recent" ? styles.homeSortButtonActive : ""}`} onClick={() => setSortBy("recent")} aria-pressed={sortBy === "recent"}>Recent</button></div>
          </div>
        </div>
        <div className={styles.homeUsersTable}><table className={styles.homeUsersDataTable}><thead><tr><th scope="col">Rank</th><th scope="col">Username</th><th scope="col">All Time</th><th scope="col">Recent</th></tr></thead><tbody>
          {displayedUsers.length ? displayedUsers.map((user, index) => <tr key={user.id}><td data-label="Rank">#{index + 1}</td><td data-label="Username" className={styles.homeUsernameCell}>{user.username}</td><td data-label="All time">{user.allTimeAttendance.toLocaleString()}</td><td data-label="Recent">{user.recentAttendance.toLocaleString()}</td></tr>) : <tr><td className={styles.homeNoResults} colSpan={4}>No users match your filter.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </main>;
}
