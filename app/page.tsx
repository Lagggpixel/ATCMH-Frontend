import type {Metadata} from "next";
import Home from "@/src/marketing/Home";

export const metadata: Metadata = {
    title: "ATC Mentorship Hub — Your Gateway to IFATC",
    description: "ATCMH helps aspiring IFATC controllers master the skills to control Expert Server skies in Infinite Flight through mentoring, written exam help, and mock practicals.",
    openGraph: {title: "ATC Mentorship Hub — Your Gateway to IFATC", description: "Master the skills to control Expert Server skies in Infinite Flight.", type: "website", images: ["https://i.postimg.cc/5NvYr5tw/4-20260416-221905-0003.jpg"]},
    twitter: {card: "summary_large_image", site: "@ATCMH", images: ["https://i.postimg.cc/5NvYr5tw/4-20260416-221905-0003.jpg"]},
};

export default function MarketingPage() { return <Home/>; }
