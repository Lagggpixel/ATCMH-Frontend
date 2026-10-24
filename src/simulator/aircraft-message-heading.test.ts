import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {defaultAirport} from "./airports";
import {magneticToTrue} from "./magnetic-headings";
import {aircraftMessageHeading, simulatedPilotUsername} from "./aircraft-message-heading";

const aircraft = () => ({...engineFor({airport: "EGPH"}).newAircraft("header-test", true), performanceProfile: "A320" as const, mode: "heading" as const, heading: magneticToTrue(164, defaultAirport), altitude: 5799, speed: 255, groundSpeed: 281, active: true});

test("heading separates live GS, indicated speed and Mach, truncates altitude and converts magnetic heading", () => {
  const heading = aircraftMessageHeading(aircraft(), defaultAirport);
  assert.match(heading.position, /^5,700ft 164\u00b0M \d+\u00b0T$/);
  assert.equal(heading.speed, "GS: 281 IAS: 255 M0.43 Active");
});

test("generated usernames stay with an aircraft across edits, clones and reopening", () => {
  const a = aircraft();
  assert.equal(aircraftMessageHeading(a, defaultAirport).username, aircraftMessageHeading({...a, callsign: "New Callsign", altitude: 32000}, defaultAirport).username);
  assert.match(simulatedPilotUsername(a.id), /^[a-z]+[0-9]+$/);
  assert.notEqual(simulatedPilotUsername(a.id), simulatedPilotUsername("another-aircraft"));
});

test("stationary and legacy aircraft have finite speeds and actual pilot activity", () => {
  const a = {...aircraft(), performanceProfile: undefined, groundSpeed: undefined, speed: 0, heading: 360, altitude: 0, active: false, mode: "parked" as const};
  const heading = aircraftMessageHeading(a, defaultAirport);
  assert.equal(heading.speed, "GS: 0 IAS: 0 M0.00 Away");
  assert.match(heading.position, / 0\u00b0T$/);
  assert.doesNotMatch(heading.position + heading.speed, /NaN|Infinity/);
});
