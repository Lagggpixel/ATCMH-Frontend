import type {ReactNode} from "react";
import type {CourseDiagramBlock} from "@/src/lib/course-document";
import styles from "./CourseGroundDiagram.module.css";

const captions: Record<string, string> = {
    "ground-movement-flow": "Build the traffic picture, approve pushback when clear, issue a taxi route, then protect the runway boundary before handoff.",
    "ground-pushback": "Aircraft A waits at the stand while B passes behind it. Approve pushback only when the intended path and final position are clear.",
    "ground-intersection": "Two routes converge. Instruct B to Give way to Aircraft A. Monitor A clearing the conflict area; B then continues when clear.",
    "ground-head-on": "A and B face each other on one taxiway. Stop the conflict early; use an available alternate route or holding area before resuming movement.",
    "ground-arrival-priority": "Keep the runway exit clear for the arriving aircraft A. Hold departing aircraft B away from the exit junction, then reassess the taxi sequence.",
    "ground-three-way": "Three aircraft converge. Hold B and C outside the junction, move A clear, then release the remaining aircraft one at a time after checking their routes.",
    "ground-progressive-taxi": "Give one manageable segment at a time: stand to Alpha, Alpha to Bravo, then Bravo to the runway holding point. Begin with “Expect progressive taxi instructions”. Confirm position before each next instruction. Finish with “Continue taxi at your discretion”.",
};

const crossings: Record<string, {title: string; caption: string; x: number; y: number; angle: number; label: string; available: boolean; path?: string}> = {
    "overview": {title: "Runway crossing traffic picture", caption: "Check traffic along the runway direction in use and at the taxiway crossing. The crossing aircraft waits outside the runway until appropriately authorized.", x: 155, y: 155, angle: 90, label: "Runway traffic →", available: false, path: "M185 155 H225"},
    "departure-before": {title: "Departure before takeoff roll", caption: "The departure is stationary and has not started its takeoff roll. Potential crossing: check all other traffic before issuing a crossing.", x: 135, y: 155, angle: 90, label: "Stationary", available: true},
    "departure-conflict": {title: "Departure rolling toward crossing", caption: "The departure is rolling toward the crossing point. Hold the crossing aircraft.", x: 165, y: 155, angle: 90, label: "Rolling →", available: false, path: "M185 155 H240"},
    "departure-past": {title: "Departure past the crossing", caption: "The departure has passed the crossing point. Potential crossing: check all other traffic before issuing a crossing.", x: 355, y: 155, angle: 90, label: "Past crossing", available: true},
    "departure-turning": {title: "Departure airborne and turning away", caption: "The departure is airborne and turning away from the runway. Potential crossing: check all other traffic before issuing a crossing.", x: 195, y:  60, angle: 0, label: "Airborne · turning", available: true, path: "M125 155 Q195 155 195  80"},
    "arrival-before": {title: "Arrival before the runway threshold", caption: "The arrival has not crossed the runway threshold. Potential crossing: check all other traffic before issuing a crossing.", x: 45, y: 155, angle: 90, label: "Approach", available: true},
    "arrival-exiting": {title: "Arrival taking an exit before crossing", caption: "The arrival is taking an exit before the crossing point. Potential crossing: check all other traffic before issuing a crossing.", x: 165, y: 105, angle: 0, label: "Exiting", available: true, path: "M120 155 Q165 155 165 115"},
    "arrival-past": {title: "Arrival past the crossing", caption: "The arrival has passed the crossing point. Potential crossing: check all other traffic before issuing a crossing.", x: 355, y: 155, angle: 90, label: "Past crossing", available: true},
};


function Plane({x, y, angle = 0, label}: {x: number; y: number; angle?: number; label: string}) {
    return <g><path d="M0 -17 L4 -5 L17 3 L17 7 L4 3 L3 13 L8 17 L8 20 L0 17 L-8 20 L-8 17 L-3 13 L-4 3 L-17 7 L-17 3 L-4 -5 Z" transform={`translate(${x} ${y}) rotate(${angle})`} fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5"/><text x={x} y={y + 39} textAnchor="middle" className={styles.label}>{label}</text></g>;
}

function Hold({x, y}: {x: number; y: number}) {
    return <g><path d={`M${x - 25} ${y}h50 m-50 5h50`} stroke="#fbbf24" strokeWidth="3"/><text x={x + 32} y={y + 8} className={styles.small}>HOLD</text></g>;
}

function Surface({children}: {children: ReactNode}) {
    return <><path d="M35 155H405 M220 40V270" stroke="#334155" strokeWidth="50"/>{children}</>;
}


export default function CourseGroundDiagram({block}: {block: CourseDiagramBlock}) {
    const crossing = block.diagramId === "ground-runway-crossing";
    if (!crossing && !Object.prototype.hasOwnProperty.call(captions, block.diagramId)) return null;
    const scenarioKey = String(block.props?.scenario ?? "departure-before");
    const scenario = crossing ? crossings[Object.prototype.hasOwnProperty.call(crossings, scenarioKey) ? scenarioKey : "departure-before"] : null;
    const title = scenario?.title ?? block.diagramId.replace(/^ground-/, "").replace(/-/g, " ");
    const caption = scenario?.caption ?? captions[block.diagramId];
    let drawing: ReactNode;
    if (scenario) {
        drawing = <>
            <path d="M260 80V280" stroke="#334155" strokeWidth="45"/>
            <path d="M100 155H410" stroke="#475569" strokeWidth="60"/>
            <path d="M105 155H405" stroke="#cbd5e1" strokeDasharray="12 10" strokeWidth="2"/>
            <path d="M105 129V181 M113 129V181" stroke="#f8fafc" strokeWidth="3"/>
            <text x="350" y="185" textAnchor="middle" className={styles.small}>RUNWAY →</text>
            <text x="100" y="220" textAnchor="middle" className={styles.small}>Threshold</text>
            <path d="M260 135V175" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 5"/>
            {scenarioKey === "arrival-exiting" ? <path d="M165 155V75" stroke="#334155" strokeWidth="35"/> : null}
            {scenario.path ? <path d={scenario.path} fill="none" stroke="#7dd3fc" strokeWidth="5" strokeDasharray="8 5"/> : null}
            {scenario.available ? <path d="M260 230V95 m-7 10 7-10 7 10" fill="none" stroke="#6ee7b7" strokeWidth="4" strokeDasharray="7 5"/> : null}
            <text x="320" y="50" textAnchor="middle" className={scenario.available ? styles.available : styles.blocked}>{scenarioKey === "overview" ? "Check the traffic picture" : scenario.available ? "Potential crossing" : "Hold"}</text>
            <text x="335" y="108" textAnchor="middle" className={styles.small}>Crossing point</text><path d="M305 115 L263 135" stroke="#cbd5e1" strokeWidth="1.5"/>
            <Plane x={scenario.x} y={scenario.y} angle={scenario.angle} label={scenario.label}/>
            <text x="327" y="246" className={styles.small}>Taxiway</text>
            <Hold x={260} y={207}/><Plane x={260} y={254} label="Crossing aircraft"/>
        </>;
    } else if (block.diagramId === "ground-movement-flow") {
        drawing = <><path d="M80 245H180V80H365" fill="none" stroke="#334155" strokeWidth="46"/><path d="M80 245H180V80H365" fill="none" stroke="#7dd3fc" strokeWidth="3" strokeDasharray="9 6"/><text x="35" y="305" className={styles.label}>1 · Picture</text><text x="75" y="215" className={styles.label}>2 · Pushback</text><text x="218" y="175" className={styles.label}>3 · Taxi</text><text x="265" y="40" className={styles.label}>4 · Hold / handoff</text><Plane x={90} y={245} angle={90} label="A"/><path d="M320 50V110" stroke="#fbbf24" strokeWidth="4"/></>;
    } else if (block.diagramId === "ground-pushback") {
        drawing = <><path d="M35 190H405 M150 60V190" stroke="#334155" strokeWidth="50"/><rect x="90" y="25" width="120" height="35" rx="4" fill="#475569"/><text x="150" y="48" textAnchor="middle" className={styles.label}>STAND</text><Plane x={150} y={95} label="A · wait"/><Plane x={275} y={190} angle={90} label="B · passing"/><path d="M150 140V165" stroke="#fbbf24" strokeDasharray="5 4" strokeWidth="4"/></>;
    } else if (block.diagramId === "ground-progressive-taxi") {
        drawing = <><path d="M60 245H160V80H330V245" fill="none" stroke="#334155" strokeWidth="48"/><path d="M60 245H160V80H330V210" fill="none" stroke="#7dd3fc" strokeDasharray="8 6" strokeWidth="4"/><text x="35" y="305" className={styles.label}>Stand</text><text x="80" y="160" className={styles.label}>1 · Alpha ↑</text><text x="205" y="45" className={styles.label}>2 · Bravo →</text><text x="350" y="150" className={styles.label}>3 ↓</text><Hold x={330} y={220}/><Plane x={85} y={245} angle={90} label="A"/></>;
    } else if (block.diagramId === "ground-head-on") {
        drawing = <><path d="M35 155H405 M220 155V255H370" fill="none" stroke="#334155" strokeWidth="50"/><Plane x={110} y={155} angle={90} label="A · stop"/><Plane x={330} y={155} angle={270} label="B · stop"/><text x="220" y="90" textAnchor="middle" className={styles.label}>Opposing routes</text><text x="280" y="290" textAnchor="middle" className={styles.small}>Check alternate route</text></>;
    } else {
        const arrival = block.diagramId === "ground-arrival-priority";
        const intersection = block.diagramId === "ground-intersection";
        drawing = <Surface>{arrival ? <><path d="M35 65H405" stroke="#475569" strokeWidth="35"/><text x="45" y="35" className={styles.small}>RUNWAY</text><Plane x={220} y={100} angle={180} label="A · exiting"/></> : <Plane x={110} y={155} angle={90} label="A · first"/>}<Plane x={220} y={250} label={intersection ? "B · Give way to Aircraft A" : "B · hold"}/>{intersection ? <path d="M220 220V185 m-6 8 6-8 6 8" fill="none" stroke="#7dd3fc" strokeWidth="3"/> : <Hold x={220} y={205}/>}{block.diagramId === "ground-three-way" ? <Plane x={345} y={155} angle={270} label="C · hold"/> : null}<text x="270" y="115" className={styles.small}>Junction</text></Surface>;
    }
    return <figure className={styles.figure}><p className={styles.title}>{title}</p><svg className={styles.canvas} viewBox="0 0 440 315" role="img" aria-label={`${title}. ${caption}`}><title>{title}</title><desc>{caption}</desc>{drawing}</svg><figcaption>{caption}{crossing && scenarioKey !== "overview" ? <strong className={styles.caution}>Position alone never authorizes a runway crossing. Hold short until the appropriate clearance is issued and the traffic picture permits it.</strong> : null}<span className={styles.note}>Training schematic · not to scale. Aircraft labels and holding lines identify the sequence.</span></figcaption></figure>;
}
