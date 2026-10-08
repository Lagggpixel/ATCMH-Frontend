import type {Metadata} from "next";
import CareersApplyPage from "@/src/careers/CareersApplyPage";

export const metadata: Metadata = {
    title: "Mentor application",
    description: "Apply to become an ATCMH mentor.",
};

export default function Page() {
    return <CareersApplyPage/>;
}
