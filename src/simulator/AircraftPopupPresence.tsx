"use client";
import {useEffect, useState, type RefObject} from "react";
import type {Point} from "./model";
import type {ReactNode} from "react";
import AircraftPopupAnchor from "./AircraftPopupAnchor";
export interface AircraftPopup {key: string; point: Point; screenPoint?: Point; content: ReactNode}
/** Delay opening and retain the outgoing menu for its short closing animation. */
export default function AircraftPopupPresence({popup, scope, onDismiss}: {
  popup: AircraftPopup | null; scope: RefObject<HTMLDivElement | null>; onDismiss: () => void;
}) {
  const [retained, setRetained] = useState(popup);
  if (popup && retained !== popup) setRetained(popup);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const key = popup?.key;
  useEffect(() => {
    const timer = setTimeout(() => setShownKey(key ?? null), key === undefined ? 40 : 100);
    return () => clearTimeout(timer);
  }, [key]);
  const current = popup ?? retained;
  return current && shownKey === current.key ? <AircraftPopupAnchor key={current.key} scope={scope} point={current.point} screenPoint={current.screenPoint} closing={!popup} onDismiss={onDismiss}>{current.content}</AircraftPopupAnchor> : null;
}
