"use client";

import {useEffect} from "react";
import type {CourseViewEventType} from "@/src/dashboard/types/Course";
import {ExamsApiUtils} from "@/src/dashboard/utils/ExamsApiUtils";

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_VIEW_EVENT_SECONDS = 120;

function uuid(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function visibleSection(nodes: HTMLElement[], ratios: Map<HTMLElement, number>): string | null {
    let selected: HTMLElement | undefined;
    let selectedRatio = 0;
    for (const node of nodes) {
        const ratio = ratios.get(node) ?? 0;
        if (ratio > selectedRatio) {
            selected = node;
            selectedRatio = ratio;
        }
    }
    return selected?.dataset.courseSectionId ?? null;
}

export default function CourseViewTracker({courseId}: {courseId: string}) {
    useEffect(() => {
        let disposed = false;
        let paused = document.visibilityState !== "visible";
        let csrfToken: string | null = null;
        let activeSectionId: string | null = null;
        let lastFlush = performance.now();
        const sessionId = uuid();
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-course-section-id]"));
        const ratios = new Map<HTMLElement, number>();

        const send = (eventType: CourseViewEventType, durationSeconds: number, sectionId = activeSectionId, keepalive = false) => {
            if (disposed || !csrfToken || (paused && eventType === "open")) return;
            void ExamsApiUtils.recordCourseView(courseId, {
                eventId: uuid(),
                sessionId,
                sectionId,
                eventType,
                durationSeconds: Math.max(0, Math.min(MAX_VIEW_EVENT_SECONDS, durationSeconds)),
            }, csrfToken, keepalive).catch(() => {
                // Analytics must never interrupt course reading or expose auth errors in the UI.
            });
        };

        const flush = (eventType: CourseViewEventType, keepalive = false) => {
            if (disposed || paused || !csrfToken) return;
            const now = performance.now();
            const elapsed = Math.max(0, Math.min(MAX_VIEW_EVENT_SECONDS, Math.floor((now - lastFlush) / 1000)));
            lastFlush = now;
            if (elapsed > 0 || eventType === "close") send(eventType, elapsed, activeSectionId, keepalive);
        };

        const selectSection = (nextSectionId: string | null) => {
            if (activeSectionId === nextSectionId) return;
            if (activeSectionId !== null) flush("heartbeat");
            activeSectionId = nextSectionId;
            lastFlush = performance.now();
            send("open", 0, activeSectionId);
        };

        const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
            for (const entry of entries) ratios.set(entry.target as HTMLElement, entry.isIntersecting ? entry.intersectionRatio : 0);
            selectSection(visibleSection(nodes, ratios));
        }, {threshold: [0, 0.25, 0.5, 0.75], rootMargin: "-15% 0px -45% 0px"});

        if (observer) nodes.forEach(node => observer.observe(node));
        else selectSection(nodes[0]?.dataset.courseSectionId ?? null);

        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") flush("heartbeat");
        }, HEARTBEAT_INTERVAL_MS);

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                flush("close", true);
                paused = true;
            } else {
                paused = false;
                lastFlush = performance.now();
                send("open", 0);
            }
        };
        const onPageHide = () => {
            flush("close", true);
            paused = true;
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("pagehide", onPageHide);

        void ExamsApiUtils.getExistingSession().then(session => {
            if (!disposed && session?.csrfToken) {
                csrfToken = session.csrfToken;
                send("open", 0);
            }
        }).catch(() => {
            // The learner page is already authenticated server-side; a transient tracker failure is non-fatal.
        });

        return () => {
            flush("close", true);
            disposed = true;
            window.clearInterval(interval);
            observer?.disconnect();
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("pagehide", onPageHide);
        };
    }, [courseId]);

    return null;
}
