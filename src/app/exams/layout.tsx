import type {Metadata} from "next";
import type {ReactNode} from "react";
import "./exams.css";

export const metadata: Metadata = {
  title: "ATCMH Exam Center",
  description: "Mentorship and quiz resources for aspiring Infinite Flight Air Traffic Controllers.",
};

export default function ExamsLayout({children}: Readonly<{children: ReactNode}>) {
  return children;
}
