"use client";
import {useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject} from "react";
import {createPortal} from "react-dom";
import type {Point} from "./model";
import styles from "./Simulator.module.css";

export default function AircraftPopupAnchor({scope, point, screenPoint, children, onDismiss, closing = false}: {
  scope: RefObject<HTMLDivElement | null>; point: Point; screenPoint?: Point; children: ReactNode; onDismiss?: () => void; closing?: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const initial = useRef({scope, point, screenPoint});
  useLayoutEffect(() => {
    const element = anchor.current, scopeElement = initial.current.scope.current;
    const bounds = scopeElement?.getBoundingClientRect();
    if (!element || !bounds) return;
    const origin = initial.current.screenPoint ?? {x: bounds.left + initial.current.point.x, y: bounds.top + initial.current.point.y};
    const place = () => {
      const root = scopeElement?.closest("main") ?? scopeElement!;
      const safe = root.getBoundingClientRect(), css = getComputedStyle(root);
      const left = Math.max(0, safe.left) + parseFloat(css.paddingLeft) + 5;
      const right = Math.min(window.innerWidth, safe.right) - parseFloat(css.paddingRight) - 5;
      const top = Math.max(0, safe.top) + parseFloat(css.paddingTop) + 5;
      const bottom = Math.min(window.innerHeight, safe.bottom) - parseFloat(css.paddingBottom) - 5;
      element.style.width = `${Math.max(1, Math.min(parseFloat(css.getPropertyValue("--controller-unit")) * 320 || 320, right - left))}px`;
      element.style.setProperty("--popup-available-height", `${Math.max(1, bottom - top)}px`);
      const {width, height} = element.getBoundingClientRect();
      const x = origin.x < (safe.left + safe.right) / 2 ? origin.x : origin.x - width;
      element.style.left = `${Math.max(left, Math.min(right - width, x))}px`;
      element.style.top = `${Math.max(top, Math.min(bottom - height, origin.y))}px`;
      const unit = parseFloat(css.getPropertyValue("--controller-unit")) || 1;
      element.style.setProperty("--popup-direction", `${(origin.x < (safe.left + safe.right) / 2 ? 36 : -36) * unit}px`);
      element.style.visibility = "visible";
    };
    place();
    // Submenus replace the list at the original tap, refitting their new height.
    const resize = new ResizeObserver(place);
    resize.observe(element);
    window.addEventListener("resize", place);
    return () => {resize.disconnect(); window.removeEventListener("resize", place);};
  }, []);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {if (event.target instanceof Node && !anchor.current?.contains(event.target)) onDismiss?.();};
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") onDismiss?.();};
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", dismiss, true); document.removeEventListener("keydown", escape);};
  }, [onDismiss]);
  const popup = <div ref={anchor} className={styles.contextAnchor} data-closing={closing} inert={closing} style={{position: "fixed", left: 0, top: 0, visibility: "hidden"}}>{children}</div>;
  const host = scope.current?.closest("main");
  return host ? createPortal(popup, host) : popup;
}
