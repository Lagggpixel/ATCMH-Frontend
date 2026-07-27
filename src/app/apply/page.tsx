import type {Metadata} from "next";
import {Suspense} from "react";
import ApplicationPage from "@/src/apply/ApplicationPage";
import SiteFrame from "@/src/platform/SiteFrame";

export const metadata: Metadata = {
    title: "Apply",
    description: "Apply for ATCMH mentorship, written exam help, or a mock practical.",
};

export default function ApplyPage() {
    return <SiteFrame showLogin><Suspense fallback={<main className="platform-state"><span className="platform-spinner"/><p>Loading application…</p></main>}><ApplicationPage/></Suspense></SiteFrame>;
}
