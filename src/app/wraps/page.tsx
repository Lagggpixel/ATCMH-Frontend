import type {Metadata} from "next";
import {cookies} from "next/headers";
import {notFound} from "next/navigation";
import SiteFrame from "@/src/platform/SiteFrame";
import WrapsPage from "@/src/wraps/WrapsPage";
import {canOpenWraps} from "@/src/wraps/wraps-access";
import {wrapPreview} from "@/src/wraps/wraps-preview";
import {publicRuntimeConfig} from "@/src/lib/runtime-config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Your wrap", robots: {index: false, follow: false}};

export default async function WrapsRoute() {
    const config = publicRuntimeConfig();
    if (!await canOpenWraps((await cookies()).toString(), {backendOrigin: config.dashboardApiUrl, frontendOrigin: config.frontendPublicOrigin})) notFound();
    return <SiteFrame footer={false}><WrapsPage data={wrapPreview}/></SiteFrame>;
}
