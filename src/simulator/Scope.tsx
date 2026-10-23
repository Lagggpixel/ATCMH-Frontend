"use client";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import AircraftSymbol from "./AircraftSymbol";
import {Gear} from "@phosphor-icons/react/dist/csr/Gear";
import {MagnifyingGlassPlus} from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus";
import {MagnifyingGlassMinus} from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus";
import {Crosshair} from "@phosphor-icons/react/dist/csr/Crosshair";
import {distance, engineFor} from "./engine";
import {defaultAirport, runwayEnds, simulatedMetar} from "./airports";
import {aircraftColor, aircraftTagVisible, EXERCISE_WEATHER, runwayWind, type Airport, type Aircraft, type Frequency, type Point, type TaxiPoint, type RadarEnvironment} from "./model";
import {airborne, vectorPreview, radarFlightLabel} from "./radar";
import {outsideVectorCircle, VECTOR_CANCEL_RADIUS, VECTOR_HOLD_MS, type VectorTarget} from "./vector-drag";
import {terrainCoordinates} from "./terrain";
import VectorTerrain from "./VectorTerrain";
import {radarSeparationAlerts, separationLabel, terrainClearance} from "./radar-safety";
import {useAircraftTerrain} from "./use-aircraft-terrain";
import {editedTaxiPath, hitTaxiPath, remainingTaxiPath, taxiPathEditable, taxiPathState, type TaxiPathEdit} from "./taxi-path-editing";
import styles from "./Simulator.module.css";
import AircraftPopupPresence from "./AircraftPopupPresence";
import {approachGuide} from "./approach-guides";
import {gateAtPoint, type GateTarget} from "./gate-placement";
import {scopeFollowTarget, scopeNavigationFixes} from "./scope-overlays";
import {hitFixSymbol, layoutFixLabels, projectFixSymbols, type FixLabelMode} from "./scope-fix-labels";
import {controllerAircraft} from "./controller-state";
import type {ScopeContext} from "./MentorContextMenu";
import {useNavigationCatalog} from "./use-navigation-catalog";
import {radarEnvironmentFor} from "./radar";
import {holdingPattern} from "./holding";
import {useScopeCamera} from "./use-scope-camera";

export interface ScopeOptions {waypoints: boolean; taxiways: boolean; approaches: boolean; trails: boolean; frequencyTrails: boolean; filter: string}
export const initialOptions: ScopeOptions = {waypoints: true, taxiways: true, approaches: true, trails: true, frequencyTrails: true, filter: "none"};
const runwayWindColors = {headwind: "#90ee90", crosswind: "#ffa500", tailwind: "#ff0000"};
const optionRows: [keyof ScopeOptions, string][] = [["waypoints", "Show Waypoints"], ["taxiways", "Airport surface"], ["approaches", "Approach cones (11 NM)"], ["trails", "Flight history"], ["frequencyTrails", "Limit history to selected frequency"]];
export function trafficVisible(a: Aircraft, filter: string) {
  if (filter === "none") return true;
  return filter === "below15" ? a.altitude >= 15000 : a.altitude <= Number(filter);
}
interface Props {weather?: import("./model").ExerciseWeather;conflictTags?: Record<string, string>; conflictTargets?: readonly string[]; focusRequest?: {id: string; serial: number}; measureVectors?: boolean; onScopeContextMenu?: (target: ScopeContext) => void; showProjectedPaths?: boolean; gates?: readonly GateTarget[]; selectedGate?: string; onGateSelect?: (gateId: string) => void; onGateDrop?: (aircraftId: string, gateId: string) => void; airport?: Airport; radarEnvironment?: RadarEnvironment; radarMode?: "approach" | "center"; onVector?: (aircraftId: string, heading: number, release: Point, target?: VectorTarget) => void; contextPoint?: Point; onTagAngle?: (aircraftId: string, angle: number) => void; pendingAircraft?: readonly string[]; giveWayTargets?: readonly string[]; aircraft: Aircraft[]; running: boolean; autoReadback?: boolean; frequency: Frequency | "all"; selected: string | null; onSelect: (id: string | null) => void; onAirport?: () => void; onPoint?: (point: Point) => void; onTaxiPathEdit?: (aircraftId: string, path: TaxiPoint[], edit: TaxiPathEdit) => void; editMode?: string; context?: (aircraft: Aircraft) => React.ReactNode}
type RouteDrag = {aircraftId: string; pointerId: number; path: TaxiPoint[]; edit: TaxiPathEdit; start: Point; moved: boolean};
export default function Scope({weather,conflictTags, conflictTargets, focusRequest, measureVectors = false, onScopeContextMenu, showProjectedPaths = true, airport = defaultAirport, radarEnvironment: configuredEnvironment, radarMode, onVector, contextPoint, onTagAngle, pendingAircraft, giveWayTargets, aircraft: snapshot, running, autoReadback = false, frequency, selected, onSelect, onPoint, onTaxiPathEdit, editMode, context, gates, selectedGate, onGateSelect, onGateDrop}: Props) {
  const AIRPORT = airport, METAR = weather?.rawMetar ?? simulatedMetar(airport);
  const vectorEnabled = measureVectors || !!onVector;
  const navigation = useNavigationCatalog(radarMode ? airport.icao : undefined);
  const radarEnvironment = useMemo(() => radarMode ? {...(configuredEnvironment ?? radarEnvironmentFor(airport)),
    fixes: navigation.catalog?.fixes.map(fix => ({id: fix.name, point: fix.point})) ?? []} : configuredEnvironment,
  [radarMode, configuredEnvironment, airport, navigation.catalog]);
  const {followedAircraft, headingProjection, patternOutline, projectedPath} = useMemo(() => engineFor({airport: airport.icao, radarEnvironment, weather, traffic:snapshot}), [airport, radarEnvironment, weather, snapshot]);
  const airportCamera = useMemo(() => {
    const points = airport.features.flatMap(f => f.points);
    const bounds = {left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y))};
    return (width: number, height: number, unified: boolean) => radarMode
      ? {center: {x: 0, y: 0}, scale: Math.min(width, height) / (2 * (radarMode === "approach" ? Math.min(30, radarEnvironment?.range ?? 30) : radarEnvironment?.range ?? 80))}
      : unified
      ? {center: {x: (bounds.left + bounds.right) / 2, y: (bounds.bottom + bounds.top) / 2}, scale: Math.min(width * .9 / (bounds.right - bounds.left), height * .84 / (bounds.top - bounds.bottom))}
      : {center: {x: 0, y: 0}, scale: width / 1.8};
  }, [airport, radarMode, radarEnvironment?.range]);
  const aircraft = useRadarAircraft(snapshot, running, autoReadback, airport, radarEnvironment, weather);
  const staffAlerts = frequency === "all" && !!radarMode;
  const separation = radarSeparationAlerts(aircraft, radarEnvironment, frequency, AIRPORT);
  const terrainSamples = useAircraftTerrain(snapshot, airport, staffAlerts);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const trafficCanvas = useRef<HTMLCanvasElement>(null);
  const [scopeFontReady, setScopeFontReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Canvas does not redraw automatically when its web font finishes loading.
    document.fonts.load('400 12px "Simulator Fira"').then(() => {if (active) setScopeFontReady(true);}).catch(() => {});
    return () => {active = false;};
  }, []);
  const routeDrag = useRef<RouteDrag | null>(null);
  const vectorDrag = useRef<{aircraftId: string; pointerId: number; start: Point; last: Point; selection: string | null; armed: boolean; timer?: ReturnType<typeof setTimeout>} | null>(null);
  const suppressClick = useRef(false);
  const gateDrag = useRef<{aircraftId: string; pointerId: number; start: Point; moved: boolean} | null>(null);
  const [gateDraft, setGateDraft] = useState<{aircraftId: string; point: Point; gateId?: string} | null>(null);
  const cancelGate = () => {gateDrag.current = null; setGateDraft(null);};
  const [vectorDraft, setVectorDraft] = useState<{aircraftId: string; point: Point} | null>(null);
  const tagDrag = useRef<{aircraftId: string; pointerId: number; start: Point; at: number; moved: boolean; angle?: number} | null>(null);
  const [tagDraft, setTagDraft] = useState<{aircraftId: string; angle: number} | null>(null);
  const suppressTagClick = useRef(false);
  const cancelTag = () => {tagDrag.current = null; setTagDraft(null);};
  const cancelVector = useCallback(() => {clearTimeout(vectorDrag.current?.timer); vectorDrag.current = null; setVectorDraft(null);}, []);
  useEffect(() => () => clearTimeout(vectorDrag.current?.timer), []);
  useEffect(() => {
    const current = tagDrag.current;
    if (current && (!onTagAngle || !snapshot.some(a => a.id === current.aircraftId && a.active))) {
      suppressTagClick.current = current.moved; tagDrag.current = null; setTagDraft(null);
    }
  }, [snapshot, onTagAngle]);
  useEffect(() => {
    const current = vectorDrag.current;
    const target = current && snapshot.find(a => a.id === current.aircraftId);
    if (current && (!vectorEnabled || !target || !measureVectors && (target.frequency !== frequency || target.radar?.transferred) || !airborne(target, airport) || selected !== current.selection)) {
      suppressClick.current = true; cancelVector();
    }
  }, [snapshot, vectorEnabled, measureVectors, frequency, airport, selected, cancelVector]);
  const [routeDraft, setRouteDraft] = useState<RouteDrag | null>(null);
  const [routeHover, setRouteHover] = useState<TaxiPathEdit | undefined>();
  const [routeNode, setRouteNode] = useState<{aircraftId: string; index: number} | null>(null);
  const fitted = useRef(false);
  const [size, setSize] = useState({width: 1000, height: 800});
  const [camera, setCamera] = useState({center: {x: 0, y: 0}, scale: 300});
  const [options, setOptions] = useState(initialOptions);
  const [fixLabelMode, setFixLabelMode] = useState<FixLabelMode>("auto");
  const [revealedFixKey, setRevealedFixKey] = useState<string | null>(null);
  const [tap, setTap] = useState<{id: string; point: Point; choices: string[]} | null>(null);
  const selectedAircraft = snapshot.find(a => a.id === selected);
  const flightPlanAircraft = vectorDraft ? snapshot.find(a => a.id === vectorDraft.aircraftId) : selectedAircraft;
  const navigationFixes = useMemo(() => scopeNavigationFixes(radarEnvironment?.fixes ?? [], flightPlanAircraft?.flightPlan, options.waypoints), [radarEnvironment?.fixes, flightPlanAircraft?.flightPlan, options.waypoints]);
  const fixSymbols = useMemo(() => projectFixSymbols(navigationFixes, flightPlanAircraft?.flightPlan, camera, size), [navigationFixes, flightPlanAircraft?.flightPlan, camera, size]);
  const revealedFix = fixSymbols.find(fix => fix.key === revealedFixKey);
  const [popup, setPopup] = useState<"options" | "labels" | "hide" | "airport" | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {if (event.key === "Escape") {setPopup(null); setRevealedFixKey(null); suppressClick.current = !!vectorDrag.current; cancelVector(); suppressTagClick.current = !!tagDrag.current?.moved; tagDrag.current = null; setTagDraft(null); routeDrag.current = null; setRouteDraft(null); setRouteNode(null); gateDrag.current = null; setGateDraft(null);}};
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [cancelVector]);
  const project = (p: Point) => ({x: size.width / 2 + (p.x - camera.center.x) * camera.scale, y: size.height / 2 - (p.y - camera.center.y) * camera.scale});
  useEffect(() => {
    if (!focusRequest) return;
    const target = snapshot.find(a => a.id === focusRequest.id);
    const frame = requestAnimationFrame(() => {if (target) setCamera(current => ({...current, center: {...target.position}}));});
    return () => cancelAnimationFrame(frame);
    // A new request centers once; ordinary traffic updates must not interrupt panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);
  const minimumScale = radarMode ? .5 : 8;
  const navigationCamera = useScopeCamera(camera, setCamera, size, minimumScale);
  const zoom = (factor: number) => {if (!vectorDrag.current && !tagDrag.current && !routeDrag.current && !gateDrag.current) navigationCamera.zoom(factor);};
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const resize = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setSize(previous => previous.width === width && previous.height === entry.contentRect.height ? previous : {width, height: entry.contentRect.height});
      if (!fitted.current) {fitted.current = true; navigationCamera.reset(airportCamera(width, entry.contentRect.height, frequency === "all"));}
    });
    resize.observe(node);
    const blocked = (event: Event) => event.target instanceof Element && !!event.target.closest(`.${styles.contextAnchor}, .${styles.optionsMenu}, .${styles.airportPopup}, .${styles.scopeButtons}`);
    const manipulatingAircraft = () => !!(routeDrag.current || vectorDrag.current || tagDrag.current || gateDrag.current);
    let gestureScale: number | null = null;
    const wheel = (event: WheelEvent) => {
      // Popup lists use native scrolling; only wheel events over the map zoom it.
      if (blocked(event)) return;
      event.preventDefault();
      if (manipulatingAircraft() || gestureScale !== null) return;
      const bounds = node.getBoundingClientRect();
      navigationCamera.wheel({x: event.clientX - bounds.left, y: event.clientY - bounds.top}, event.deltaY, event.deltaMode, event.ctrlKey);
    };
    // Safari exposes trackpad magnification as cumulative gesture scale instead of Ctrl+wheel.
    const gestureStart = (event: Event) => {if (blocked(event)) return; event.preventDefault(); navigationCamera.stop(); gestureScale = 1;};
    const gestureChange = (event: Event) => {
      if (gestureScale === null) return;
      event.preventDefault();
      const gesture = event as Event & {scale: number; clientX: number; clientY: number};
      if (!Number.isFinite(gesture.scale) || gesture.scale <= 0) return;
      if (!manipulatingAircraft() && !navigationCamera.motion.pointers.size) {
        const bounds = node.getBoundingClientRect();
        navigationCamera.magnify({x: gesture.clientX - bounds.left, y: gesture.clientY - bounds.top}, gesture.scale / gestureScale);
      }
      gestureScale = gesture.scale;
    };
    const gestureEnd = () => {gestureScale = null;};
    node.addEventListener("wheel", wheel, {passive: false});
    node.addEventListener("gesturestart", gestureStart, {passive: false});
    node.addEventListener("gesturechange", gestureChange, {passive: false});
    node.addEventListener("gestureend", gestureEnd);
    return () => {resize.disconnect(); node.removeEventListener("wheel", wheel); node.removeEventListener("gesturestart", gestureStart); node.removeEventListener("gesturechange", gestureChange); node.removeEventListener("gestureend", gestureEnd);};
  }, [frequency, airportCamera, navigationCamera]);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ratio = window.devicePixelRatio || 1;
    node.width = Math.round(size.width * ratio); node.height = Math.round(size.height * ratio);
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, size.width, size.height);
    const screen = (p: Point) => ({x: size.width / 2 + (p.x - camera.center.x) * camera.scale, y: size.height / 2 - (p.y - camera.center.y) * camera.scale});
    const path = (points: Point[], color: string, width = 1, dashed = false) => {
      if (points.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [2, 6] : []);
      points.forEach((p, i) => {const s = screen(p); if (!i) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);}); ctx.stroke(); ctx.setLineDash([]);
    };
    ctx.font = '12px "Simulator Fira", sans-serif';
    if (radarMode) {
      ctx.lineWidth = 1;
      for (const route of [false, true]) {
        ctx.strokeStyle = route ? "#dedede" : "#2A82E6";
        ctx.beginPath();
        for (const fix of fixSymbols) {if (fix.route !== route) continue; ctx.moveTo(fix.x, fix.y - 3); ctx.lineTo(fix.x + 3, fix.y + 3); ctx.lineTo(fix.x - 3, fix.y + 3); ctx.closePath();}
        ctx.stroke();
      }
      ctx.textBaseline = "top";
      for (const label of layoutFixLabels(fixSymbols, size, name => ctx.measureText(name).width, fixLabelMode)) {ctx.fillStyle = label.symbol.route ? "#dedede" : "#2A82E6"; ctx.fillText(label.symbol.id, label.x, label.y);}
      ctx.textBaseline = "alphabetic";
    }
    for (const feature of AIRPORT.features) {
      if (!options.taxiways && feature.kind !== "runway") continue;
      const runway = feature.kind === "runway";
      path(feature.points, runway ? "#c6c6c6" : ["apron", "terminal", "hangar"].includes(feature.kind) ? "#656565" : "#887757", runway ? 2 : 1);
    }
    if (options.approaches) for (const {id} of runwayEnds(AIRPORT)) {
      const g = approachGuide(id, airport);
      path([g.threshold, g.left, g.right, g.threshold], g.color, 1.5);
      path([g.threshold, g.center], g.color, 1.5);
    }
  }, [scopeFontReady, camera, size, options, AIRPORT, airport, radarMode, fixSymbols, fixLabelMode]);
  const taxiAircraft = selectedAircraft && frequency === "all" && taxiPathEditable(selectedAircraft) ? selectedAircraft : undefined;
  const routeEditable = !!taxiAircraft && !!onTaxiPathEdit && editMode !== "position" && editMode !== "flightPlan";
  const taxiPreview = taxiAircraft && routeDraft?.aircraftId === taxiAircraft.id ? {...taxiAircraft, ...(taxiAircraft.runwayExit ? {runwayExit: editedTaxiPath(routeDraft.path, routeDraft.edit)} : {taxiPath: editedTaxiPath(routeDraft.path, routeDraft.edit)})} : taxiAircraft;
  const taxiLine = taxiPreview ? remainingTaxiPath(taxiPreview) : [];
  const routeState = taxiPreview ? taxiPathState(taxiPreview) : undefined;
  const nodeIndex = routeDraft?.aircraftId === selected ? routeDraft.edit.index : routeNode?.aircraftId === selected ? routeNode.index : routeHover?.kind === "move" ? routeHover.index : undefined;
  const routeHandle = routeEditable && routeState && nodeIndex !== undefined && nodeIndex >= routeState.index ? routeState.path[nodeIndex] : undefined;
  const projection = useMemo(() => {
    const a = snapshot.find(a => a.id === selected);
    return a && showProjectedPaths && frequency === "all" && remainingTaxiPath(a).length < 2 ? projectedPath(a, 120, snapshot, autoReadback) : [];
  }, [snapshot, selected, frequency, autoReadback, projectedPath, showProjectedPaths]);
  const following = frequency === "all" ? scopeFollowTarget(snapshot, aircraft, selected, followedAircraft) : undefined;
  useEffect(() => {
    const node = trafficCanvas.current; if (!node) return;
    const ratio = window.devicePixelRatio || 1;
    if (node.width !== Math.round(size.width * ratio) || node.height !== Math.round(size.height * ratio)) {node.width = Math.round(size.width * ratio); node.height = Math.round(size.height * ratio);}
    const ctx = node.getContext("2d"); if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size.width, size.height);
    const screen = (p: Point) => ({x: size.width / 2 + (p.x - camera.center.x) * camera.scale, y: size.height / 2 - (p.y - camera.center.y) * camera.scale});
    const path = (points: Point[], color: string, width = 1, dashed = false) => {
      if (points.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [3, 7] : []);
      points.forEach((p, i) => {const s = screen(p); if (!i) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);}); ctx.stroke(); ctx.setLineDash([]);
    };
    for (const a of aircraft) {
      if (!trafficVisible(a, options.filter)) continue;
      if (options.trails && (frequency === "all" || !options.frequencyTrails || a.frequency === frequency)) path([...a.trail, a.position], "#808080", 1, true);
      if (!(a.id === selected && taxiLine.length > 1)) path(headingProjection(a), "#dedede", 1.5);
      if (a.id === flightPlanAircraft?.id) path(a.flightPlan, "#dedede", 1.5);
      if (showProjectedPaths && a.id === selected && frequency === "all" && taxiLine.length < 2) {
        if (!a.radar && (["pattern", "takeoff", "lineup", "go-around"].includes(a.mode) || a.landing === "touch-and-go" && a.mode === "rollout")) {
          path(patternOutline(a), "#64b4d2", 1.5);
          path(patternOutline({...a, hand: a.hand === "left" ? "right" : "left"}), "#5d7078", 1, true);
        }
        path(projection, "#f3cf83", 2.5);
      }
    }
  }, [aircraft, camera, size, options, selected, flightPlanAircraft?.id, frequency, projection, taxiLine.length, headingProjection, patternOutline, showProjectedPaths]);
  const pointAt = (event: React.PointerEvent): Point => {const bounds = event.currentTarget.getBoundingClientRect(); return {x: camera.center.x + (event.clientX - bounds.left - size.width / 2) / camera.scale, y: camera.center.y - (event.clientY - bounds.top - size.height / 2) / camera.scale};};
  const vectorPoint = (event: {clientX: number; clientY: number}): Point => {const bounds = container.current!.getBoundingClientRect(); return {x: camera.center.x + (event.clientX - bounds.left - size.width / 2) / camera.scale, y: camera.center.y - (event.clientY - bounds.top - size.height / 2) / camera.scale};};
  const vectorAircraft = vectorDraft && aircraft.find(a => a.id === vectorDraft.aircraftId);
  const vector = vectorAircraft && vectorDraft && outsideVectorCircle(vectorAircraft.position, vectorDraft.point, camera.scale) ? vectorPreview(vectorAircraft, vectorDraft.point, AIRPORT, radarEnvironment, camera.scale) : null;
  const vectorScreen = vector ? project(vector.point) : null;
  const terrainPoint = vector ? terrainCoordinates(AIRPORT, vector.point) : null;
  const dismissAircraftMenu = () => {setTap(null); onSelect(null);};
  const selectAt = (a: Aircraft, event: {clientX: number; clientY: number; detail: number}) => {
    const bounds = container.current!.getBoundingClientRect(), at = project(a.position);
    const point = event.detail ? {x: event.clientX, y: event.clientY} : {x: bounds.left + at.x, y: bounds.top + at.y};
    const choices = context && frequency !== "all" && event.detail ? aircraft.filter(other => trafficVisible(other, options.filter) && distance(project(other.position), at) < 24).map(other => other.id) : [];
    setTap({id: a.id, point, choices: choices.length > 1 ? choices : []});
    onSelect(a.id); setPopup(null);
  };
  const aircraftContext = selectedAircraft && !vectorDraft && context ? context(selectedAircraft) : null;
  const alertBoxes: {x: number; top: number; height: number}[] = [];
  return <div data-simulator-tour="radar" className={styles.scope} ref={container} onDragStart={event => {if (!(event.target instanceof Element) || !event.target.closest('input,textarea,[contenteditable="true"]')) event.preventDefault();}} aria-label={`${AIRPORT.icao} radar scope`} onContextMenu={event => {if (!onScopeContextMenu || (event.target as HTMLElement).closest("button,input,select,a")) return; event.preventDefault(); onScopeContextMenu({point: vectorPoint(event), screen: {x: event.clientX, y: event.clientY}});}} onPointerDownCapture={event => {navigationCamera.stop(); if (!event.isPrimary) {cancelVector(); cancelTag(); cancelGate();}}}>
    <div className={styles.mapSurface} style={routeEditable && routeHover ? {cursor: "crosshair"} : undefined} onPointerDown={event => {
      if (event.button !== 0 || vectorDrag.current) return;
      setRevealedFixKey(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      const bounds = event.currentTarget.getBoundingClientRect();
      navigationCamera.down(event.pointerId, {x: event.clientX - bounds.left, y: event.clientY - bounds.top}, event.pointerType, !editMode);
      if (navigationCamera.motion.pointers.size > 1) {routeDrag.current = null; setRouteDraft(null); return;}
      const hit = routeEditable && taxiAircraft ? hitTaxiPath(taxiAircraft, pointAt(event), 11 / camera.scale) : undefined;
      if (hit && taxiAircraft) {routeDrag.current = {aircraftId: taxiAircraft.id, pointerId: event.pointerId, path: taxiPathState(taxiAircraft).path.map(p => ({...p})), edit: hit, start: {x: event.clientX, y: event.clientY}, moved: false}; if (hit.kind === "move") setRouteNode({aircraftId: taxiAircraft.id, index: hit.index});}
    }}
      onPointerMove={event => {
        if (vectorDrag.current) return;
        const previous = navigationCamera.motion.pointers.get(event.pointerId);
        if (!previous) {
          const hit = routeEditable && taxiAircraft ? hitTaxiPath(taxiAircraft, pointAt(event), 11 / camera.scale) : undefined;
          setRouteHover(current => current?.index === hit?.index && current?.kind === hit?.kind ? current : hit);
          const bounds = event.currentTarget.getBoundingClientRect();
          setRevealedFixKey(radarMode && !editMode ? hitFixSymbol(fixSymbols, {x: event.clientX - bounds.left, y: event.clientY - bounds.top})?.key ?? null : null);
          return;
        }
        const nextPoint = {x: event.clientX, y: event.clientY};
        if (routeDrag.current?.pointerId === event.pointerId) {
          const current = routeDrag.current;
          if (distance(current.start, nextPoint) > 4) current.moved = true;
          if (current.moved) {current.edit = {...current.edit, point: pointAt(event)}; setRouteDraft({...current});}
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        navigationCamera.move(event.pointerId, {x: event.clientX - bounds.left, y: event.clientY - bounds.top}, !routeDrag.current);
      }} onPointerUp={event => {
        const current = routeDrag.current;
        const tapped = current ? (navigationCamera.cancel(event.pointerId), false) : navigationCamera.up(event.pointerId);
        if (current?.pointerId === event.pointerId) {
          if (current.moved && current.aircraftId === selected && routeEditable) {onTaxiPathEdit?.(current.aircraftId, current.path, {...current.edit, point: pointAt(event)}); setRouteNode({aircraftId: current.aircraftId, index: current.edit.index});}
          routeDrag.current = null; setRouteDraft(null); setRouteHover(undefined);
        } else if (tapped) {
          setRouteNode(null);
          const bounds = event.currentTarget.getBoundingClientRect();
          const fix = radarMode && !editMode ? hitFixSymbol(fixSymbols, {x: event.clientX - bounds.left, y: event.clientY - bounds.top}, event.pointerType === "touch" ? 22 : 12) : undefined;
          if (fix) {setRevealedFixKey(fix.key); setPopup(null);}
          else if (onPoint && editMode) onPoint(pointAt(event));
          else {onSelect(null); setPopup(null);}
        }
      }} onPointerCancel={event => {navigationCamera.cancel(event.pointerId); routeDrag.current = null; setRouteDraft(null);}}
      onLostPointerCapture={event => {navigationCamera.cancel(event.pointerId); routeDrag.current = null; setRouteDraft(null);}}
      onPointerLeave={event => {setRouteHover(undefined); if (event.pointerType !== "touch") setRevealedFixKey(null);}}><canvas ref={canvas} className={styles.mapCanvas}/><canvas ref={trafficCanvas} className={`${styles.mapCanvas} ${styles.trafficCanvas}`}/>
      {radarMode ? <svg className={styles.holdOverlay} width={size.width} height={size.height} aria-label="Holding patterns">{aircraft.filter(a => trafficVisible(a, options.filter) && a.atcManeuver?.kind === "hold").map(a => <polyline key={a.id} role="img" aria-label={`${a.callsign} holding pattern${a.atcManeuver?.fixName ? ` at ${a.atcManeuver.fixName}` : ""}`} points={holdingPattern(a).map(p => {const s = project(p); return `${s.x.toFixed(2)},${s.y.toFixed(2)}`;}).join(" ")} fill="none" stroke="#ffd600" strokeWidth="2" strokeLinejoin="round"/>)}</svg> : null}
      {taxiAircraft && taxiLine.length > 1 ? <svg className={styles.taxiRouteOverlay} width={size.width} height={size.height} role="group" aria-label={`${taxiAircraft.callsign} taxi route`}>
        <polyline points={taxiLine.map(p => {const s = project(p); return `${s.x},${s.y}`;}).join(" ")} fill="none" stroke="#58e283" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
        {routeHandle && nodeIndex !== undefined ? <circle className={styles.taxiWaypoint} cx={project(routeHandle).x} cy={project(routeHandle).y} r="7" fill={routeHandle.hold ? "#ff8e8e" : "#58e283"} stroke="#14251b" strokeWidth="2" role="button" tabIndex={0} aria-label={`Taxi waypoint ${nodeIndex + 1}${routeHandle.hold ? ", hold short" : ""}`} onFocus={() => setRouteNode({aircraftId: taxiAircraft.id, index: nodeIndex})} onKeyDown={event => {
          const offsets: Record<string, Point> = {ArrowLeft: {x: -1, y: 0}, ArrowRight: {x: 1, y: 0}, ArrowUp: {x: 0, y: 1}, ArrowDown: {x: 0, y: -1}};
          const offset = offsets[event.key]; if (!offset || !onTaxiPathEdit) return; event.preventDefault();
          const step = (event.shiftKey ? 50 : 10) / camera.scale;
          onTaxiPathEdit(taxiAircraft.id, taxiPathState(taxiAircraft).path.map(p => ({...p})), {kind: "move", index: nodeIndex, point: {x: routeHandle.x + offset.x * step, y: routeHandle.y + offset.y * step}});
        }}><title>Drag to move this waypoint. Arrow keys adjust it; Shift moves farther.</title></circle> : null}
      </svg> : null}</div>
    {gates?.map(gate => {const p = project(gate.point); if (p.x < 0 || p.x > size.width || p.y < 0 || p.y > size.height) return null; return <button key={gate.id} type="button" className={`${styles.gateTarget} ${gateDraft?.gateId === gate.id ? styles.hoveredGate : ""}`} style={{left: p.x, top: p.y}} aria-label={gate.label} aria-pressed={selectedGate === gate.id} title={gate.label} onClick={event => onGateSelect?.(event.detail && gates ? gateAtPoint(gates, vectorPoint(event), 24 / camera.scale)?.id ?? gate.id : gate.id)}><span/></button>;})}
    {gateDraft ? <span className={styles.gatePlacementHint} role="status">{gateDraft.gateId ? `Release to place at ${gates?.find(gate => gate.id === gateDraft.gateId)?.label}` : "Drag onto a blue gate dot · Escape to cancel"}</span> : null}
    {runwayEnds(AIRPORT).map(end => {const p = project(end.point), color = runwayWindColors[runwayWind(end.heading, weather?.windDirection ?? EXERCISE_WEATHER.windDirection)]; return <span key={end.id} className={styles.runwayTag} style={{left: p.x, top: p.y, color, borderColor: color}}>{end.id}</span>;})}
    <button className={styles.airportMarker} style={{left: project({x: 0, y: 0}).x, top: project({x: 0, y: 0}).y}} aria-label={`${AIRPORT.icao} airport information`} onClick={() => setPopup(popup === "airport" ? null : "airport")}><span>{AIRPORT.icao}</span><Crosshair size={28} weight="fill"/><i/></button>
    {vectorAircraft && vectorEnabled ? <>
      <svg className={styles.vectorOverlay} width={size.width} height={size.height} aria-label="Vector preview" fill="none" stroke="#ff69bd" strokeWidth="4">
        <circle aria-label="Vector cancellation circle" cx={project(vectorAircraft.position).x} cy={project(vectorAircraft.position).y} r={VECTOR_CANCEL_RADIUS}/>
        {vectorScreen ? <><line x1={project(vectorAircraft.position).x} y1={project(vectorAircraft.position).y} x2={vectorScreen.x} y2={vectorScreen.y}/><circle cx={vectorScreen.x} cy={vectorScreen.y} r="7" fill="#161219"/></> : null}
      </svg>
      {vector && vectorScreen ? <div className={styles.vectorPreviewBox} role="status" aria-label="Vector details" style={{left: Math.max(6, Math.min(size.width - 215, vectorScreen.x + 15)), top: Math.max(6, Math.min(size.height - 90, vectorScreen.y + 15))}}>
        {vector.target ? <span>Direct To {vector.target.name}</span> : null}
        <span>{String(vector.heading || 360).padStart(3, "0")}°&nbsp; {String(Math.floor(vector.nm)).padStart(3, "0")}NM</span>
        <span>{vector.minutes === null ? "—min" : `${Math.ceil(vector.minutes)}min`} - {terrainPoint && <VectorTerrain key={`${airport.icao}:${vectorDraft?.aircraftId}`} {...terrainPoint}/>}</span>
        {!vector.target && vector.fix ? <span>{vector.fix}</span> : null}
      </div> : null}
    </> : null}
    {aircraft.filter(a => trafficVisible(a, options.filter)).map(a => {
      const p = project(gateDraft?.aircraftId === a.id && selected === a.id ? gateDraft.point : a.position); if (p.x < -50 || p.x > size.width + 50 || p.y < -50 || p.y > size.height + 50) return null;
      const conflicts = separation.get(a.id) ?? [];
      const agl = staffAlerts ? terrainClearance(a, terrainSamples.elevations.get(a.id), radarEnvironment) : undefined;
      const busting = conflicts.length > 0 || agl !== undefined;
      let alertOffset = 65;
      const alertHeight = (conflicts.length + (agl === undefined ? 0 : 1)) * 18 + 4;
      if (busting) {
        while (alertBoxes.some(box => Math.abs(box.x - p.x) < 100 && p.y - 24 - alertOffset - alertHeight < box.top + box.height && p.y - 24 - alertOffset > box.top)) alertOffset += alertHeight + 4;
        alertBoxes.push({x: p.x, top: p.y - 24 - alertOffset - alertHeight, height: alertHeight});
      }
      const color = conflicts.length ? conflicts.some(c => c.level !== "warning") ? "#ff0000" : "#ffa500" : aircraftColor(a, frequency);
      const tagColor = controllerAircraft(a).clearedToLand ? "#90ee90" : "#d3d3d3";
      const labelStyle={color:tagColor,backgroundColor:a.color??undefined,"--label-color":a.color??"transparent","--label-text":tagColor} as React.CSSProperties;
      const label = radarFlightLabel(a, AIRPORT, radarEnvironment);
      const holding = a.atcManeuver?.kind === "hold";
      const tagAngle = tagDraft?.aircraftId === a.id ? tagDraft.angle : a.tagAngle;
      const tagOffset = tagAngle === undefined ? null : {x: Math.cos(tagAngle * Math.PI / 180) * Math.hypot(28, 25), y: Math.sin(tagAngle * Math.PI / 180) * Math.hypot(28, 25)};
      return <div key={a.id} className={styles.aircraftPosition} style={{left: 0, top: 0, transform: `translate(${p.x}px, ${p.y}px)`, color}}>
        {giveWayTargets?.includes(a.id) ? <span className={styles.giveWayTarget} role="img" aria-label={`Likely give-way traffic: ${a.callsign}`}/> : null}
        {busting ? <div className={styles.bustingRing} role="status" aria-label={`Busting ${a.callsign}`}><div className={styles.bustingTag} style={{bottom: `calc(100% + ${alertOffset}px)`}}>{conflicts.map(alert => <span key={alert.otherId}>{separationLabel(alert)}</span>)}{agl !== undefined ? <span>{Math.floor(agl)}ft AGL</span> : null}</div></div> : null}
        <button aria-label={`Select ${a.callsign}`} title={gates?.length && selected === a.id ? "Drag to a blue gate dot" : undefined} className={`${styles.aircraft} ${selected === a.id ? styles.selectedAircraft : ""} ${conflictTargets?.includes(a.id) ? styles.conflictTarget : ""} ${gates?.length && selected === a.id ? styles.gateAircraft : ""}`} onContextMenu={event => {if (onScopeContextMenu) {event.preventDefault(); event.stopPropagation(); onScopeContextMenu({point: vectorPoint(event), screen: {x: event.clientX, y: event.clientY}, aircraftId: a.id});} else if (onVector) event.preventDefault();}}
          onPointerDown={event => {
            suppressClick.current = false;
            if (onGateDrop && gates?.length && a.id === selected && !running && event.button === 0 && event.isPrimary) {event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); gateDrag.current = {aircraftId: a.id, pointerId: event.pointerId, start: {x: event.clientX, y: event.clientY}, moved: false}; return;}
            if (!vectorEnabled || event.button !== 0 || !event.isPrimary || !measureVectors && (a.frequency !== frequency || a.radar?.transferred) || !airborne(a, airport)) return;
            cancelVector();
            event.currentTarget.setPointerCapture(event.pointerId);
            const start = {x: event.clientX, y: event.clientY};
            const current: NonNullable<typeof vectorDrag.current> = {aircraftId: a.id, pointerId: event.pointerId, start, last: start, selection: selected, armed: false};
            vectorDrag.current = current;
            current.timer = setTimeout(() => {
              if (vectorDrag.current !== current) return;
              current.armed = true; suppressClick.current = true;
              setPopup(null); setRevealedFixKey(null);
              setVectorDraft({aircraftId: a.id, point: vectorPoint({clientX: current.last.x, clientY: current.last.y})});
            }, VECTOR_HOLD_MS);
          }}
          onPointerMove={event => {
            const placement = gateDrag.current;
            if (placement?.pointerId === event.pointerId && gates) {event.stopPropagation(); if (!placement.moved && distance(placement.start, {x: event.clientX, y: event.clientY}) < 4) return; placement.moved = true; const point = vectorPoint(event); setGateDraft({aircraftId: a.id, point, gateId: gateAtPoint(gates, point, 24 / camera.scale)?.id}); return;}
            const current = vectorDrag.current;
            if (!current || current.pointerId !== event.pointerId || !vectorEnabled) return;
            current.last = {x: event.clientX, y: event.clientY};
            if (!current.armed) {
              if (distance(current.start, current.last) > 8) {suppressClick.current = true; cancelVector();}
              return;
            }
            setVectorDraft({aircraftId: a.id, point: vectorPoint(event)});
          }}
          onPointerUp={event => {
            const placement = gateDrag.current;
            if (placement?.pointerId === event.pointerId) {event.stopPropagation(); if (placement.moved) {suppressClick.current = true; const gate = gates && gateAtPoint(gates, vectorPoint(event), 24 / camera.scale); if (gate && placement.aircraftId === selected) onGateDrop?.(placement.aircraftId, gate.id);} cancelGate(); return;}
            const current = vectorDrag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            if (current.armed) {
              suppressClick.current = true;
              const point = vectorPoint(event);
              if (!measureVectors && onVector && a.frequency === frequency && !a.radar?.transferred && airborne(a, airport) && outsideVectorCircle(a.position, point, camera.scale)) {
                const preview = vectorPreview(a, point, AIRPORT, radarEnvironment, camera.scale);
                onVector(a.id, preview.heading, {x: event.clientX, y: event.clientY}, preview.target);
              }
            }
            cancelVector();
          }}
          onPointerCancel={() => {suppressClick.current = true; cancelVector(); cancelGate();}} onLostPointerCapture={() => {cancelVector(); cancelGate();}}
          onClick={event => {if (suppressClick.current) {suppressClick.current = false; return;} selectAt(a, event);}}><AircraftSymbol type={a.type} heading={a.heading} className={!busting && pendingAircraft?.includes(a.id) ? styles.pendingAircraft : undefined}/></button>
        {aircraftTagVisible(a, frequency, selected) ? <>
          {tagOffset ? <svg className={styles.tagLeader} width="1" height="1" aria-hidden="true"><line x1="0" y1="0" x2={tagOffset.x} y2={tagOffset.y} stroke="currentColor"/></svg> : null}
          <button className={`${styles.aircraftTag} ${tagOffset ? styles.rotatedTag : a.tag === "left" || (a.tag === "auto" && p.x > size.width * .7) ? styles.leftTag : ""}`} style={tagOffset ? {...labelStyle, left: tagOffset.x, top: tagOffset.y, right: "auto", bottom: "auto", transform: `translate(${tagOffset.x < 0 ? "-100%" : "0"}, ${tagOffset.y < 0 ? "-100%" : "0"})`, textAlign: tagOffset.x < 0 ? "right" : "left"} : labelStyle}
            aria-label={`Flight label ${a.callsign}`}
            onPointerDown={event => {suppressTagClick.current = false; if (!onTagAngle || event.button !== 0 || !event.isPrimary) return; event.currentTarget.setPointerCapture(event.pointerId); tagDrag.current = {aircraftId: a.id, pointerId: event.pointerId, start: {x: event.clientX, y: event.clientY}, at: performance.now(), moved: false};}}
            onPointerMove={event => {const current = tagDrag.current; if (!current || current.pointerId !== event.pointerId || !onTagAngle) return; if (!current.moved && distance(current.start, {x: event.clientX, y: event.clientY}) < (event.pointerType === "touch" ? 12 : 8)) return; if (event.pointerType === "touch" && performance.now() - current.at < 180) {suppressTagClick.current = true; cancelTag(); return;} current.moved = true; const bounds = container.current!.getBoundingClientRect(); const angle = (Math.atan2(event.clientY - bounds.top - p.y, event.clientX - bounds.left - p.x) * 180 / Math.PI + 360) % 360; current.angle = angle; setTagDraft({aircraftId: a.id, angle});}}
            onPointerUp={event => {const current = tagDrag.current; if (!current || current.pointerId !== event.pointerId) return; if (current.moved) {suppressTagClick.current = true; if (current.angle !== undefined) onTagAngle?.(a.id, current.angle);} cancelTag();}}
            onPointerCancel={() => {suppressTagClick.current = true; cancelTag();}} onLostPointerCapture={cancelTag}
            onContextMenu={event => {event.preventDefault(); event.stopPropagation();}} onClick={event => {event.stopPropagation(); suppressTagClick.current = false;}}>{conflictTags?.[a.id] ? <span className={styles.conflictTag}>{conflictTags[a.id]}</span> : null}<span>{a.callsign}</span><span>{label.flight}</span>{label.approach || holding ? <span>{label.approach ?? "\u00a0"}</span> : null}{holding ? <span className={styles.holdStatus}>HOLD</span> : frequency === "all" && a.radar?.cleared ? <span>CLR</span> : null}</button>
        </> : null}
      </div>;
    })}
    <AircraftPopupPresence scope={container} onDismiss={dismissAircraftMenu} popup={aircraftContext && selectedAircraft ? {key: `${selectedAircraft.id}:${contextPoint?.x ?? tap?.point.x ?? "click"}:${contextPoint?.y ?? tap?.point.y ?? "click"}`, point: project(selectedAircraft.position), screenPoint: contextPoint ?? (tap?.id === selected ? tap.point : undefined), content: <>
      {tap?.id === selected && tap.choices.length > 1 ? <div className={`${styles.aircraftMenu} ${styles.radarQuick}`} role="menu" aria-label="Choose aircraft">{tap.choices.map(id => {const a = snapshot.find(item => item.id === id); return a ? <button key={id} role="menuitem" onClick={() => {setTap({...tap, id, choices: []}); onSelect(id);}}>{a.callsign}</button> : null;})}</div> : aircraftContext}
    </>} : null}/>
    {following && trafficVisible(following, options.filter) ? <span role="img" aria-label={`Traffic to follow: ${following.callsign}`} className={styles.followingRing} style={{left: project(following.position).x, top: project(following.position).y}}/> : null}
    {selectedAircraft && frequency === "all" && (showProjectedPaths || taxiLine.length > 1) ? <div className={styles.pathLegend}>{taxiLine.length > 1 ? <>Taxi route{routeEditable ? <><br/>Drag the green line to reshape · drag a waypoint to move it</> : null}</> : <>Projected path · {selectedAircraft.mode}<br/>{!selectedAircraft.radar && ["pattern", "takeoff", "lineup", "go-around", "rollout"].includes(selectedAircraft.mode) ? <>Solid: {selectedAircraft.hand} traffic · Dotted: {selectedAircraft.hand === "left" ? "right" : "left"} traffic{selectedAircraft.optionHand ? <><br/>After option: {selectedAircraft.optionHand} traffic</> : null}</> : null}</>}</div> : null}
    {editMode ? <div className={styles.editHint}>{editMode === "taxi-preview" ? "Taxi route · drag the green line to adjust" : editMode === "taxi" ? "Click to extend route · drag the line or a waypoint to reshape" : editMode === "flightPlan" ? "Click to add flight-plan waypoint" : "Click to reposition selected aircraft"}</div> : null}
    <div className={styles.scopeButtons}>
      <button aria-label="Scope options" aria-expanded={popup === "options" || popup === "labels" || popup === "hide"} onClick={() => setPopup(popup === "options" || popup === "labels" || popup === "hide" ? null : "options")}><Gear size={32} weight="fill"/></button>
      <button aria-label="Zoom in" onClick={() => zoom(1.4)}><MagnifyingGlassPlus size={32} weight="bold"/></button>
      <button aria-label="Zoom out" onClick={() => zoom(1 / 1.4)}><MagnifyingGlassMinus size={32} weight="bold"/></button>
      <button aria-label="Recenter airport" onClick={() => navigationCamera.reset(airportCamera(size.width, size.height, frequency === "all"))}><Crosshair size={32} weight="bold"/></button>
    </div>
    {popup === "options" ? <div className={styles.optionsMenu} role="menu" aria-label="Scope options">{optionRows.map(([key, label]) => <button key={key} role="menuitemcheckbox" aria-checked={Boolean(options[key])} onClick={() => setOptions(o => ({...o, [key]: !o[key]}))}><span>{options[key] ? "✓" : ""}</span>{label}</button>)}{radarMode ? <button aria-haspopup="menu" onClick={() => setPopup("labels")}>Waypoint names · {fixLabelMode === "auto" ? "Auto" : fixLabelMode === "all" ? "All" : "None"}<span className={styles.arrow}>›</span></button> : null}<button onClick={() => setPopup("hide")}>Hide Traffic <span className={styles.arrow}>›</span></button></div> : null}
    {popup === "labels" ? <div className={styles.optionsMenu} role="menu" aria-label="Waypoint names">{(["auto", "all", "none"] as const).map(mode => <button key={mode} role="menuitemradio" aria-checked={fixLabelMode === mode} onClick={() => setFixLabelMode(mode)}><span aria-hidden="true">{fixLabelMode === mode ? "✓" : ""}</span>{mode === "auto" ? "Auto" : mode === "all" ? "All" : "None"}</button>)}<button onClick={() => setPopup("options")}>‹ Scope options</button></div> : null}
    {revealedFix ? <span role="tooltip" className={styles.fixTooltip} style={{left: Math.max(6, Math.min(size.width - 130, revealedFix.x + 12)), top: Math.max(6, Math.min(size.height - 32, revealedFix.y - 30))}}>{revealedFix.id}</span> : null}
    {popup === "hide" ? <div className={styles.optionsMenu} role="menu" aria-label="Hide Traffic">{[["none", "Show All Traffic"], ...[10000, 15000, 20000, 25000, 30000].map(n => [String(n), `Hide Traffic > ${n / 1000}K`]), ["below15", "Hide Traffic < 15K"]].map(([value, label]) => <button key={value} role="menuitemradio" aria-checked={options.filter === value} onClick={() => {setOptions(o => ({...o, filter: value})); setPopup(null);}}><span>{options.filter === value ? "✓" : ""}</span>{label}</button>)}</div> : null}
    {popup === "airport" ? <div className={styles.airportPopup}><div><strong>{AIRPORT.name} training area · {AIRPORT.icao} · {AIRPORT.elevation}ft</strong><p>{METAR}<br/>{weather?.reference ?? EXERCISE_WEATHER.reference}</p><p>Instructor routes and final guides are schematic, not navigation charts.</p><a href="/sweatbox/about" target="_blank" rel="noreferrer">Sources and training limits</a></div></div> : null}
    <span className={styles.attribution}><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>{radarMode ? <> · Terrain: InfiniteTerrain</> : null}</span>
    {terrainSamples.unavailable ? <span role="status" className={styles.terrainUnavailable}>Terrain data unavailable for {terrainSamples.unavailable} aircraft</span> : null}
    {radarMode && !navigation.catalog ? <div className={styles.navigationStatus} role="status">{navigation.error ? <>Navigation fixes unavailable. <button type="button" onClick={navigation.retry}>Retry navigation</button></> : "Loading navigation fixes…"}</div> : null}
  </div>;
}
/** Both roles animate at the display's frame rate between authoritative motion
 * frames. A background staff tab's throttled timer no longer makes the mentee jump. */
function useRadarAircraft(snapshot: Aircraft[], running: boolean, autoReadback: boolean, airport: Airport, radarEnvironment?: RadarEnvironment, weather?: import("./model").ExerciseWeather) {
  const {predictAircraft} = useMemo(() => engineFor({airport: airport.icao, radarEnvironment, weather, traffic:snapshot}), [airport, radarEnvironment, weather, snapshot]);
  const latest = useRef({snapshot, time: 0});
  const [frame, setFrame] = useState<{snapshot: Aircraft[]; aircraft: Aircraft[]} | null>(null);
  useEffect(() => {latest.current = {snapshot, time: performance.now()};}, [snapshot]);
  useEffect(() => {
    if (!running) return;
    let handle = 0, last = -Infinity;
    const draw = (now: number) => {
      const current = latest.current;
      if (now - last >= 1000 / 30 - 1) {last = now; setFrame({snapshot: current.snapshot, aircraft: predictAircraft(current.snapshot, (now - current.time) / 1000, autoReadback)});}
      handle = requestAnimationFrame(draw);
    };
    handle = requestAnimationFrame(draw); return () => cancelAnimationFrame(handle);
  }, [running, autoReadback, predictAircraft]);
  return running && frame?.snapshot === snapshot ? frame.aircraft : snapshot;
}
