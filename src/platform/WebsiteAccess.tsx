"use client";

import {useEffect} from "react";
import {usePathname} from "next/navigation";

export function sendWebsiteAccess() {
  void fetch("/api/access", {method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true}).catch(() => {});
}

export function observeWebsiteReturns(page: Window, document: Document, report = sendWebsiteAccess) {
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) report(); };
  const onVisibility = () => { if (document.visibilityState === "visible") report(); };
  page.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    page.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export default function WebsiteAccess() {
  const pathname = usePathname();
  useEffect(() => { sendWebsiteAccess(); }, [pathname]);
  useEffect(() => observeWebsiteReturns(window, document), []);
  return null;
}
