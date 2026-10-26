import {engineFor} from "./engine";
import type {Aircraft, ExerciseWeather, Point, RadarEnvironment} from "./model";

export interface PathPredictionInput {
  aircraftId: string;
  aircraft: Aircraft[];
  airport: string;
  airportDataVersion?: string;
  radarEnvironment?: RadarEnvironment;
  weather?: ExerciseWeather;
  autoReadback: boolean;
}
export interface PathPredictionRequest {id: number; input: PathPredictionInput}
export type PathPredictionResponse = {id: number; points: Point[]} | {id: number; error: true};

/** The same forecast as the scope used synchronously, with the pinned airport data. */
export function calculateProjectedPath(input: PathPredictionInput): Point[] {
  const aircraft = input.aircraft.find(a => a.id === input.aircraftId);
  return aircraft ? engineFor({...input, traffic: input.aircraft}).projectedPath(aircraft, 120, input.aircraft, input.autoReadback) : [];
}
