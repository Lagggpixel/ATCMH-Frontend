"use client";

import {Suspense} from "react";
import {usePathname, useSearchParams} from "next/navigation";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {shouldShowGroundSchoolChat} from "./ground-school-chat-client";
import GroundSchoolChatWidget from "./GroundSchoolChatWidget";

function GroundSchoolChatInner() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const {session} = usePortalAuth();
    const courseId = searchParams.get("courseId");
    if (!session || !shouldShowGroundSchoolChat(pathname, courseId)) {
        return null;
    }
    return <GroundSchoolChatWidget key={String(session.accountId ?? "active")}/>;
}

export default function GroundSchoolChatHost() {
    return <Suspense fallback={null}><GroundSchoolChatInner/></Suspense>;
}
