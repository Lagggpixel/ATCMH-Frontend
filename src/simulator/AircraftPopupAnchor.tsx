"use client";
import {useLayoutEffect, useRef, type ReactNode, type RefObject} from "react";
import type {Point} from "./model";
import styles from "./Simulator.module.css";

export default function AircraftPopupAnchor({scope, point, screenPoint, children}: {
  scope: RefObject<HTMLDivElement | null>; point: Point; screenPoint?: Point; children: ReactNode;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const initial = useRef({scope, point, screenPoint});
  useLayoutEffect(() => {
    const element = anchor.current, bounds = initial.current.scope.current?.getBoundingClientRect();
    if (!element || !bounds) return;
    const left = Math.max(6, bounds.left + 6), right = Math.min(window.innerWidth - 6, bounds.right - 6);
    const top = Math.max(6, bounds.top + 6), bottom = Math.min(window.innerHeight - 6, bounds.bottom - 6);
    const width = Math.max(1, Math.min(230, right - left)), height = Math.max(1, bottom - top);
    element.style.width = `${width}px`;
    element.style.setProperty("--popup-available-height", `${height}px`);
    const measured = element.getBoundingClientRect();
    const origin = initial.current.screenPoint ?? {x: bounds.left + initial.current.point.x, y: bounds.top + initial.current.point.y};
    const gap = initial.current.screenPoint ? 0 : 24;
    const x = origin.x + gap + width <= right ? origin.x + gap : origin.x - gap - width;
    const y = Math.max(top, Math.min(bottom - measured.height, origin.y + gap));
    element.style.left = `${Math.max(left, Math.min(right - width, x))}px`;
    element.style.top = `${y}px`;
    element.style.setProperty("--popup-available-height", `${Math.max(1, bottom - y)}px`);
    element.style.visibility = "visible";
    // Capture once before paint; aircraft motion, map changes and submenus keep this position.
  }, []);
  return <div ref={anchor} className={styles.contextAnchor} style={{position: "fixed", left: 0, top: 0, visibility: "hidden"}}>{children}</div>;
}
