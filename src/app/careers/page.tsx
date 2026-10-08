import type {Metadata} from "next";
import CareersPage from "@/src/careers/CareersPage";

export const metadata: Metadata = {
    title: "Careers",
    description: "Apply to become an ATCMH mentor.",
};

export default async function Page({searchParams}: {searchParams: Promise<{view?: string}>}) {
    const {view} = await searchParams;
    return <CareersPage showExpectations={view === "expectations"}/>;
}
