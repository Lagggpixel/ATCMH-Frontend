"use client";

import Image from "next/image";
import {CaretLeftIcon} from "@phosphor-icons/react/dist/csr/CaretLeft";
import {CaretRightIcon} from "@phosphor-icons/react/dist/csr/CaretRight";
import {MagnifyingGlassIcon} from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {useEffect, useMemo, useState} from "react";
import {ApiUtils} from "../../utils/ApiUtils";
import type {AtcmhUser} from "../../types/AtcmhUser";
import {formatUserName} from "../../../lib/user-display-name";
import {paginateLeaderboard, rankLeaderboard, searchLeaderboard, type AttendanceSort} from "./leaderboard-model";
import styles from "./Home.module.css";

export default function Home() {
  const [users, setUsers] = useState<AtcmhUser[]>();
  const [error, setError] = useState<string>();
  const [sortBy, setSortBy] = useState<AttendanceSort>("allTime");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let current = true;
    ApiUtils.getAtcmhUsers()
      .then(value => { if (current) setUsers(value ?? []); })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "Failed to load data"); });
    return () => { current = false; };
  }, []);

  const rankedUsers = useMemo(() => rankLeaderboard(users ?? [], sortBy), [users, sortBy]);
  const matches = useMemo(() => searchLeaderboard(rankedUsers, filter), [rankedUsers, filter]);
  const results = paginateLeaderboard(matches, page);
  const allTimeAttendance = useMemo(() => (users ?? []).reduce((total, user) => total + user.allTimeAttendance, 0), [users]);
  const sort = (next: AttendanceSort) => { setSortBy(next); setPage(0); };
  const metricLabel = sortBy === "allTime" ? "All-time" : "Recent";

  return <main className={styles.homeContainer}>
    <section className={styles.homeHero} aria-labelledby="leaderboard-title">
      <div className={styles.homeHeroImage} aria-hidden="true">
        <Image src="/assets/leaderboard-airport.png" alt="" fill sizes="(max-width: 640px) 100vw, 660px" preload className={styles.homePhoto}/>
      </div>
      <div className={styles.homeHeroCopy}>
        <h1 id="leaderboard-title">Attendance Leaderboard</h1>
        {users ? <dl className={styles.homeStats} aria-label="Attendance summary">
          <div><dt>Attendances</dt><dd>{allTimeAttendance.toLocaleString()}</dd></div>
          <div><dt>Members</dt><dd>{users.length.toLocaleString()}</dd></div>
        </dl> : null}
      </div>
    </section>

    {error ? <section className={styles.homeState} role="alert"><h2>Unable to load the leaderboard</h2><p>Attendance is temporarily unavailable. Please try again.</p><button type="button" onClick={() => window.location.reload()}>Retry</button></section>
      : !users ? <section className={styles.homeState} role="status"><span className={styles.homeLoadingSpinner} aria-hidden="true"/><p>Loading attendance…</p></section>
      : !users.length ? <section className={styles.homeState}><h2>No attendance yet</h2><p>There are currently no members to display.</p></section>
      : <>
        <div className={styles.homeToolbar}>
          <div className={styles.homeControls}>
            <div className={styles.homeSortControls} role="group" aria-label="Sort leaderboard">
              <button type="button" className={sortBy === "allTime" ? styles.homeSortButtonActive : ""} onClick={() => sort("allTime")} aria-pressed={sortBy === "allTime"}>All time</button>
              <button type="button" className={sortBy === "recent" ? styles.homeSortButtonActive : ""} onClick={() => sort("recent")} aria-pressed={sortBy === "recent"}>Recent</button>
            </div>
            <div className={styles.homeSearch}>
              <label htmlFor="username-filter" className={styles.srOnly}>Search users</label>
              <MagnifyingGlassIcon size={19} aria-hidden="true"/>
              <input id="username-filter" type="search" placeholder="Name or Discord ID…" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}/>
            </div>
          </div>
        </div>
        <section className={styles.homeLeaders} aria-label={metricLabel + " attendance leaders"}>
          <ol>
            {rankedUsers.slice(0, 3).map(user => <li key={user.id} data-rank={user.rank}>
              <div className={styles.homeLeaderRank}><span>Rank</span><strong>{String(user.rank).padStart(2, "0")}</strong></div>
              <div className={styles.homeLeaderMember}><h2>{formatUserName(user.id, user.username)}</h2><p><strong>{(sortBy === "allTime" ? user.allTimeAttendance : user.recentAttendance).toLocaleString()}</strong><span>{sortBy === "recent" ? "recent attendances" : "attendances"}</span></p></div>
            </li>)}
          </ol>
        </section>
        <section className={styles.homePanel} aria-labelledby="rankings-title">
          <div className={styles.homePanelHeader}><h2 id="rankings-title">Full rankings</h2><p role="status">{filter.trim() ? matches.length.toLocaleString() + " of " + users.length.toLocaleString() + " members match your search" : "Showing " + users.length.toLocaleString() + " members"}</p></div>
          <table className={styles.homeUsersDataTable}>
            <caption className={styles.srOnly}>Members ranked by {metricLabel.toLowerCase()} attendance</caption>
            <thead><tr><th scope="col">Rank</th><th scope="col">Member</th><th scope="col" aria-sort={sortBy === "allTime" ? "descending" : undefined}>All time</th><th scope="col" aria-sort={sortBy === "recent" ? "descending" : undefined}>Recent</th></tr></thead>
            <tbody>
              {results.users.length ? results.users.map(user => <tr key={user.id}>
                <td className={styles.homeRank}>#{user.rank}</td><th scope="row">{formatUserName(user.id, user.username)}</th>
                <td className={sortBy === "allTime" ? styles.homeSelectedMetric : ""}>{user.allTimeAttendance.toLocaleString()}</td>
                <td className={sortBy === "recent" ? styles.homeSelectedMetric : ""}>{user.recentAttendance.toLocaleString()}</td>
              </tr>) : <tr><td colSpan={4} className={styles.homeNoResults}><strong>No members found</strong><p>Try another name or Discord ID.</p><button type="button" onClick={() => { setFilter(""); setPage(0); }}>Clear search</button></td></tr>}
            </tbody>
          </table>
          <nav className={styles.homePagination} aria-label="Leaderboard pages">
            <p role="status">{matches.length ? "Showing " + results.start.toLocaleString() + "–" + results.end.toLocaleString() + " of " + matches.length.toLocaleString() : "No results"}</p>
            <div>
              <button type="button" disabled={results.currentPage === 0} onClick={() => setPage(results.currentPage - 1)}><CaretLeftIcon size={16} aria-hidden="true"/>Previous</button>
              <span className={styles.srOnly}>Page {results.currentPage + 1} of {results.pageCount}</span>
              <button type="button" className={styles.homeNextPage} disabled={results.currentPage >= results.pageCount - 1} onClick={() => setPage(results.currentPage + 1)}>Next<CaretRightIcon size={16} aria-hidden="true"/></button>
            </div>
          </nav>
        </section>
      </>}
  </main>;
}
