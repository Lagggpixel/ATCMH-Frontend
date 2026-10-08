import type {Metadata} from "next";
import CareersFrame from "@/src/careers/CareersFrame";
import CareersApplicationGate from "@/src/careers/CareersApplicationStatus";

export const metadata: Metadata = {title: "Your mentor application"};
export default function Page() {
    return <CareersFrame><CareersApplicationGate/></CareersFrame>;
}
