"use client";
import type {ReactNode} from "react";
import {aircraftSummary, flightPlanText, procedureLines, simulatedPilot, tunedFrequency} from "./aircraft-information";
import type {Aircraft, Airport} from "./model";
import styles from "./AircraftInformation.module.css";

function Section({title, children}: {title: string; children: ReactNode}) {
  return <section className={styles.section} aria-label={title}><h3>{title}</h3><div className={styles.lines}>{children}</div></section>;
}

/** Infinite Flight 26.4 Information panel: Summary, User, Flight Plan and Procedures under one Aircraft tab. */
export default function AircraftInformation({airport, aircraft: a, className, onClose}: {airport: Airport; aircraft: Aircraft; className: string; onClose: () => void}) {
  const summary = aircraftSummary(a, airport), pilot = simulatedPilot(a), frequency = tunedFrequency(a, airport);
  const route = flightPlanText(a.flightPlan), procedures = procedureLines(a.flightPlan);
  return <section className={`${className} ${styles.panel}`} role="dialog" aria-label={`Information ${a.callsign}`}>
    <div className={styles.head}><div className={styles.top}>
      <div className={styles.title}><strong>INFORMATION</strong><span>{a.callsign}</span></div>
      <button type="button" className={styles.close} onClick={onClose}>CLOSE</button>
    </div>
    <div className={styles.tabs} role="tablist"><span role="tab" aria-selected="true">AIRCRAFT</span></div></div>
    <Section title="SUMMARY"><p>{a.callsign}</p><p>{a.type}</p><p>{summary.position}</p><p>{summary.speeds}</p></Section>
    <Section title="USER">
      <ul>
        <li>Username: {pilot.username}</li>
        <li>Virtual Organization: {pilot.organization}</li>
        <li>Identifier: {pilot.identifier}</li>
        <li>XP: {pilot.xp.toLocaleString("en-US")}</li>
        <li>Grade {pilot.grade}</li>
        <li>Flight Time: {pilot.flightTime}</li>
        <li>Landings: {pilot.landings}</li>
        <li>Violations: {pilot.violations}</li>
        <li>Online Flights: {pilot.onlineFlights}</li>
      </ul>
      <p>Tuned Frequencies:</p>
      {frequency ? <p>{frequency}</p> : null}
    </Section>
    <Section title="FLIGHT PLAN"><p className={styles.mono}>{route || "No Flight Plan Filed"}</p></Section>
    {procedures.length ? <Section title="PROCEDURES">{procedures.map((line, index) => <p key={index} className={`${styles.mono} ${styles.procedure}`}>{line}</p>)}</Section> : null}
  </section>;
}
