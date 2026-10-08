import type {ReactNode} from "react";
import LearningFrame from "@/src/learning/LearningFrame";

export default function CareersFrame({children}: {children: ReactNode}) {
    return <LearningFrame product="Careers">{children}</LearningFrame>;
}
