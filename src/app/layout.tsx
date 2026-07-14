import type {Metadata} from "next";
import type {ReactNode} from "react";
import "./base.css";
import "@/src/marketing/marketing.css";
import PortalAuthProvider from "@/src/platform/auth/PortalAuthProvider";
import {publicRuntimeConfig} from "@/src/lib/runtime-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: {default: "ATC Mentorship Hub", template: "%s | ATCMH"},
    description: "ATC Mentorship Hub",
};

export default function RootLayout({children}: {children: ReactNode}) {
    const {dashboardApiUrl} = publicRuntimeConfig();
    return <html lang="en"><body><PortalAuthProvider dashboardApiUrl={dashboardApiUrl}>{children}</PortalAuthProvider></body></html>;
}
