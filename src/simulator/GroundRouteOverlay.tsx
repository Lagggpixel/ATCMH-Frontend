"use client";
import AircraftSymbol from "./AircraftSymbol";
import type {GroundRoute, Point} from "./model";
import styles from "./Simulator.module.css";

export default function GroundRouteOverlay({route, aircraftType, project, scale, onMove}: {route: GroundRoute; aircraftType?: string; project: (p: Point) => Point; scale: number; onMove: (index: number, p: Point) => void}) {
  const points = route.points.map(p => {const screen = project(p); return `${screen.x},${screen.y}`;}).join(" ");
  return <svg className={styles.groundDraftOverlay} role="group" aria-label="Draft ground route">
    <polyline points={points} fill="none" stroke="#000" strokeWidth="7" strokeLinejoin="round"/>
    <polyline points={points} fill="none" stroke="#ff38e5" strokeWidth="4" strokeLinejoin="round"/>
    {route.points.map((p, i) => p.hold ? <text key={`hold-${i}`} x={project(p).x + 10} y={project(p).y - 10} fill="#ffb347" fontSize="13">HOLD{p.runway ? ` ${p.runway}` : ""}</text> : null)}
    {route.controlIndices.slice(1).map((index, i) => {
      const point = route.points[index], screen = project(point), previous = route.points[index - 1];
      const push = route.kind === "pushback" && i === 0;
      const heading = (Math.atan2(point.x - previous.x, point.y - previous.y) * 180 / Math.PI + (push ? 180 : 0) + 360) % 360;
      return <g key={i}>
        <circle cx={screen.x} cy={screen.y} r="8" fill="white" stroke="#ff38e5" strokeWidth="2" role="button" tabIndex={0} aria-label={`Route control point ${i + 1}`} onKeyDown={event => {
          const offsets: Record<string, Point> = {ArrowLeft: {x: -1, y: 0}, ArrowRight: {x: 1, y: 0}, ArrowUp: {x: 0, y: 1}, ArrowDown: {x: 0, y: -1}};
          const offset = offsets[event.key]; if (!offset) return;
          event.preventDefault(); const step = (event.shiftKey ? 30 : 8) / scale;
          onMove(i + 1, {x: point.x + offset.x * step, y: point.y + offset.y * step});
        }}/>
        {route.kind === "pushback" && aircraftType ? <g transform={`translate(${screen.x} ${screen.y})`} color="#ff38e5"><AircraftSymbol type={aircraftType} heading={heading} x={-13} y={-13}/><text x={16} y={-10} fill="#ff9df2" fontSize="13">{push ? "Push" : "Pull"}</text></g> : null}
      </g>;
    })}
  </svg>;
}
