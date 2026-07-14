import type {Metadata} from "next";
import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import Home from "@/src/dashboard/components/home/Home";
import SiteFrame from "@/src/platform/SiteFrame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Attendance Leaderboard — ATCMH",
    description: "View the public ATCMH attendance leaderboard.",
};

export default function LeaderboardPage() {
    return <SiteFrame><DashboardRuntime><Home/></DashboardRuntime></SiteFrame>;
}
