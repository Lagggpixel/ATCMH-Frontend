import type {CourseDiagramBlock} from "@/src/lib/course-document";
import styles from "./CourseReader.module.css";

interface CourseDiagramProps {
    block: CourseDiagramBlock;
}

function Label({x, y, children}: {x: number; y: number; children: string}) {
    return <text x={x} y={y} fill="currentColor" fontSize="13" fontWeight="700" textAnchor="middle">{children}</text>;
}

export default function CourseDiagram({block}: CourseDiagramProps) {
    const label = block.diagramId.replace(/-/g, " ");
    const markerId = `course-arrow-${block.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const common = {viewBox: "0 0 720 230", role: "img", "aria-label": `ATC diagram: ${label}` as string};
    if (block.diagramId === "pattern-circuit") return <figure className={styles.diagram}><svg {...common}><rect x="90" y="70" width="540" height="100" rx="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="12 9"/><path d="M100 80 L620 80 M620 80 L620 160 M620 160 L100 160 M100 160 L100 80" fill="none" stroke="#38bdf8" strokeWidth="10" markerEnd={`url(#${markerId})`}/><path d="M100 80 L620 80" stroke="#f59e0b" strokeWidth="3"/><Label x={360} y={125}>Downwind · Base · Final</Label><defs><marker id={markerId} markerWidth="8" height="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#38bdf8"/></marker></defs></svg><figcaption>Pattern flow and the points where Tower sequences traffic.</figcaption></figure>;
    if (block.diagramId === "coordination-handoff") return <figure className={styles.diagram}><svg {...common}><rect x="70" y="78" width="180" height="72" rx="12" fill="#0e7490"/><rect x="270" y="78" width="180" height="72" rx="12" fill="#1d4ed8"/><rect x="470" y="78" width="180" height="72" rx="12" fill="#7c3aed"/><Label x={160} y={120}>Ground</Label><Label x={360} y={120}>Tower</Label><Label x={560} y={120}>Radar</Label><path d="M250 114 H270 M450 114 H470" stroke="#fbbf24" strokeWidth="5" markerEnd={`url(#${markerId})`}/><text x="360" y="48" fill="currentColor" fontSize="15" textAnchor="middle">Clear ownership · coordinated handoff</text><defs><marker id={markerId} markerWidth="8" height="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#fbbf24"/></marker></defs></svg><figcaption>Coordinate the next controller before transferring responsibility.</figcaption></figure>;
    return <figure className={styles.diagram}><svg {...common}><rect x="92" y="86" width="536" height="58" rx="12" fill="#1e293b" stroke="#38bdf8" strokeWidth="3"/><path d="M120 115 H600" stroke="#f8fafc" strokeWidth="3" strokeDasharray="18 12"/><rect x="300" y="42" width="120" height="36" rx="8" fill="#f59e0b"/><Label x={360} y={65}>{block.diagramId === "runway-selection" ? "Runway" : block.diagramId === "taxi-hold-short" ? "Hold short" : label}</Label><path d="M360 78 V86" stroke="#f59e0b" strokeWidth="4"/><text x="360" y="190" fill="currentColor" fontSize="14" textAnchor="middle">Use the clearance, geometry, and traffic picture together.</text></svg><figcaption>{label.charAt(0).toUpperCase() + label.slice(1)} visual reference.</figcaption></figure>;
}
