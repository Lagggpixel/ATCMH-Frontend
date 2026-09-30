import type {Metadata} from "next";
import type {ReactNode} from "react";
import "./base.css";
import "@/src/marketing/marketing.css";
import WebsiteAccess from "@/src/platform/WebsiteAccess";
import PortalAuthProvider from "@/src/platform/auth/PortalAuthProvider";
import ConfirmationProvider from "@/src/platform/confirmation/ConfirmationProvider";
import {publicRuntimeConfig} from "@/src/lib/runtime-config";
import {dashboardAppearanceBootstrap} from "@/src/dashboard/theme/appearance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: {default: "ATC Mentorship Hub", template: "%s | ATCMH"},
    description: "ATC Mentorship Hub",
};

export default function RootLayout({children}: {children: ReactNode}) {
    const {dashboardApiUrl} = publicRuntimeConfig();
    return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html: dashboardAppearanceBootstrap}}/></head><body><WebsiteAccess/><PortalAuthProvider dashboardApiUrl={dashboardApiUrl}><ConfirmationProvider>{children}</ConfirmationProvider></PortalAuthProvider></body></html>;
}
