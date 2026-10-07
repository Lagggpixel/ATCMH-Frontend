"use client";

import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import LearningFrame from "@/src/learning/LearningFrame";
import SiteFrame from "./SiteFrame";

export default function LearnerSiteFrame({children}: {children: ReactNode}) {
    const pathname = usePathname();
    if (pathname === "/exams/courses" || pathname.startsWith("/exams/courses/")) return <LearningFrame product="Courses">{children}</LearningFrame>;
    return <SiteFrame>{children}</SiteFrame>;
}
