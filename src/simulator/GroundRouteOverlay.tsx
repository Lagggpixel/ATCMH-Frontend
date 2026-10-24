"use client";
import {useLayoutEffect, useRef} from "react";
import AircraftSymbol from "./AircraftSymbol";
import {groundRouteItems} from "./ground-route-display";
import type {Airport, GroundRoute, Point, TaxiPoint} from "./model";
import styles from "./Simulator.module.css";

export function GroundHoldLabels({points, project}: {points: readonly TaxiPoint[]; project: (p: Point) => Point}) {
  return <div className={styles.groundRouteLabels} aria-hidden="true">{points.map((point, i) => point.hold ? <span key={i} className={styles.groundRouteHoldLabel} style={{left: project(point).x, top: project(point).y - 8}}>HOLD</span> : null)}</div>;
}

function MapLabel({point, bounds, children}: {point: Point; bounds?: {width: number; height: number}; children: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = ref.current; if (!node || !bounds) return;
    let active = true;
    const fit = () => {
      if (!active) return;
      node.style.left = `${Math.max(node.offsetWidth / 2, Math.min(bounds.width - node.offsetWidth / 2, point.x))}px`;
      node.style.top = `${Math.max(node.offsetHeight, Math.min(bounds.height, point.y))}px`;
    };
    fit(); void document.fonts.ready.then(fit);
    return () => {active = false;};
  }, [point.x, point.y, bounds, children]);
  return <span ref={ref} className={styles.groundRouteMapLabel} style={{left: point.x, top: point.y}}>{children}</span>;
}

export default function GroundRouteOverlay({airport, route, aircraftType, project, scale, bounds, onMove}: {airport: Airport; route: GroundRoute; aircraftType?: string; project: (p: Point) => Point; scale: number; bounds?: {width: number; height: number}; onMove: (index: number, p: Point) => void}) {
  const points = route.points.map(p => {const screen = project(p); return `${screen.x},${screen.y}`;}).join(" ");
  const items = groundRouteItems(airport, route);
  const headingAt = (index: number, push: boolean) => {
    const point = route.points[index], previous = route.points[Math.max(0, index - 1)];
    return (Math.atan2(point.x - previous.x, point.y - previous.y) * 180 / Math.PI + (push ? 180 : 0) + 360) % 360;
  };
  return <>
    <svg className={styles.groundDraftOverlay} role="group" aria-label="Draft ground route">
      <polyline points={points} fill="none" stroke="#000" strokeWidth="8" strokeLinejoin="round"/>
      <polyline points={points} fill="none" stroke="#ff00ff" strokeWidth="4" strokeLinejoin="round"/>
      {items.map(item => <circle key={item.key} cx={project(item.point).x} cy={project(item.point).y} r="3" fill="none" stroke="#90ee90" strokeWidth="3"/>)}
      {route.controls.map((point, index) => {
        const screen = project(point);
        return <circle key={index} cx={screen.x} cy={screen.y} r="3" fill="none" stroke="#fff" strokeWidth="2" role={index ? "button" : undefined} tabIndex={index ? 0 : undefined} aria-label={index ? `Route control point ${index}` : undefined} onKeyDown={event => {
          const offsets: Record<string, Point> = {ArrowLeft: {x: -1, y: 0}, ArrowRight: {x: 1, y: 0}, ArrowUp: {x: 0, y: 1}, ArrowDown: {x: 0, y: -1}};
          const offset = offsets[event.key]; if (!offset || !index) return;
          event.preventDefault(); const step = (event.shiftKey ? 30 : 8) / scale;
          onMove(index, {x: point.x + offset.x * step, y: point.y + offset.y * step});
        }}/>;
      })}
      {route.kind === "pushback" && aircraftType ? items.filter(item => item.type === "push" || item.type === "pull").map(item => {
        const screen = project(item.point);
        return <g key={item.key} transform={`translate(${screen.x} ${screen.y})`} color="#ff00ff"><AircraftSymbol type={aircraftType} heading={headingAt(item.index, item.type === "push")} x={-13} y={-13}/></g>;
      }) : null}
    </svg>
    <div className={styles.groundRouteLabels} aria-hidden="true">{items.map(item => {
      const screen = project(item.point);
      const tail = ["North", "NorthEast", "East", "SouthEast", "South", "SouthWest", "West", "NorthWest"][Math.round((headingAt(item.index, item.type === "push") + 180) % 360 / 45) % 8];
      return <MapLabel key={item.key} point={{x: screen.x, y: screen.y - 25}} bounds={bounds}>{item.mapText + (item.type === "push" || item.type === "pull" ? `\nTail ${tail}` : "")}</MapLabel>;
    })}</div>
  </>;
}
