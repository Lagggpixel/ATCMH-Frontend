import type {Metadata} from "next";
import Home from "@/src/dashboard/components/home/Home";
import SiteFrame from "@/src/platform/SiteFrame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Attendance Leaderboard — ATCMH",
    description: "View the public ATCMH attendance leaderboard.",
};

export default function LeaderboardPage() {
    return <SiteFrame><Home/></SiteFrame>;
}
