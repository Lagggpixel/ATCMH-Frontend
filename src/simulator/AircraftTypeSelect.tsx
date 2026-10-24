import {AIRCRAFT_CATALOG} from "./aircraft-catalog";

export default function AircraftTypeSelect({value, onChange}: {value: string; onChange: (type: string) => void}) {
  return <select aria-label="Aircraft type" value={value} onChange={event => onChange(event.target.value)}>
    {!AIRCRAFT_CATALOG.some(a => a.id === value) ? <option value={value}>{value || "Select aircraft"}{value ? " (saved type)" : ""}</option> : null}
    {AIRCRAFT_CATALOG.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>;
}
