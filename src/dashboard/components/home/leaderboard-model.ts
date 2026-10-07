import type {AtcmhUser} from "../../types/AtcmhUser";
import {matchesUserSearch} from "../../../lib/user-display-name";

export type AttendanceSort = "allTime" | "recent";
export interface RankedUser extends AtcmhUser { rank: number }
export const LEADERBOARD_PAGE_SIZE = 10;

export function rankLeaderboard(users: readonly AtcmhUser[], sort: AttendanceSort): RankedUser[] {
  const metric = sort === "allTime" ? "allTimeAttendance" : "recentAttendance";
  return [...users].sort((a, b) => b[metric] - a[metric]).map((user, index) => ({...user, rank: index + 1}));
}

export function searchLeaderboard(users: readonly RankedUser[], query: string): RankedUser[] {
  return users.filter(user => matchesUserSearch(user.id, user.username, query));
}

export function paginateLeaderboard(users: readonly RankedUser[], page: number) {
  const pageCount = Math.max(1, Math.ceil(users.length / LEADERBOARD_PAGE_SIZE));
  const currentPage = Math.min(Math.max(0, page), pageCount - 1);
  const offset = currentPage * LEADERBOARD_PAGE_SIZE;
  return {
    users: users.slice(offset, offset + LEADERBOARD_PAGE_SIZE),
    currentPage,
    pageCount,
    start: users.length ? offset + 1 : 0,
    end: Math.min(offset + LEADERBOARD_PAGE_SIZE, users.length),
  };
}
