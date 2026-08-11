import type {Metadata} from "next";
import Home from "@/src/marketing/Home";

export const metadata: Metadata = {
    title: "ATC Mentorship Hub — Your Gateway to IFATC",
    description: "ATCMH helps aspiring IFATC controllers master the skills to control Expert Server skies in Infinite Flight through mentoring, written exam help, and mock practicals.",
    openGraph: {
        title: "ATC Mentorship Hub — Your Gateway to IFATC",
        description: "Master the skills to control Expert Server skies in Infinite Flight.",
        type: "website",
        images: [{url: "https://atcmh.org/dashboard-icon.png", width: 1024, height: 1024, alt: "ATC Mentorship Hub logo"}],
    },
    twitter: {card: "summary", site: "@ATCMH", images: ["https://atcmh.org/dashboard-icon.png"]},
};

export default function MarketingPage() { return <Home/>; }
