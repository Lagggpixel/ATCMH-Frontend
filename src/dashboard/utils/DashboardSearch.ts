import type {AdminNavigationItem} from "../components/admin/AdminNavigation.ts";
import type {AdminMentee} from "../types/AdminMentee.ts";
import type {Session} from "../types/Session.ts";
import type {AtcmhUser} from "../types/AtcmhUser.ts";
import {formatUserName} from "../../lib/user-display-name.ts";
import {formatAdminUtcDate} from "./AdminDateUtils.ts";

export interface DashboardSearchResult {href: string; label: string; detail: string; kind: "Section" | "Mentee" | "Session"}
export function searchDashboard(query: string, sections: AdminNavigationItem[], mentees: AdminMentee[], sessions: Session[], users: AtcmhUser[]): DashboardSearchResult[] {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = (text: string) => words.every(word => text.toLowerCase().includes(word));
    const results: DashboardSearchResult[] = sections.filter(item => matches(item.label)).map(item => ({href: item.path, label: item.label, detail: "Open dashboard section", kind: "Section"}));
    if (!words.length) return results;
    const names = new Map(users.map(user => [user.id, user.username]));
    const name = (id: string, fallback?: string) => formatUserName(id, names.get(id), fallback);
    if (sections.some(item => item.path === "/dashboard/mentees")) {
        for (const mentee of mentees) {
            const label = name(mentee.mentee, mentee.ifcName);
            const detail = `#${mentee.id} · ${mentee.state.replace(/_/g, " ")}${mentee.ifcName ? ` · ${mentee.ifcName}` : ""}`;
            if (matches(`${label} ${detail} ${mentee.mentee} ${mentee.ifcId ?? ""}`)) results.push({href: `/dashboard/mentees/${mentee.id}`, label, detail, kind: "Mentee"});
        }
    }
    if (sections.some(item => item.path === "/dashboard/sessions")) {
        for (const session of sessions) {
            const label = `Session #${session.id} · ${session.airport}`;
            const detail = `${name(session.mentee)} · ${name(session.mentor)} · ${formatAdminUtcDate(session.time)}${session.cancelled ? " · Cancelled" : ""}`;
            if (matches(`${label} ${detail} ${session.mentee} ${session.mentor}`)) results.push({href: `/dashboard/sessions?session=${session.id}`, label, detail, kind: "Session"});
        }
    }
    return results.slice(0, 30);
}
