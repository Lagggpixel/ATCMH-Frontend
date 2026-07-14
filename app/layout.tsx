import type {Metadata} from "next";
import type {ReactNode} from "react";
import "./base.css";
import "@/src/marketing/marketing.css";

export const metadata: Metadata = {
    title: {default: "ATC Mentorship Hub", template: "%s | ATCMH"},
    description: "ATC Mentorship Hub",
};

export default function RootLayout({children}: {children: ReactNode}) {
    return <html lang="en"><body>{children}</body></html>;
}
