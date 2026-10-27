import {applyDepartureOrigin, type DepartureAirport} from "./departure-airports";
import {magneticToTrue} from "./magnetic-headings";
import {profileForType, performanceFor} from "./aircraft-performance";
import {engineFor} from "./engine";
import {defaultRunway, getAirport, trainingMode} from "./airports";
import {radarTakeoffAircraft} from "./radar";
import {automaticRadarTarget} from "./radar-speed";
import type {Aircraft, Exercise, Point, RadarState} from "./model";

export interface SpawnOptions {
  airborne: boolean; runway?: string; origin?: DepartureAirport; position?: Point; heading?: number; altitude?: number; speed?: number;
  callsign: string; type: string; landing: Aircraft["landing"];
  flight?: RadarState["flight"]; requestedApproach?: string; departureDirection?: RadarState["departureDirection"];
}
/** Only user intentions cross between spawn modes; runtime departure/capture state never does. */
export function createSpawnAircraft(exercise: Exercise, id: string, options: SpawnOptions): Aircraft {
  const airport = getAirport(exercise), mode = trainingMode(exercise);
  let a = engineFor(exercise).newAircraft(id, options.airborne);
  a.callsign = options.callsign.trim(); a.type = options.type.trim(); a.landing = options.landing;
  const profile=profileForType(a.type);if(profile)a.performanceProfile=profile;else delete a.performanceProfile;
  if (!a.callsign || !a.type) throw new Error("Enter an aircraft callsign and type.");
  if (mode !== "local") {
    a.radar = {...a.radar!, flight: options.flight, requestedApproach: options.flight === "return" ? options.requestedApproach : undefined, departureDirection: options.departureDirection};
    if (!options.airborne) {
      const localRunway = options.origin && options.origin.icao !== airport.icao ? defaultRunway(airport) : options.runway ?? defaultRunway(airport);
      a = radarTakeoffAircraft(a, airport, localRunway);
      if (options.origin && options.origin.icao !== airport.icao) applyDepartureOrigin(a, airport, options.origin, options.runway ?? options.origin.runways[0].id);
    }
  }
  if (options.airborne) {
    if (mode === "local") a.automaticRequest = a.landing === "touch-and-go" ? "inbound-option" : "inbound-land";
    if (options.position) a.position = {...options.position};
    if (options.heading !== undefined) {a.heading = a.targetHeading = magneticToTrue(options.heading, airport); a.bankAngle = 0;}
    if (options.altitude !== undefined) a.altitude = options.altitude;
    if (a.radar) {
      a.radar.inboundSpeed = options.speed;
      a.speedMode = "auto";
      a.speed = a.targetSpeed = automaticRadarTarget(a);
    } else if (options.speed !== undefined) {a.speed = a.targetSpeed = options.speed; a.speedMode = "manual";}
    if (a.altitude <= airport.elevation) throw new Error(`Airborne altitude must be above ${airport.elevation} ft.`);
  }
  const performance=performanceFor(a);
  if(performance && a.altitude>performance.ceiling)throw new Error(`${performance.name} ceiling is ${performance.ceiling.toLocaleString()} ft.`);
  return a;
}
