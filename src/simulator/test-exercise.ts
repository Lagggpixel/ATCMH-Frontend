import type {Exercise} from "./model";

/** Movement fixtures use a fixed configured wait; default random timing is covered separately. */
export function withFixedReadbackDelay(exercise: Exercise, seconds = 1.5): Exercise {
  return {...exercise, readbackDelay: {min: seconds, max: seconds}};
}
