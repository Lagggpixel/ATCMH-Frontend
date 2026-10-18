import assert from "node:assert/strict";
import test from "node:test";
import {initialExercise, newAircraft, applyEnvelope} from "./engine";
import {catalogFor, type MenuEntry} from "./catalog";
import {getAirport} from "./airports";
import type {Instruction} from "./model";
import {prepareQuickCommand, quickCommandAction, quickCommandName, QuickCommandManager, visibleQuickCommands} from "./quick-commands";

const exercise = initialExercise(), a = exercise.aircraft[0];
const name = (command: Instruction, path?: string[]) => quickCommandName(command, exercise, a, path);

test("quick names preserve surface options, collisions, newlines and takeoff spacing", () => {
  const cases: [Instruction, string | null][] = [
    [{type: "taxi", runway: "24"}, "Taxi 24"], [{type: "taxi", destination: "parking"}, "Taxi Parking"], [{type: "taxi"}, "Cont. Taxi"],
    [{type: "cross", runway: "24", expedite: true}, "Cross Runway\n24"], [{type: "stop"}, "Hold Position"],
    [{type: "hold-short", runway: "06"}, "Hold Short 06"], [{type: "hold-short", departure: true}, null],
    [{type: "pushback", tail: "west"}, "Pushback"], [{type: "pushback", runway: "06", tail: "west"}, "Pushback 06 West"],
    [{type: "lineup", runway: "24"}, "Line up 24"], [{type: "takeoff", runway: "24"}, "Clr  T/O  Runway 24"],
    [{type: "takeoff", runway: "24", immediate: true, hand: "left"}, "Clr imm.  T/O , make left traffic Runway 24"],
    [{type: "takeoff", runway: "06", straightOut: 4000, unablePattern: true}, "Clr  T/O , no patt., 4000ft Runway 06"],
    [{type: "exit-runway", side: "any"}, "Exit Rwy"], [{type: "exit-runway", side: "left", expedite: true, traffic: "base"}, "Exit Rwy Left exp. tfc on base"],
    [{type: "exit-runway", side: "right", crossRunway: "24"}, "Exit Rwy Right, crs 24 "],
    [{type: "exit-runway", side: "any", holdShort: "24", expedite: true}, "Exit Rwy, hold 24 exp."],
  ];
  for (const [command, expected] of cases) assert.equal(name(command), expected, JSON.stringify(command));
  assert.equal(name({type: "atc", action: "progressive", variant: "crossed"}, ["Cross Runway...", "Already cleared to cross"]), "Cross Already cleared to cross");
  assert.equal(name({type: "atc", action: "progressive", variant: "crossed"}, ["Progressive Taxi", "Already cleared to cross"]), "Alrd Clrd to Crss");
});

test("pattern shortcuts include only the five eligible top-level branches", () => {
  assert.equal(name({type: "pattern", leg: "base"}), "Turn Base");
  assert.equal(name({type: "pattern", leg: "crosswind"}), "Turn XWind");
  assert.equal(name({type: "extend", leg: "downwind"}), "Call Base");
  assert.equal(name({type: "extend", leg: "upwind"}), "Ext. Upwnd");
  assert.equal(name({type: "atc", action: "progressive", variant: "inbound"}), "Cont. Inb");
  for (const command of [{type: "pattern", leg: "base", runway: "24", hand: "left"}, {type: "atc", action: "progressive", variant: "descend"}, {type: "sequence", number: 2}, {type: "cancel-landing"}] as Instruction[]) assert.equal(name(command), null);
});

test("speed, shared, approach and miscellaneous naming is explicit rather than inferred from labels", () => {
  for (const [relation, symbol] of [["exact", "="], ["minimum", ">="], ["maximum", "<"]] as const) assert.equal(name({type: "radar-speed", mode: "maintain", unit: "knots", value: 180, relation}), `SPD ${symbol} 180kts`);
  assert.equal(name({type: "radar-speed", mode: "maintain", unit: "mach", value: .78, relation: "exact"}), "SPD = mach 0.78");
  assert.equal(name({type: "radar-speed", mode: "approach", value: 170, until: 5}), "170kts/5NM");
  for (const [mode, suffix] of [["present", "CURRENT"], ["slowest", "SLOW"], ["discretion", "ANY"], ["best-forward", "MAX FWD"], ["follow", "FLW"]] as const) assert.equal(name({type: "radar-speed", mode}), `SPD: ${suffix}`);
  assert.equal(name({type: "radio", message: "standby"}), "Stand by");
  assert.equal(name({type: "radio", message: "say-intentions"}), "Say Intentions");
  assert.equal(name({type: "radio", message: "misc", text: "Traffic Alert"}), "Traffic Alert.");
  assert.equal(name({type: "radio", message: "misc", text: "Check Runway"}), null);
  assert.equal(name({type: "radio", message: "misc", text: "Please double check runway assignment"}), "Check Runway");
  assert.equal(name({type: "frequency", frequency: null}), "Freq. Chng Approved");
  assert.equal(name({type: "atc", action: "flight-following"}), "Proceed on course");
  assert.equal(name({type: "atc", action: "flight-following", name: "EGPH"}), null);
  assert.equal(name({type: "atc", action: "expect-unable", variant: "coverage"}), "Unable out of area");
  assert.equal(name({type: "atc", action: "deny-entry", variant: "event"}), "Event In Prog.");
  for (const command of [{type: "land", runway: "24"}, {type: "vector", heading: 180}, {type: "radio", message: "roger"}, {type: "radio", message: "unable"}, {type: "atc", action: "navigation"}] as Instruction[]) assert.equal(name(command), null);
  const radar = {...exercise, radarEnvironment: {version: 1 as const, name: "Radar", range: 100, boundary: [], fixes: [], approaches: [{id: "ils24", type: "ils" as const, runway: "24", finalDistance: 25, captureWidth: 2, glideAngle: 3, missedHeading: 240}]}};
  assert.equal(quickCommandName({type: "expect-approach", approachId: "ils24", navigation: "filed"}, radar, a), "Expect ILS 24 EGPH  (F)");
  assert.equal(quickCommandName({type: "expect-approach", approachId: null, vectors: true, runway: "06", navigation: "vectors"}, radar, a), "Expect RV 06 EGPH  (V)");
});

test("ranking starts at zero, retains first options/frequency across collisions and clears manual priority on reuse", () => {
  const manager = new QuickCommandManager();
  const prepare = (command: Instruction, frequency: "ground" | "tower" = "ground") => prepareQuickCommand({kind: "command", aircraftId: a.id, command, frequency, text: ""}, exercise)!;
  const cross = prepare({type: "cross", runway: "24", expedite: true});
  manager.add(cross); manager.add(prepare({type: "stop"})); manager.add(prepare({type: "stop"}));
  assert.deepEqual(manager.ranked().map(c => [c.name, c.count]), [["Hold Position", 1], ["Cross Runway\n24", 0]]);
  manager.add(prepare({type: "cross", runway: "24"}, "tower"));
  assert.deepEqual(manager.ranked()[0].command, {type: "cross", runway: "24", expedite: true});
  assert.equal(manager.ranked()[0].frequency, "ground");
  manager.add(prepare({type: "radio", message: "standby"}), true);
  assert.equal(manager.ranked()[0].name, "Stand by");
  manager.add(prepare({type: "radio", message: "standby"}));
  assert.equal(manager.ranked().find(c => c.name === "Stand by")!.manual, false);
  assert.equal(new QuickCommandManager().ranked().length, 0);
});

test("shortcuts filter the retained frequency and aircraft state, while Exit runway remains both", () => {
  const manager = new QuickCommandManager();
  for (const command of [{type: "stop"}, {type: "exit-runway", side: "left"}, {type: "atc", action: "deny-entry", variant: "full"}] as Instruction[]) manager.add(prepareQuickCommand({kind: "command", aircraftId: a.id, command, frequency: "tower", text: ""}, exercise)!);
  assert.deepEqual(visibleQuickCommands(manager.ranked(), exercise, {...a, altitude: getAirport(exercise).elevation}, "tower").map(c => c.name), ["Hold Position", "Exit Rwy Left"]);
  assert.deepEqual(visibleQuickCommands(manager.ranked(), exercise, {...a, altitude: 5000}, "tower").map(c => c.name), ["Exit Rwy Left", "Airport Full"]);
  assert.equal(visibleQuickCommands(manager.ranked(), exercise, a, "ground").length, 0);
});

test("tapping rebinds callsign/recipient and pending reply, and preserves saved turn wording and crossing options", () => {
  const turn = prepareQuickCommand({kind: "command", aircraftId: a.id, frequency: "tower", command: {type: "pattern", leg: "base"}, text: ""}, exercise, ["Pattern Instructions", "Turn base"])!;
  const other = {...a, id: "other", callsign: "Test 42", frequency: "tower" as const};
  const state = {...exercise, aircraft: [other], messages: [{id: "request", aircraftId: "other", frequency: "tower" as const, sender: "pilot" as const, text: "Test 42, requesting landing", time: 1}]};
  const action = quickCommandAction(turn, state, other, "tower");
  assert.equal(action.aircraftId, "other"); assert.equal(action.replyTo, "request");
  assert.equal(action.text, "Test 42, turn base"); assert.deepEqual(action.command, turn.command); assert.notEqual(action.command, turn.command);
  const ground = newAircraft("other", false); ground.frequency = "ground";
  const cross = prepareQuickCommand({kind: "command", aircraftId: a.id, frequency: "ground", command: {type: "cross", runway: "24", expedite: true}, text: ""}, exercise)!;
  assert.match(quickCommandAction(cross, {...exercise, aircraft: [ground]}, ground, "ground").text, /please expedite/);
});

test("ordinary menu paths produce eligible shortcuts without making unsupported leaves eligible", () => {
  const ground = newAircraft("ground", false), state = {...exercise, aircraft: [ground]};
  const catalog = catalogFor(getAirport(state));
  const visit = (entries: MenuEntry[], path: string[] = []) => entries.flatMap(entry => {
    const next = [...path, entry.label];
    return entry.children ? visit(entry.children, next) : entry.instruction ? [{name: quickCommandName(entry.instruction, state, ground, next), path: next}] : [];
  });
  const entries = visit(catalog.messageMenu("ground", ground));
  assert.ok(entries.some(e => e.name === "Taxi 24"));
  assert.ok(entries.some(e => e.name === "Pushback 24 West"));
  assert.ok(entries.some(e => e.name === "Cross Already cleared to cross"));
  assert.ok(entries.some(e => e.path.at(-1) === "Check Runway" && e.name === null));
  const hold = prepareQuickCommand({kind: "command", aircraftId: ground.id, frequency: "ground", command: {type: "stop"}, text: ""}, state)!;
  const result = applyEnvelope(state, {id: "sent", time: 1000, action: quickCommandAction(hold, state, ground, "ground")});
  assert.equal(result.error, undefined); assert.equal(result.state.messages.at(-1)?.instruction?.type, "stop");
});
