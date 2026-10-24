"use client";
import {useEffect, useId, useRef, useState} from "react";
import type {AirportInformation, AirportProcedures, AirportWeather, ScopeAirport} from "./airport-display";
import {runwayWindComponents, weatherCategory} from "./airport-display";
import {useAirportDisplay} from "./use-airport-display";
import {magneticHeadingLabel} from "./magnetic-headings";
import {atisRunwayWind} from "./atis-options";
import type {ExerciseWeather, Point, RadarEnvironment} from "./model";
import styles from "./AirportDisplay.module.css";

export function AirportPopup({airports, point, size, weather, origin, environment, onInformation, onProcedures, onClose}: {
  airports: readonly ScopeAirport[]; point: Point; size: {width: number; height: number}; weather: ExerciseWeather; origin: string;
  environment?: RadarEnvironment; onInformation: (airport: ScopeAirport) => void; onProcedures: (airport: ScopeAirport) => void; onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {root.current?.querySelector<HTMLButtonElement>("button")?.focus();}, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {if (event.target instanceof Node && !root.current?.contains(event.target)) onClose();};
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [onClose]);
  const width = Math.min(416, size.width - 16), height = Math.min(size.height - 16, airports.length * 56 + 32);
  return <div ref={root} className={styles.popup} data-airport-panel="popup" role="dialog" aria-label="Nearby airports"
    style={{width, maxHeight: size.height - 16, left: Math.max(8, Math.min(size.width - width - 8, point.x < size.width / 2 ? point.x : point.x - width)), top: Math.max(8, Math.min(size.height - height - 8, point.y))}}>
    {airports.map(airport => <AirportPopupRow key={airport.identifier} airport={airport} weather={airport.identifier === origin ? weather : undefined}
      active={airport.identifier === origin && environment?.facilityActivity?.[`${origin}:tower`] !== false} onInformation={onInformation} onProcedures={onProcedures}/>)}
  </div>;
}
function AirportPopupRow({airport, weather: exerciseWeather, active, onInformation, onProcedures}: {
  airport: ScopeAirport; weather?: ExerciseWeather; active: boolean; onInformation: (airport: ScopeAirport) => void; onProcedures: (airport: ScopeAirport) => void;
}) {
  const report = useAirportDisplay<AirportWeather>(exerciseWeather ? undefined : airport.identifier, "weather");
  const weather = exerciseWeather ?? report.data?.weather, category = weatherCategory(weather);
  return <div className={styles.airportRow}>
    <button type="button" className={styles.airportSummary} title={exerciseWeather ? "Exercise conditions" : undefined} onClick={() => onInformation(airport)} aria-label={`${airport.identifier} airport details`}>
      <span className={styles.airportGlyph} style={{color: airport.isTowered ? "#2D81F9" : "#EF00FC"}} aria-hidden="true">&#xe84a;</span>
      <span><strong>{airport.identifier}{airport.elevationFeet !== undefined ? ` - ${Math.round(airport.elevationFeet)}ft` : ""}</strong>{active ? <em>ATC</em> : null}
        <small className={styles.airportWeather}>{category ? <b data-category={category} className={styles.category}>{category}</b> : null}{weather ? `${weather.variableWind ? "VRB" : weather.windDirection}@${weather.windSpeed}${weather.windGust ? `G${weather.windGust}` : ""}KT - ${Math.floor(weather.visibilityKm / 1.609344)}SM` : airport.name ?? "Airport"}</small></span>
    </button>
    <button type="button" className={styles.procShortcut} onClick={() => onProcedures(airport)} aria-label={`${airport.identifier} display procedures`}>PROC</button>
  </div>;
}

const tabs = ["INFO", "WX", "RWYS", "PROC"] as const;
export default function AirportDetails({airport, origin, exerciseWeather, environment, onClose}: {
  airport: ScopeAirport; origin: string; exerciseWeather: ExerciseWeather; environment?: RadarEnvironment; onClose: () => void;
}) {
  const [tab, setTab] = useState<typeof tabs[number]>("INFO"), [runway, setRunway] = useState("");
  const id = useId(), root = useRef<HTMLElement>(null);
  const info = useAirportDisplay<AirportInformation>(airport.identifier, "info");
  const weather = useAirportDisplay<AirportWeather>(tab === "WX" || tab === "RWYS" && airport.identifier !== origin ? airport.identifier : undefined, "weather");
  const procedures = useAirportDisplay<AirportProcedures>(tab === "PROC" ? airport.identifier : undefined, "procedures", origin);
  useEffect(() => {root.current?.querySelector<HTMLButtonElement>("button")?.focus();}, []);
  const data = info.data, conditions = airport.identifier === origin ? exerciseWeather : weather.data?.weather;
  return <section ref={root} className={styles.details} data-airport-panel="details" role="dialog" aria-label={`${airport.identifier} airport information`}>
    <header><span><strong>INFORMATION</strong><small>{airport.identifier}</small></span><button type="button" aria-label="Close airport details" onClick={onClose}>CLOSE</button></header>
    <div role="tablist" aria-label="Airport details tabs" className={styles.tabs}>{tabs.map((name, index) => <button type="button" key={name} role="tab" id={`${id}-${name}`} aria-controls={`${id}-panel`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next >= 0) {event.preventDefault(); setTab(tabs[next]); root.current?.querySelector<HTMLButtonElement>(`[id="${id}-${tabs[next]}"]`)?.focus();}
    }}>{name}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className={styles.content} tabIndex={0}>
      {info.error ? <p role="status">{info.error} <button type="button" onClick={info.retry}>Retry airport details</button></p> : !data ? <p role="status">Loading airport details…</p> : null}
      {tab === "INFO" ? <>
        <h2>AIRPORT INFO</h2><div className={styles.airportInfo}>
          <span>{airport.identifier}</span><h3>{data?.name ?? airport.name ?? airport.identifier}</h3>
          {data?.city ? <p>{data.city}{data.state ? `, ${data.state}` : ""}</p> : null}
          <p className={styles.airportMetadata}>{(data?.elevationFeet ?? airport.elevationFeet) !== undefined ? `${Math.round((data?.elevationFeet ?? airport.elevationFeet)!)}ft` : "Elevation unavailable"}
            {data?.airportClass ? <><br/>Class {data.airportClass}</> : null}</p>
          {data?.contributors ? <p className={styles.airportMetadata}>Contributors:<br/>{data.contributors}</p> : null}
        </div>
        <h2>FREQUENCIES</h2>{data?.frequencies.length ? data.frequencies.map(frequency => <div key={frequency.id} className={styles.frequency}>
          <span>{frequency.type.charAt(0).toUpperCase() + frequency.type.slice(1)}</span><span>{environment?.facilityActivity?.[frequency.id] === false ? "Inactive" : "Training"} at {airport.identifier}<br/>{frequency.mhz}MHz</span>
        </div>) : <p>Frequency information unavailable.</p>}
        <details className={styles.sources}><summary>Sources and training limits</summary><p>Training references; live Infinite Flight controller occupancy is unavailable.</p><a href="/sweatbox/about" target="_blank" rel="noreferrer">About the training data</a></details>
      </> : null}
      {tab === "WX" ? <>
        {weather.error ? <p role="status">{weather.error} <button type="button" onClick={weather.retry}>Retry weather</button></p> : !weather.data ? <p role="status">Loading public weather…</p> : null}
        <h2>METAR</h2><div className={styles.metarStatus}><b className={styles.category} data-category={weatherCategory(weather.data?.weather)}>{weatherCategory(weather.data?.weather) ?? "N/A"}</b><small>{weather.data?.weather?.observedAt ? new Date(weather.data.weather.observedAt).toUTCString() : ""}</small></div><p className={styles.weatherText}>{weather.data?.weather?.rawMetar ?? "N/A"}</p>
        <h2>TAF</h2><p className={styles.weatherText}>{weather.data?.taf ?? "N/A"}</p>
        <h2>D-ATIS</h2>{weather.data?.atis.length ? weather.data.atis.map((broadcast, index) => <p key={index} className={styles.weatherText}>{broadcast.datis}</p>) : <p>N/A</p>}
        <details className={styles.sources}><summary>Sources and exercise conditions</summary>
          {airport.identifier === origin ? <p>{exerciseWeather.rawMetar ?? `Wind ${exerciseWeather.variableWind ? "VRB" : exerciseWeather.windDirection} at ${exerciseWeather.windSpeed}KT · Visibility ${exerciseWeather.visibilityKm}km · QNH ${exerciseWeather.qnh}`}<small>{exerciseWeather.reference}</small></p> : null}
          <p>Public reports are for inspection. Exercise conditions and the published training ATIS are unchanged.</p>
          <a href="https://aviationweather.gov/data/api/" target="_blank" rel="noreferrer">METAR / TAF source</a> · <a href={`https://atis.info/${airport.identifier}`} target="_blank" rel="noreferrer">D-ATIS source</a>
        </details>
      </> : null}
      {tab === "RWYS" ? <><h2>RUNWAYS</h2>{data?.runways.length ? [...data.runways].sort((a, b) => a.heading - b.heading).map(end => {
        const wind = conditions && !conditions.variableWind ? runwayWindComponents(end.heading, conditions) : undefined;
        const windClass = conditions && !conditions.variableWind ? styles[atisRunwayWind(end.heading, conditions)] : undefined;
        let heading: string; try {heading = `${magneticHeadingLabel(end.heading, {icao: airport.identifier})}°M`;} catch {heading = `${Math.round(end.heading) || 360}°T`;}
        return <button type="button" key={end.id} aria-pressed={runway === end.id} aria-label={`Runway ${end.id}`} className={styles.runway} onClick={() => setRunway(end.id)}><strong className={windClass}>{end.id}</strong><span className={styles.runwayDetails}>
          <span className={styles.runwayTop}>{heading} {end.ils ? <b>ILS{end.ils.identifier ? ` ${end.ils.identifier}` : ""}{end.ils.mhz ? ` (${end.ils.mhz})` : ""}</b> : null}</span>
          <span className={styles.runwayBottom}><span>{end.surface?.toUpperCase()}{end.surface ? "  " : ""}{Math.round(end.lengthFeet)}{end.widthFeet !== undefined ? ` x ${Math.round(end.widthFeet)}` : ""}ft</span>
          {wind ? <span className={styles.windSummary}><span className={wind.crosswind > 15 ? styles.crosswind : styles.crossComponent}><i aria-hidden="true">{conditions && Math.sin((conditions.windDirection - end.heading) * Math.PI / 180) < 0 ? "\ue839" : "\ue838"}</i>{wind.crosswind}KT</span><span className={wind.headwind < 0 ? styles.tailwind : styles.headwind}><i aria-hidden="true">{wind.headwind < 0 ? "\ue83a" : "\ue837"}</i>{Math.abs(wind.headwind)}KT</span></span> : <small>{conditions?.variableWind ? "VRB" : ""}</small>}</span>
          </span></button>;
      }) : <p>Runway details unavailable.</p>}</> : null}
      {tab === "PROC" ? <><h2>PROCEDURES</h2><div className={styles.procedureActions}>{["Select Departure", "Select Arrival", "Select Approach"].map(label => <button type="button" disabled key={label}>{label}</button>)}</div>
        {procedures.error ? <p role="status">{procedures.error} <button type="button" onClick={procedures.retry}>Retry procedures</button></p> : !procedures.data ? <p role="status">Loading Procedures. Please wait.</p> : null}
      </> : null}
      {data?.warnings.map(message => <p className={styles.note} key={message}>{message}</p>)}
      {data?.warnings.length ? <button type="button" onClick={info.retry}>Retry airport details</button> : null}
    </div>
  </section>;
}
