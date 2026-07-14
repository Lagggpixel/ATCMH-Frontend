import type {Metadata} from "next";
import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import SharedDashboardPage from "@/src/dashboard/SharedDashboardPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Attendance Leaderboard — ATCMH",
    description: "View the public ATCMH attendance leaderboard.",
};

export default function LeaderboardPage() {
    return <DashboardRuntime><SharedDashboardPage page="leaderboard"/></DashboardRuntime>;
}
