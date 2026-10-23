import assert from "node:assert/strict";
import test from "node:test";
import {airportList, getAirport, runwayEnds} from "./airports";
import {catalogFor, type MenuEntry} from "./catalog";
import {applyEnvelope, engineFor} from "./engine";
import {stripRunway, type Action, type Exercise, type Instruction} from "./model";

const find = (entries: MenuEntry[], ...labels: string[]): MenuEntry => {
  const entry = entries.find(item => item.label === labels[0]);
  assert.ok(entry, `Missing ${labels[0]}`);
  return labels.length > 1 ? find(entry.children ?? [], ...labels.slice(1)) : entry;
};
let serial = 0;
function act(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: `ordering-${++serial}`, time: serial, action});
  assert.equal(result.error, undefined); return result.state;
}

test("strip runway leads operational menus at every airport while pattern and taxi choices keep their order", () => {
  for (const airport of airportList) {
    const engine = engineFor({airport: airport.icao}), menu = catalogFor(airport).messageMenu;
    const ids = runwayEnds(airport).slice().sort((l,r)=>Math.abs((l.heading-240+540)%360-180)-Math.abs((r.heading-240+540)%360-180)).map(end => end.id), before = JSON.stringify(airport);
    for (const runway of ids) {
      const ground = {...engine.newAircraft("ground", false), runway};
      const check = (entries: MenuEntry[], normal = ids) => {
        const runways = entries.map(e => e.label.replace(/^Runway /, "")).filter(id => ids.includes(id));
        assert.deepEqual(runways, [runway, ...normal.filter(id => id !== runway)], `${airport.icao}/${runway}`);
      };
      const groundMenu = menu("ground", ground), towerMenu = menu("tower", ground);
      check(find(groundMenu, "Cross Runway...").children!);
      check(find(groundMenu, "Progressive Taxi", "Cross Runway").children!);
      check(find(groundMenu, "Hold short...").children!);
      check(find(towerMenu, "Cross Runway...").children!);
      check(find(towerMenu, "Hold Short").children!);
      check(find(towerMenu, "Departure Sequencing...", "Hold short").children!);
      check(find(towerMenu, "Cleared for Takeoff").children!);
      check(find(towerMenu, "Line up and Wait").children!);
      assert.deepEqual(find(groundMenu, "Taxi to...").children!.filter(e => e.label.startsWith("Runway ")).map(e => e.label), ids.map(id => `Runway ${id}`));
      const airMenu = menu("tower", {...engine.newAircraft("air", true), runway});
      for (const number of [1, 2, 8]) for (const clearance of ["Cleared to Land", "Cleared for the Option"]) check(find(airMenu, "Cleared to Land / for the Option", `Number ${number}`, clearance).children!);
      for (const entry of ["Enter Right Downwind", "Enter Left Downwind", "Enter Right Base", "Enter Left Base", "Enter Straight In"]) assert.deepEqual(find(airMenu, "Pattern Instructions", entry).children!.map(e => e.label), ids.map(id => `Runway ${id}`));
    }
    const unassigned = {...engine.newAircraft("none", false), runway: null, lastRunway: null};
    assert.deepEqual(find(menu("tower", unassigned), "Line up and Wait").children!.map(e => e.label), ids.map(id => `Runway ${id}`));
    unassigned.lastRunway = ids.at(-1)!;
    assert.equal(find(menu("tower", unassigned), "Line up and Wait").children![0].label, `Runway ${unassigned.lastRunway}`);
    assert.equal(JSON.stringify(airport), before, "menu ordering cannot mutate the airport snapshot");
  }
});

test("all runway-assignment instructions feed menu ordering; pending, crossing and hold-short commands do not replace it", () => {
  const engine = engineFor({airport: "EGPH"}), menu = catalogFor(getAirport(engine.initialExercise())).messageMenu;
  const sources: Instruction[] = [{type: "taxi", runway: "06"}, {type: "lineup", runway: "06"}, {type: "takeoff", runway: "06"}, {type: "pattern", leg: "downwind", runway: "06"}, {type: "land", runway: "06"}, {type: "land", runway: "06", option: true}, {type: "runway", runway: "06"}];
  for (const command of sources) {
    let state = engine.initialExercise();
    const aircraft = state.aircraft[["pattern", "land"].includes(command.type) ? 0 : 1];
    if (command.type === "lineup" || command.type === "takeoff") aircraft.position = engine.runwayGeometry("06").threshold;
    state = act(state, {kind: "maneuver", aircraftId: aircraft.id, command});
    const assigned = state.aircraft.find(a => a.id === aircraft.id)!;
    assert.equal(stripRunway(assigned), "06");
    if (assigned.mode === "pattern") assert.equal(find(menu("tower", assigned), "Cleared to Land / for the Option", "Number 2", "Cleared to Land").children![0].label, "Runway 06");
    else assert.equal(find(menu("ground", assigned), "Cross Runway...").children![0].label, "Runway 06");
  }
  let state = engine.initialExercise(); const id = state.aircraft[1].id;
  state = act(state, {kind: "command", aircraftId: id, frequency: "ground", text: "Taxi to runway 06", command: {type: "taxi", runway: "06"}});
  assert.equal(find(menu("ground", state.aircraft[1]), "Cross Runway...").children![0].label, "Runway 06");
  state = act(state, {kind: "pilot", aircraftId: id, replyTo: state.messages.at(-1)!.id, text: "Taxi to runway 06", assign: true});
  for (const type of ["cross", "hold-short"] as const) {
    const copy = structuredClone(state), a = copy.aircraft[1];
    Object.assign(a, {mode: "taxi", holding: true, taxiIndex: 0, taxiPath: [{...a.position, runway: "24", hold: true}, {x: a.position.x + .1, y: a.position.y}]});
    const next = act(copy, {kind: "maneuver", aircraftId: id, command: {type, runway: "24"}});
    assert.equal(stripRunway(next.aircraft[1]), "06");
    assert.equal(find(menu("ground", next.aircraft[1]), "Cross Runway...").children![0].label, "Runway 06");
  }
});

test("Approach and Center put assigned approach type and runway first without changing environment order", () => {
  for (const airportId of ["EGPH", "KDAL"]) for (const frequency of ["approach", "center"] as const) {
    const engine = engineFor({airport: airportId, trainingStation: `${airportId}:${frequency}`});
    let state = engine.initialExercise(); const id = state.aircraft[0].id;
    const environment = state.radarEnvironment!, before = JSON.stringify(environment), menu = () => catalogFor(getAirport(state), state.radarEnvironment).messageMenu(frequency, state.aircraft[0]);
    const labels = {ils: "ILS Approach", gps: "GPS Approach", visual: "Visual Approach"};
    for (const type of ["gps", "visual", "ils"] as const) {
      const approach = environment.approaches.filter(p => p.type === type).at(-1)!;
      state.aircraft[0].runway = environment.approaches.find(p => p.runway !== approach.runway)!.runway;
      state = act(state, {kind: "maneuver", aircraftId: id, command: {type: "expect-approach", approachId: approach.id}});
      const types = find(menu(), "Expect Approach...").children!;
      assert.equal(types[0].label, labels[type]);
      assert.deepEqual(types.slice(3).map(e => e.label), ["Radar Vectors", "Unable (Outside of Coverage Area)", "Unable at this time", "Outside Airspace"]);
      for (const choice of ["ils", "gps", "visual"] as const) {
        const entries = find(types, labels[choice]).children!, normal = environment.approaches.filter(p => p.type === choice);
        const expected = [...normal.filter(p => p.runway === approach.runway), ...normal.filter(p => p.runway !== approach.runway)].map(p => p.id);
        assert.deepEqual(entries.map(e => e.children?.[0].instruction?.type === "expect-approach" ? e.children[0].instruction.approachId : null), expected);
      }
      assert.equal(JSON.stringify(state.radarEnvironment), before);
    }
    state = act(state, {kind: "maneuver", aircraftId: id, command: {type: "expect-approach", approachId: null, vectors: true}});
    state.aircraft[0].radar!.requestedApproach = environment.approaches.find(p => p.type === "gps")!.id;
    assert.deepEqual(find(menu(), "Expect Approach...").children!.slice(0, 3).map(e => e.label), ["ILS Approach", "GPS Approach", "Visual Approach"]);
    const runway = environment.approaches.at(-1)!.runway; state.aircraft[0].runway = runway;
    for (const label of Object.values(labels)) assert.equal(find(menu(), "Expect Approach...", label).children![0].label, `Runway ${runway}`);
    state.aircraft[0].runway = null; state.aircraft[0].lastRunway = null;
    for (const type of ["ils", "gps", "visual"] as const) assert.deepEqual(find(menu(), "Expect Approach...", labels[type]).children!.map(e => e.label), environment.approaches.filter(p => p.type === type).map(p => `Runway ${p.runway}`));
  }
});
