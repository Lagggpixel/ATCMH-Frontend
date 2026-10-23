import type {SVGProps} from "react";
import {aircraftGlyphs, aircraftSymbol} from "./aircraft-symbol";

export default function AircraftSymbol({type, heading, ...props}: SVGProps<SVGSVGElement> & {type: string; heading: number}) {
  const symbol = aircraftSymbol(type);
  // IF 26.4 MapControl: 26-unit glyph, minimum scale .69, black 1.15x
  // backing offset 1 unit at 1x (ceil(1.5) / 2). Keep the surrounding 30px button as the hit target.
  const glyph = aircraftGlyphs[symbol];
  return <svg {...props} viewBox="-13 -13 26 26" width="26" height="26" fill="currentColor" aria-hidden="true" focusable="false" data-aircraft-symbol={symbol}>
    <g fontFamily="Simulator Aircraft" fontSize="26" fontWeight="400" textAnchor="middle" dominantBaseline="central">
      <text transform={`translate(1 1) rotate(${heading}) scale(.7935)`} fill="#000">{glyph}</text>
      <text transform={`rotate(${heading}) scale(.69)`}>{glyph}</text>
    </g>
  </svg>;
}
