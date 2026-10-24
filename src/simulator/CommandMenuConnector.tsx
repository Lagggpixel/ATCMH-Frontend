import {useId, useLayoutEffect, useRef, type RefObject} from "react";
import styles from "./Simulator.module.css";

/** IF 26.4 RenderExtendedFlightStripCircle and UIUtils.ScaleValue.
 * The circle belongs to the open extended strip, never ordinary map selection. */
export default function CommandMenuConnector({aircraftId, rootRef}: {aircraftId: string; rootRef: RefObject<HTMLElement | null>}) {
  const pathRef = useRef<SVGPathElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const clipId = useId();
  useLayoutEffect(() => {
    const root = rootRef.current, path = pathRef.current, circle = circleRef.current, group = groupRef.current;
    if (!root || !path || !circle || !group) return;
    let frame = 0;
    let aircraft: HTMLElement | undefined;
    let panel: HTMLElement | null = null;
    let previous = "";
    const draw = () => {
      if (!aircraft?.isConnected) aircraft = Array.from(root.querySelectorAll<HTMLElement>("[data-scope-aircraft]")).find(node => node.dataset.scopeAircraft === aircraftId);
      if (!panel?.isConnected) panel = root.querySelector<HTMLElement>("[data-aircraft-messages]");
      let next = "";
      // Android density-independent pixels map to CSS pixels. IF reduces its UI
      // scale to .65 below an 8-inch display, .75 otherwise, then rounds in device
      // pixels. Browsers lack physical DPI: use the Android 160-dp/in baseline
      // for the screen-size boundary, not the resizable scope/viewport size.
      const density = window.devicePixelRatio || 1;
      const uiScale = Math.hypot(window.screen.width, window.screen.height) < 8 * 160 ? .65 : .75;
      const scaleValue = (value: number) => Math.floor(value * density * uiScale + .5) / density;
      const radius = scaleValue(25), stroke = scaleValue(2);
      if (aircraft && panel?.dataset.aircraftMessages === aircraftId) {
        const origin = root.getBoundingClientRect(), target = aircraft.getBoundingClientRect(), menu = panel.getBoundingClientRect();
        const scope = aircraft.closest('[aria-label$="radar scope"]')?.getBoundingClientRect();
        const anchor = aircraft.querySelector<SVGSVGElement>("[data-aircraft-symbol]")?.getScreenCTM();
        const x = anchor?.e ?? target.left + target.width / 2, y = anchor?.f ?? target.top + target.height / 2;
        if (scope && target.right >= scope.left && target.left <= scope.right && target.bottom >= scope.top && target.top <= scope.bottom && target.width && menu.width) {
          const clip = clipRef.current!;
          clip.setAttribute("x", String(scope.left - origin.left)); clip.setAttribute("y", String(scope.top - origin.top));
          clip.setAttribute("width", String(scope.width)); clip.setAttribute("height", String(scope.height));
          const cx = x - origin.left, cy = y - origin.top;
          next = `${cx},${cy},${radius},${stroke},${menu.left},${menu.top},${menu.bottom},${x},${y},${origin.left},${origin.top}`;
          if (next !== previous) {
            circle.setAttribute("cx", String(cx)); circle.setAttribute("cy", String(cy)); circle.setAttribute("r", String(radius));
            group.setAttribute("stroke-width", String(stroke));
            path.setAttribute("d", `M ${menu.left - origin.left} ${y - origin.top} H ${x - origin.left + radius} M ${menu.left - origin.left - 2 / density} ${menu.top - origin.top} V ${menu.bottom - origin.top}`);
          }
        }
      }
      if (next !== previous) {group.setAttribute("visibility", next ? "visible" : "hidden"); previous = next;}
      // Follow the rendered aircraft, including client prediction and camera motion,
      // without adding React renders or changing the menu's input handling.
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [aircraftId, rootRef]);
  return <svg className={styles.commandConnector} data-extended-strip-aircraft={aircraftId} aria-hidden="true" focusable="false"><defs><clipPath id={clipId}><rect ref={clipRef}/></clipPath></defs><g ref={groupRef} clipPath={`url(#${clipId})`} fill="none" strokeWidth="2" visibility="hidden"><circle ref={circleRef} stroke="#ee82ee"/><path ref={pathRef} stroke="#ee82ee"/></g></svg>;
}
