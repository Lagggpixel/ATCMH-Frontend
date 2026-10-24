import {useId, useLayoutEffect, useRef, type RefObject} from "react";
import styles from "./Simulator.module.css";

/** IF 26.4 MapControl.RenderExtendedFlightStripCircle: 25 dp radius,
 * 2 dp violet stroke, horizontal leader and a rail 2 px left of the menu. */
export default function CommandMenuConnector({aircraftId, rootRef}: {aircraftId: string; rootRef: RefObject<HTMLElement | null>}) {
  const pathRef = useRef<SVGPathElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const clipId = useId();
  useLayoutEffect(() => {
    const root = rootRef.current, path = pathRef.current;
    if (!root || !path) return;
    let frame = 0;
    let aircraft: HTMLElement | undefined;
    let panel: HTMLElement | null = null;
    let previous = "";
    const draw = () => {
      if (!aircraft?.isConnected) aircraft = Array.from(root.querySelectorAll<HTMLElement>("[data-scope-aircraft]")).find(node => node.dataset.scopeAircraft === aircraftId);
      if (!panel?.isConnected) panel = root.querySelector<HTMLElement>("[data-aircraft-messages]");
      let next = "";
      if (aircraft && panel?.dataset.aircraftMessages === aircraftId) {
        const origin = root.getBoundingClientRect(), target = aircraft.getBoundingClientRect(), menu = panel.getBoundingClientRect();
        const scope = aircraft.closest('[aria-label$="radar scope"]')?.getBoundingClientRect();
        const x = target.left + target.width / 2, y = target.top + target.height / 2;
        if (scope && target.right >= scope.left && target.left <= scope.right && target.bottom >= scope.top && target.top <= scope.bottom && target.width && menu.width) {
          const clip = clipRef.current!;
          clip.setAttribute("x", String(scope.left - origin.left)); clip.setAttribute("y", String(scope.top - origin.top));
          clip.setAttribute("width", String(scope.width)); clip.setAttribute("height", String(scope.height));
          next = `M ${menu.left - origin.left} ${y - origin.top} H ${x - origin.left + 25} M ${menu.left - origin.left - 2} ${menu.top - origin.top} V ${menu.bottom - origin.top}`;
        }
      }
      if (next !== previous) {path.setAttribute("d", next); previous = next;}
      // Follow the rendered aircraft, including client prediction and camera motion,
      // without adding React renders or changing the menu's input handling.
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [aircraftId, rootRef]);
  return <svg className={styles.commandConnector} aria-hidden="true" focusable="false"><defs><clipPath id={clipId}><rect ref={clipRef}/></clipPath></defs><path ref={pathRef} clipPath={`url(#${clipId})`} fill="none" stroke="#ee82ee" strokeWidth="2"/></svg>;
}
