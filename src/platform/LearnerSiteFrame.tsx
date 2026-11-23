"use client";

import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import GroundSchoolChatHost from "@/src/ground-school/GroundSchoolChatHost";
import LearningFrame from "@/src/learning/LearningFrame";
import SiteFrame from "./SiteFrame";

export default function LearnerSiteFrame({children}: {children: ReactNode}) {
    const pathname = usePathname();
    if (pathname === "/ground-school" || pathname.startsWith("/ground-school/")
        || pathname === "/exams/courses" || pathname.startsWith("/exams/courses/")) {
        return <LearningFrame product="Ground School">{children}<GroundSchoolChatHost/></LearningFrame>;
    }
    return <SiteFrame>{children}<GroundSchoolChatHost/></SiteFrame>;
}
