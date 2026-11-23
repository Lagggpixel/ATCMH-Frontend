import type {Metadata} from "next";
import type {GroundSchoolStatus, LearnerCourseSummary} from "@/src/dashboard/types/Course";
import {listGroundSchoolCatalogue} from "@/src/lib/course-api-client";
import CourseCatalogue from "@/src/learning/CourseCatalogue";
import DashboardExamSessionBootstrap from "@/src/app/exams/(learner)/DashboardExamSessionBootstrap";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Ground School"};

export default async function GroundSchoolPage() {
    let courses: LearnerCourseSummary[] = [];
    let groundSchool: GroundSchoolStatus | undefined;
    let unavailable = false;
    try {
        const result = await listGroundSchoolCatalogue();
        courses = result.courses;
        groundSchool = result.groundSchool;
    } catch {
        unavailable = true;
    }
    return <>
        <DashboardExamSessionBootstrap/>
        <CourseCatalogue courses={courses} groundSchool={groundSchool} unavailable={unavailable}/>
    </>;
}
