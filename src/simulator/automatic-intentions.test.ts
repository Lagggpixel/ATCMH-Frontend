import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {AIRPORT, advance, applyEnvelope, autoReadbacks, distance, initialExercise, newAircraft, predictAircraft, runwayGeometry} from "./engine";
import {instructionText, messageMenu, pilotRequestText, requestMessageMenu, resolvePilotRequest} from "./catalog";
import {GROUND} from "./ground-movement";
import {intentionsOf, type Action, type Aircraft, type Exercise, type Instruction} from "./model";
import {exerciseSchema, envelopeSchema, menteeActionAllowed} from "./protocol";
import {planParkingRoute, planTaxiRoute} from "./taxi-routing";
import {standPlacement, createScenarioExercise, scenarioFromExercise, scenarioSchema} from "./scenarios";
import {advanceScenario, executeScenarioEvent} from "./scenario-engine";

const stateOf = (aircraft: Aircraft[], automatic = true): Exercise => ({...initialExercise(), aircraft, running: true, autoReadback: automatic});
const taxi = (id: string, x: number, y: number, heading: number, path: Aircraft["taxiPath"]): Aircraft => ({...newAircraft(id, false), position: {x, y}, heading, targetHeading: heading, taxiPath: path, taxiIndex: 0, mode: "taxi", speed: 10, targetSpeed: 15});
function act(state: Exercise, action: Action) {const result = applyEnvelope(state, envelopeSchema.parse({id: randomUUID(), time: 1000, action})); assert.equal(result.error, undefined); return result.state;}
const assign = (state: Exercise, command: Instruction) => act(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command});
const tick = (state: Exercise, seconds = 1) => autoReadbacks(advance(state, seconds), 1000, randomUUID);

test("crossing taxi traffic has deterministic priority, preserves physical clearance, and both proceed", () => {
  const a = taxi("a", -.06, 0, 90, [{x: .16, y: 0}]), b = taxi("b", 0, -.06, 0, [{x: 0, y: .16}]);
  let first = stateOf([a, b]), reversed = stateOf([structuredClone(b), structuredClone(a)]);
  for (let i = 0; i < 3000; i++) {
    const prediction = predictAircraft(first.aircraft, .05);
    first = advance(first, .05); reversed = advance(reversed, .05);
    assert.deepEqual(first.aircraft[0].position, reversed.aircraft[1].position);
    assert.deepEqual(first.aircraft[0].position, prediction[0].position);
    assert.ok(distance(first.aircraft[0].position, first.aircraft[1].position) >= GROUND.corridor - 1e-6);
  }
  assert.ok(first.aircraft[0].position.x > .14); assert.ok(first.aircraft[1].position.y > .14);
});

test("mapped EGPH S/G apron traffic progresses to the runway queue instead of mutually blocking", () => {
  const positions = [{x: .79429, y: -.08092}, {x: .75818, y: -.15583}];
  const aircraft = positions.map((position, i) => {
    const route = planTaxiRoute(AIRPORT, position, "24"); assert.ok(route.path, route.error);
    const next = route.path.find(p => distance(p, position) > .002)!;
    const heading = (Math.atan2(next.x - position.x, next.y - position.y) * 180 / Math.PI + 360) % 360;
    return taxi(i ? "united-4" : "easy-21", position.x, position.y, heading, route.path);
  });
  let state = stateOf(aircraft, false);
  for (let i = 0; i < 700; i++) state = advance(state, 1);
  assert.ok(state.aircraft.some(a => a.mode === "parked" && a.taxiIndex >= a.taxiPath.length && distance(a.position, a.taxiPath.at(-1)!) < 1e-7), "one aircraft stops at the departure entry without an active Hold instruction");
  for (const [index, a] of state.aircraft.entries()) assert.ok(distance(a.position, positions[index]) > .2, a.id);
});

test("Give way overrides junction priority, resumes after traffic clears, and preserves Hold Position", () => {
  const a = taxi("a", -.07, 0, 90, [{x: .15, y: 0}]), b = taxi("b", 0, -.07, 0, [{x: 0, y: .15}]);
  a.taxiPath.unshift({...a.position}); a.taxiIndex = 1;
  let state = stateOf([a, b]);
  const command: Instruction = {type: "give-way", aircraftId: b.id, description: "United 4 on your left"};
  assert.ok(menteeActionAllowed({kind: "command", aircraftId: a.id, command, frequency: "ground", text: ""}));
  state = assign(state, command);
  for (let i = 0; i < 240; i++) state = advance(state, .05);
  assert.ok(state.aircraft[1].position.y > state.aircraft[0].position.x);
  state = assign(state, {type: "stop"});
  for (let i = 0; i < 600; i++) state = advance(state, .05);
  assert.equal(state.aircraft[0].holding, true); assert.equal(state.aircraft[0].giveWay, undefined);
  state = assign(state, {type: "taxi"});
  for (let i = 0; i < 1500; i++) state = advance(state, .05);
  assert.ok(state.aircraft[0].position.x > .14);
  const menu = messageMenu("ground", a, [a, b]).find(m => m.label === "Give way to...")!;
  assert.deepEqual(menu.children![2].instruction, {type: "give-way", aircraftId: b.id, description: "aircraft on your right"});
  assert.equal(menu.children![0].children?.[0].instruction?.type, "give-way");
  assert.equal(menu.children![0].children?.[0].children, undefined);
  assert.equal(messageMenu("ground", a, [a]).find(m => m.label === "Give way to...")?.children?.[1].children, undefined);
});

test("Give way wording still sends when no traffic can be identified", () => {
  const aircraft = taxi("a", 0, 0, 90, [{x: .1, y: 0}]);
  const command: Instruction = {type: "give-way", description: "aircraft ahead"};
  const state = act(stateOf([aircraft], false), {kind: "command", aircraftId: aircraft.id, frequency: "ground", command, text: instructionText(aircraft, command)});
  assert.equal(state.messages.at(-1)?.text, `${aircraft.callsign}, give way to aircraft ahead`);
  assert.equal(state.aircraft[0].giveWay, undefined);
});

test("parking requests use mapped, unoccupied stand destinations and do not grant clearance", () => {
  const stand = AIRPORT.features.find(f => f.kind === "parking_position" && f.points.length > 1)!;
  const placed = {...newAircraft("a", false), ...standPlacement(stand.id)!};
  const push = assign(stateOf([placed]), {type: "pushback", tail: "north"});
  let state = push; for (let i = 0; i < 500 && state.aircraft[0].mode === "pushback"; i++) state = advance(state, 1);
  const a = state.aircraft[0], route = planParkingRoute(AIRPORT, a.position, stand.id);
  assert.ok(route.path, route.error); assert.ok(distance(route.path.at(-1)!, stand.points.at(-1)!) < 1e-6);
  assert.ok(planParkingRoute(AIRPORT, a.position, stand.id, [stand.points.at(-1)!]).error);
  state = act(state, {kind: "pilot", aircraftId: a.id, text: "", request: {id: "taxi-parking", runway: "24"}});
  assert.equal(state.messages.at(-1)!.text, `${a.callsign}, requesting taxi to parking`); assert.equal(state.aircraft[0].mode, "parked");
  state = act(state, {kind: "edit", aircraftId: a.id, patch: {intentions: {...intentionsOf(a), parkingStand: stand.id}}});
  state = assign(state, {type: "taxi", destination: "parking"});
  for (let i = 0; i < 400 && state.aircraft[0].mode !== "parked"; i++) state = advance(state, 1);
  assert.equal(state.aircraft[0].mode, "parked"); assert.ok(distance(state.aircraft[0].position, stand.points.at(-1)!) < 1e-6);
});

test("pushback completion requests taxi once with the latest published ATIS, only in Automatic", () => {
  for (const automatic of [false, true]) {
    const a = {...newAircraft("a", false), mode: "pushback" as const, pushback: {path: [{x: .5, y: -.25}], index: 1}};
    let state = stateOf([a], automatic); state.publishedDraft = {...state.atis, letter: "BRAVO"};
    state = tick(state); state = tick(state);
    assert.equal(state.messages.length, automatic ? 1 : 0);
    if (automatic) assert.match(state.messages[0].text, /ready to taxi to runway 24 with information BRAVO/);
  }
});

test("Tower when ready waits for an assigned departure hold and requests the actual taxi runway once", () => {
  const stand = AIRPORT.features.find(f => f.kind === "parking_position" && f.points.length > 1)!;
  const a = {...newAircraft("a", false), ...standPlacement(stand.id)!};
  let state = assign(stateOf([a]), {type: "taxi", runway: "06", contactTowerWhenReady: true});
  assert.equal(state.aircraft[0].frequency, "ground");
  const hold = state.aircraft[0].taxiPath.at(-1)!;
  Object.assign(state.aircraft[0], {position: {...hold}, taxiIndex: state.aircraft[0].taxiPath.length, mode: "parked", holding: false, speed: 0});
  const off = tick({...structuredClone(state), autoReadback: false}); assert.equal(off.aircraft[0].frequency, "ground"); assert.equal(off.messages.length, 0);
  const prediction = predictAircraft(state.aircraft, 1); assert.equal(prediction[0].frequency, "ground");
  state = tick(state); state = tick(state);
  assert.equal(state.aircraft[0].frequency, "tower"); assert.equal(state.messages.length, 1);
  assert.match(state.messages[0].text, /ready for departure at runway 06, remaining in the pattern/);
});

test("transition has live position wording and a first green shortcut sharing the original altitude menu", () => {
  const a = {...newAircraft("a", true), callsign: "Easy 201", position: {x: Math.sqrt(12.5), y: Math.sqrt(12.5)}, altitude: 1500};
  const request = resolvePilotRequest({requestId: "transition"})!;
  assert.equal(pilotRequestText(a, request, "24"), "Easy 201 is 5 miles to the north east of Edinburgh at 1500 feet, requesting transition");
  let state = act(stateOf([a]), {kind: "pilot", aircraftId: a.id, text: "", request: {id: "transition", runway: "24"}});
  const menu = requestMessageMenu("tower", a, state.messages[0]);
  assert.equal(menu.find(e=>e.suggested)?.label, "Respond to Transition"); assert.equal(menu.find(e=>e.suggested)?.suggested, true);
  assert.deepEqual(menu.find(e=>e.suggested)?.children, menu.find(m => m.label === "Respond to Transition")!.children);
  assert.deepEqual(menu.find(e=>e.suggested)?.children!.flatMap(m => m.children ?? []).map(m => m.label), [...Array.from({length: 18}, (_, i) => `${(1000+i*500).toLocaleString("en-US")}ft`), ...Array.from({length: 8}, (_, i) => `${(10000+i*1000).toLocaleString("en-US")}ft`), ...Array.from({length: 43}, (_, i) => `FL${180 + i * 10}`)]);
  state = act(state, {kind: "command", aircraftId: a.id, frequency: "tower", text: instructionText(a, {type: "transition", altitude: 1500}), command: {type: "transition", altitude: 1500}, replyTo: state.messages[0].id});
  state = tick(state, 1.5); assert.equal(state.aircraft[0].mode, "heading"); assert.match(state.messages.at(-1)!.text, /Transition approved at 1500 feet, Easy 201/);
});

test("overhead transition intent requests the option once without entering the pattern or granting landing", () => {
  let state = stateOf([{...newAircraft("a", true), position: {x: .2, y: .2}, intentions: {flight: "pattern", taxi: "runway", afterTransition: "touch-and-go", overheadRadius: 1}}]);
  state = assign(state, {type: "transition", altitude: 1500});
  const off = tick({...structuredClone(state), autoReadback: false}); assert.equal(off.messages.length, 0);
  state = tick(state); state = tick(state);
  assert.equal(state.messages.length, 1); assert.equal(state.messages[0].request?.id, "inbound-option");
  assert.equal(state.aircraft[0].mode, "heading"); assert.equal(state.aircraft[0].clearedToLand, false);
  assert.ok(!requestMessageMenu("tower", state.aircraft[0], state.messages[0]).some(m => m.suggested));
  assert.equal(exerciseSchema.safeParse(state).success, true);
});

test("scenario transition request preserves intentions and uses execution position", () => {
  const a = {...newAircraft("a", true), mode: "heading" as const, intentions: {flight: "departure" as const, taxi: "runway" as const, afterTransition: "touch-and-go" as const}};
  const definition = scenarioFromExercise(stateOf([a]), "Transition");
  definition.events = [{id: "transition", title: "Request transition", trigger: {type: "manual"}, actions: [{type: "request", aircraftKey: "aircraft-1", requestId: "transition", runway: "24"}]}];
  const {exercise, runtime} = createScenarioExercise(scenarioSchema.parse(definition), "test", randomUUID());
  const state = executeScenarioEvent(exercise, runtime, "transition", 1000);
  assert.equal(runtime.events.transition.status, "completed"); assert.match(state.messages[0].text, /requesting transition/);
  assert.equal(intentionsOf(state.aircraft[0]).afterTransition, "touch-and-go");
});

test("departure intention leaves the circuit; explicit traffic and touch-and-go override it", () => {
  for (const pattern of [false, true]) {
    const g = runwayGeometry();
    const a = {...newAircraft("a", false), mode: "takeoff" as const, position: {...g.departure}, speed: 160, targetSpeed: 220, altitude: AIRPORT.elevation + 299, takeoffPattern: pattern};
    const state = advance(stateOf([a]), 1);
    assert.equal(state.aircraft[0].mode, pattern ? "pattern" : "heading");
    assert.equal(state.aircraft[0].leavingCircuit, !pattern);
  }
});

test("full-stop automatic handoff requests parking after Contact Ground; manual mode emits nothing", () => {
  for (const automatic of [false, true]) for (const explicitExit of [false, true]) {
    const g = runwayGeometry();
    let state = stateOf([{...newAircraft("a", true), mode: "rollout", landing: "full-stop", speed: 70, altitude: AIRPORT.elevation, position: {...g.threshold}}], automatic);
    if (explicitExit) state = assign(state, {type: "exit-runway", side: "any"});
    for (let i = 0; i < 300; i++) state = tick(state);
    assert.equal(state.messages.length, automatic ? 1 : 0);
    assert.equal(state.aircraft[0].frequency, automatic && explicitExit ? "ground" : "tower");
    if (automatic && !explicitExit) {
      assert.equal(state.messages[0].request?.id, "frequency-change");
      state = act(state, {kind: "command", aircraftId: "a", frequency: "tower", command: {type: "frequency", frequency: "ground"}, text: instructionText(state.aircraft[0], {type: "frequency", frequency: "ground"})});
      state = tick(state, 1.5); state = tick(state); state = tick(state);
      assert.equal(state.aircraft[0].frequency, "ground");
      assert.equal(state.messages.filter(m => m.request?.id === "taxi-parking").length, 1);
    }
    assert.equal(intentionsOf(state.aircraft[0]).taxi, "parking");
  }
});

test("head-on traffic without an alternate remains safely separated and Give way cycles are rejected", () => {
  let state = stateOf([taxi("a", -.06, 0, 90, [{x: .2, y: 0}]), taxi("b", .06, 0, 270, [{x: -.2, y: 0}])]);
  state = assign(state, {type: "give-way", aircraftId: "b", description: "United 4 ahead"});
  const cycle = applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "maneuver", aircraftId: "b", command: {type: "give-way", aircraftId: "a", description: "Easy 21 ahead"}}});
  assert.match(cycle.error!, /circular/);
  for (let i = 0; i < 40; i++) state = advance(state, 1);
  assert.ok(distance(state.aircraft[0].position, state.aircraft[1].position) >= GROUND.spacing - 1e-7);
});

test("scenario overhead conditions respect Automatic and fire once without duplicate intention requests", () => {
  const a = {...newAircraft("a", true), mode: "heading" as const, position: {x: 0, y: .2}, intentions: {flight: "pattern" as const, taxi: "runway" as const, afterTransition: "touch-and-go" as const}};
  const definition = scenarioFromExercise(stateOf([a]), "Overhead");
  definition.events = [{id: "overhead", title: "Overhead touch and go", trigger: {type: "condition", condition: {type: "overhead", aircraftKey: "aircraft-1", radius: 1}, delay: 0}, actions: [{type: "request", aircraftKey: "aircraft-1", requestId: "inbound-option", runway: "24"}]}];
  const {exercise, runtime} = createScenarioExercise(scenarioSchema.parse(definition), "test", randomUUID());
  let state = assign({...exercise, running: true, autoReadback: false}, {type: "transition", altitude: 1500});
  state = advanceScenario(state, runtime, .1, 1000).exercise;
  assert.equal(state.messages.length, 0); assert.equal(runtime.events.overhead.status, "scheduled");
  state.autoReadback = true;
  state = autoReadbacks(advanceScenario(state, runtime, .1, 1000).exercise, 1000, randomUUID);
  state = autoReadbacks(advanceScenario(state, runtime, .1, 1000).exercise, 1000, randomUUID);
  assert.equal(state.messages.length, 1); assert.equal(runtime.events.overhead.status, "completed");
  assert.equal(state.aircraft[0].clearedToLand, false);
});
