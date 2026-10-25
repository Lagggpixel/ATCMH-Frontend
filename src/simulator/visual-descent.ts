const feetPerNm = 6076.12;
const lowGradient = feetPerNm * Math.tan(3 * Math.PI / 180);
const highGradient = feetPerNm * Math.tan(4 * Math.PI / 180);
const lowDistance = 1000 / lowGradient;

/** Runway-relative height: four degrees down to 1000 ft, three to the ground. */
export function visualDescentDistance(heightFeet: number): number {
  const height = Math.max(0, heightFeet);
  return Math.max(0, height - 1000) / highGradient + Math.min(height, 1000) / lowGradient;
}

export function visualDescentHeight(trackMiles: number): number {
  const distance = Math.max(0, trackMiles);
  return distance <= lowDistance ? distance * lowGradient : 1000 + (distance - lowDistance) * highGradient;
}
