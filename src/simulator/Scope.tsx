"use client";
import GroundRouteOverlay, {GroundHoldLabels} from "./GroundRouteOverlay";
import GroundRouteEditor, {useGroundRoute, type SendGroundClearance, type PlanGroundTaxi} from "./GroundRouteEditor";
import {canRouteGround, destinationAt, groundRouteKind, hitGroundRoute, snapGroundControl} from "./ground-route";
import {planParkingRoute} from "./taxi-routing";
import type {MapCamera} from "./scope-camera";
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import AircraftSymbol from "./AircraftSymbol";
import {Gear} from "@phosphor-icons/react/dist/csr/Gear";
import {MagnifyingGlassPlus} from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus";
import {MagnifyingGlassMinus} from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus";
import {Crosshair} from "@phosphor-icons/react/dist/csr/Crosshair";
import {distance, engineFor} from "./engine";
import {defaultAirport, runwayEnds} from "./airports";
import {aircraftTagVisible, EXERCISE_WEATHER, type Airport, type Aircraft, type Frequency, type GroundRoute, type Point, type TaxiPoint, type RadarEnvironment} from "./model";
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
import {IF_COLORS, IF_MAP_COLORS} from "./if-colors";
import {aircraftAppearance} from "./aircraft-flashing";
import {atisRunwayWind} from "./atis-options";
import {gateAtPoint, type GateTarget} from "./gate-placement";
import {scopeFollowTarget, scopeNavigationFixes} from "./scope-overlays";
import {hitFixSymbol, layoutFixLabels, projectFixSymbols} from "./scope-fix-labels";
import {drawCompassRoses, projectCompassRoses} from "./navigation-roses";
import {drawNavigationSymbol} from "./navigation-symbols";
import type {ScopeContext} from "./MentorContextMenu";
import {useNavigationCatalog} from "./use-navigation-catalog";
import {radarEnvironmentFor} from "./radar";
import {holdingPattern} from "./holding";
import {useScopeCamera} from "./use-scope-camera";
import {initialOptions, scopeOptionRows, trafficFilters, toggleTrafficFilter, trafficVisible} from "./scope-options";
import {facilities, localPoint, insideAirspace} from "./aviation";
import {useScopeMapData} from "./use-scope-map-data";
import {windAltitudeChoices, windAtAltitude, type ScopeMapData, type ScopeWinds} from "./scope-map-data";
import {hitAirports, procedureKey, procedureColor, visibleProcedures, type AirportProcedure, type AirportProcedures, type ScopeAirport} from "./airport-display";
import AirportDetails, {AirportPopup} from "./AirportPanels";
import {useAirportDisplay} from "./use-airport-display";
import ScopeProcedures from "./ScopeProcedures";

export {initialOptions, trafficVisible} from "./scope-options";
export type {ScopeOptions} from "./scope-options";
const runwayWindColors = {headwind: "#90ee90", crosswind: "#ffa500", tailwind: "#ff0000"};
const iconFlashClasses = {pending: styles.pendingAircraft, reminder: styles.reminderAircraft, extended: styles.extendedAircraftPulse};
const labelFlashClasses = {pending: styles.pendingAircraftLabel, reminder: styles.reminderAircraftLabel, extended: styles.extendedAircraftLabel};
interface Props {missingStripControls?: readonly string[]; elapsed?: number; openStripId?: string; onGroundClearance?: SendGroundClearance; sentGroundRoute?: GroundRoute; groundRouteCleared?: boolean; cameraStore?: Map<string, MapCamera>; cameraKey?: string; weather?: import("./model").ExerciseWeather;conflictTags?: Record<string, string>; conflictTargets?: readonly string[]; focusRequest?: {id: string; serial: number}; measureVectors?: boolean; onScopeContextMenu?: (target: ScopeContext) => void; showProjectedPaths?: boolean; gates?: readonly GateTarget[]; selectedGate?: string; onGateSelect?: (gateId: string) => void; onGateDrop?: (aircraftId: string, gateId: string) => void; airport?: Airport; radarEnvironment?: RadarEnvironment; radarMode?: "approach" | "center"; onVector?: (aircraftId: string, heading: number, release: Point, target?: VectorTarget) => void; contextPoint?: Point; onTagAngle?: (aircraftId: string, angle: number) => void; pendingAircraft?: readonly string[]; giveWayTargets?: readonly string[]; aircraft: Aircraft[]; running: boolean; autoReadback?: boolean; frequency: Frequency | "all"; selected: string | null; onSelect: (id: string | null) => void; onAirport?: () => void; onPoint?: (point: Point) => void; onTaxiPathEdit?: (aircraftId: string, path: TaxiPoint[], edit: TaxiPathEdit) => void; editMode?: string; context?: (aircraft: Aircraft, onPlanTaxi?: PlanGroundTaxi) => React.ReactNode}
type RouteDrag = {aircraftId: string; pointerId: number; path: TaxiPoint[]; edit: TaxiPathEdit; start: Point; moved: boolean};
export default function Scope({missingStripControls, elapsed = 0, openStripId, onGroundClearance, sentGroundRoute, groundRouteCleared, cameraStore, cameraKey = "scope", weather,conflictTags, conflictTargets, focusRequest, measureVectors = false, onScopeContextMenu, showProjectedPaths = true, airport = defaultAirport, radarEnvironment: configuredEnvironment, radarMode, onVector, contextPoint, onTagAngle, pendingAircraft, giveWayTargets, aircraft: snapshot, running, autoReadback = false, frequency, selected, onSelect, onPoint, onTaxiPathEdit, editMode, context, gates, selectedGate, onGateSelect, onGateDrop}: Props) {
  const AIRPORT = airport;
  const mapLayers = useScopeMapData<ScopeMapData>(airport.icao, "map", true);
  const vectorEnabled = measureVectors || !!onVector;
  const navigation = useNavigationCatalog(airport.icao);
  const catalogueFixes = useMemo(() => {
    const beacons = mapLayers.data?.navaids ?? [];
    const fixes = navigation.catalog?.fixes.map(fix => {
      const beacon = beacons.find(b => b.id === fix.name && distance(b.point, fix.point) < .01);
      return {id: fix.name, point: fix.point, waypointType: fix.point.waypointType ?? beacon?.waypointType, vorType: fix.point.vorType ?? beacon?.vorType, slavedVariation: fix.point.slavedVariation};
    }) ?? [];
    return [...fixes, ...beacons.filter(b => !fixes.some(f => f.id === b.id && distance(f.point, b.point) < .01))];
  }, [navigation.catalog, mapLayers.data]);
  const radarEnvironment = useMemo(() => radarMode ? {...(configuredEnvironment ?? radarEnvironmentFor(airport)),
    fixes: catalogueFixes} : configuredEnvironment,
  [radarMode, configuredEnvironment, airport, catalogueFixes]);
  const {followedAircraft, headingProjection, patternOutline, projectedPath} = useMemo(() => engineFor({airport: airport.icao, airportDataVersion: airport.dataVersion, radarEnvironment, weather, traffic:snapshot}), [airport, radarEnvironment, weather, snapshot]);
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
  const separation = staffAlerts ? radarSeparationAlerts(aircraft, radarEnvironment, frequency, AIRPORT) : new Map<string, import("./radar-safety").SeparationAlert[]>();
  const terrainSamples = useAircraftTerrain(snapshot, airport, staffAlerts);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const trafficCanvas = useRef<HTMLCanvasElement>(null);
  const [scopeFontReady, setScopeFontReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Canvas does not redraw automatically when its web font finishes loading.
    Promise.all([document.fonts.load('400 12px "Simulator Fira"'), document.fonts.load('400 15px "Simulator Aircraft"', "\ue871\ue870\ue8e7\ue907")]).then(() => {if (active) setScopeFontReady(true);}).catch(() => {});
    return () => {active = false;};
  }, []);
  const routeDrag = useRef<RouteDrag | null>(null);
  const vectorDrag = useRef<{aircraftId: string; pointerId: number; start: Point; last: Point; selection: string | null; armed: boolean; timer?: ReturnType<typeof setTimeout>} | null>(null);
  const suppressClick = useRef(false);
  const routing = useGroundRoute(airport, snapshot, selected, !!onGroundClearance && frequency === "ground", onGroundClearance);
  const groundDrag = useRef<{pointerId: number; aircraftId: string; start: Point; last: Point; armed: boolean; started?: boolean; index?: number; timer?: ReturnType<typeof setTimeout>} | null>(null);
  const cancelGroundDrag = useCallback(() => {clearTimeout(groundDrag.current?.timer); groundDrag.current = null;}, []);
  useEffect(() => () => cancelGroundDrag(), [cancelGroundDrag]);
  const routingRef = useRef(routing); useEffect(() => {routingRef.current = routing;}, [routing]);
  const draftAircraft = routing.draft && snapshot.find(a => a.id === routing.draft!.aircraftId);
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
  const fitted = useRef(Boolean(cameraStore?.has(cameraKey)));
  const [size, setSize] = useState({width: 1000, height: 800});
  const [camera, setCamera] = useState<MapCamera>(() => cameraStore?.get(cameraKey) ?? {center: {x: 0, y: 0}, scale: 300});
  useEffect(() => {cameraStore?.set(cameraKey, camera);}, [cameraStore, cameraKey, camera]);
  const [options, setOptions] = useState(initialOptions);
  const winds = useScopeMapData<ScopeWinds>(airport.icao, "winds", options.windsAloft);
  const [windAltitude, setWindAltitude] = useState(-1);
  const [procedureOverlays, setProcedureOverlays] = useState<AirportProcedure[]>([]);
  const [procedureOpacity, setProcedureOpacity] = useState(1);
  const [airportView, setAirportView] = useState<{kind: "menu" | "details" | "procedures"; airports: ScopeAirport[]; point: Point} | null>(null);
  const airportSymbols = useMemo<ScopeAirport[]>(() => [{identifier: AIRPORT.icao, name: AIRPORT.name, elevationFeet: AIRPORT.elevation, point: {x: 0, y: 0},
    isTowered: mapLayers.data?.airports.find(item => item.identifier === AIRPORT.icao)?.isTowered ?? facilities.some(item => item.airport === AIRPORT.icao && item.type === "tower")},
    ...(mapLayers.data?.airports ?? []).filter(item => item.identifier !== AIRPORT.icao && (item.isTowered || options.uncontrolledAirports))], [AIRPORT, mapLayers.data, options.uncontrolledAirports]);
  const procedureData = useAirportDisplay<AirportProcedures>(airportView?.kind === "procedures" ? airportView.airports[0].identifier : undefined, "procedures", AIRPORT.icao);
  const displayProcedures = useMemo(() => visibleProcedures(procedureOverlays, airportView?.kind === "procedures" ? procedureData.data : undefined), [procedureOverlays, airportView?.kind, procedureData.data]);
  const closeAirport = useCallback(() => {setAirportView(null); container.current?.focus({preventScroll: true});}, [setAirportView]);
  const airspaces = useMemo(() => facilities.filter(facility => Array.isArray(facility.boundary)).map(facility => {
    const points = (facility.boundary as number[][]).map(([lon, lat]) => localPoint(airport, lat, lon));
    return {id: facility.id, points, left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y))};
  }), [airport]);
  const airspaceNames = useMemo(() => {
    const lat = airport.origin.lat + camera.center.y / 60, lon = airport.origin.lon + camera.center.x / (60 * Math.cos(airport.origin.lat * Math.PI / 180));
    return [...new Set(facilities.filter(f => insideAirspace(f.boundary, lat, lon)).map(f => `${f.name} Center`))];
  }, [airport, camera.center.x, camera.center.y]);
  const [revealedFixKey, setRevealedFixKey] = useState<string | null>(null);
  const [tap, setTap] = useState<{id: string; point: Point; choices: string[]} | null>(null);
  const selectedAircraft = snapshot.find(a => a.id === selected);
  const displayedWindAltitude = windAltitude < 0 ? Math.max(0, Math.floor((selectedAircraft?.altitude ?? 0) / 1000) * 1000) : windAltitude;
  const flightPlanAircraft = vectorDraft ? snapshot.find(a => a.id === vectorDraft.aircraftId) : selectedAircraft;
  const navigationFixes = useMemo(() => scopeNavigationFixes(catalogueFixes, flightPlanAircraft?.flightPlan, options.waypoints, options.navaids), [catalogueFixes, flightPlanAircraft?.flightPlan, options.waypoints, options.navaids]);
  const fixSymbols = useMemo(() => projectFixSymbols(navigationFixes, flightPlanAircraft?.flightPlan, camera, size), [navigationFixes, flightPlanAircraft?.flightPlan, camera, size]);
  const compassRoses = useMemo(() => projectCompassRoses(navigationFixes, camera, size), [navigationFixes, camera, size]);
  const revealedFix = fixSymbols.find(fix => fix.key === revealedFixKey);
  const [popup, setPopup] = useState<"options" | "hide" | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {if (event.key === "Escape") {if (event.target instanceof Element && event.target.closest("[data-airport-panel]")) container.current?.focus({preventScroll: true}); setAirportView(null); setPopup(null); setRevealedFixKey(null); suppressClick.current = !!vectorDrag.current || !!groundDrag.current; cancelVector(); cancelGroundDrag(); routingRef.current.cancel(); suppressTagClick.current = !!tagDrag.current?.moved; tagDrag.current = null; setTagDraft(null); routeDrag.current = null; setRouteDraft(null); setRouteNode(null); gateDrag.current = null; setGateDraft(null);}};
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [cancelVector, cancelGroundDrag]);
  const project = (p: Point) => ({x: size.width / 2 + (p.x - camera.center.x) * camera.scale, y: size.height / 2 - (p.y - camera.center.y) * camera.scale});
  const openAirport = (airports: ScopeAirport[], point: Point) => {setAirportView({kind: "menu", airports, point}); setPopup(null); setRevealedFixKey(null); setTap(null); onSelect(null);};
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
  const zoom = (factor: number) => {if (!vectorDrag.current && !groundDrag.current && !tagDrag.current && !routeDrag.current && !gateDrag.current) navigationCamera.zoom(factor);};
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = (width: number, height: number) => {
      setSize(previous => previous.width === width && previous.height === height ? previous : {width, height});
      if (!fitted.current) {fitted.current = true; navigationCamera.reset(airportCamera(width, height, frequency === "all"));}
    };
    const bounds = node.getBoundingClientRect(); measure(bounds.width, bounds.height);
    const resize = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height));
    resize.observe(node);
    const blocked = (event: Event) => event.target instanceof Element && !!event.target.closest(`.${styles.contextAnchor}, .${styles.optionsMenu}, [data-airport-panel], .${styles.scopeButtons}, .${styles.groundRouteEditor}`);
    const manipulatingAircraft = () => !!(routeDrag.current || vectorDrag.current || groundDrag.current || tagDrag.current || gateDrag.current);
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
  useLayoutEffect(() => {
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
    if (options.airspaces) for (const airspace of airspaces) {
      const halfWidth = size.width / camera.scale / 2, halfHeight = size.height / camera.scale / 2;
      if (airspace.right < camera.center.x - halfWidth || airspace.left > camera.center.x + halfWidth || airspace.top < camera.center.y - halfHeight || airspace.bottom > camera.center.y + halfHeight) continue;
      path([...airspace.points, airspace.points[0]], "#326d7e", 1);
    }
    ctx.save(); ctx.globalAlpha = procedureOpacity;
    for (const overlay of displayProcedures) for (const route of overlay.routes) {
      const color = procedureColor(overlay);
      path(route.points, color, 1.5); ctx.fillStyle = color;
      for (const point of route.points) {const at = screen(point); ctx.fillRect(at.x - 2, at.y - 2, 4, 4); if (point.name) ctx.fillText(point.name, at.x + 5, at.y - 5);}
    }
    ctx.restore();
    for (const item of mapLayers.data?.airports ?? []) {
      if (item.identifier === AIRPORT.icao || !item.isTowered && !options.uncontrolledAirports) continue;
      const p = screen(item.point); if (p.x < 0 || p.x > size.width || p.y < 0 || p.y > size.height) continue;
      ctx.save(); ctx.font = '20px "Simulator Aircraft"'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = item.isTowered ? "#2D81F9" : "#EF00FC"; ctx.fillText("\ue84a", p.x, p.y);
      ctx.fillStyle = "#000"; ctx.fillText("\ue851", p.x, p.y);
      ctx.font = '12px "Simulator Fira", sans-serif'; ctx.fillStyle = "#fff"; ctx.shadowColor = "#000"; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
      ctx.fillText(item.identifier, p.x, p.y + 20); ctx.restore();
    }
    if (options.windsAloft) for (const profile of winds.data?.points ?? []) {
      const wind = windAtAltitude(profile, displayedWindAltitude); if (!wind) continue;
      const p = screen(profile.point); if (p.x < 20 || p.x > size.width - 20 || p.y < 20 || p.y > size.height - 20) continue;
      const angle = wind.direction * Math.PI / 180, dx = Math.sin(angle), dy = -Math.cos(angle);
      ctx.strokeStyle = "#8ad6b4"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(p.x - dx * 12, p.y - dy * 12); ctx.lineTo(p.x + dx * 12, p.y + dy * 12);
      const feathers = Math.min(10, Math.round(wind.speed / 10));
      for (let feather = 0; feather < feathers; feather++) {const offset = 12 - feather * 3; ctx.moveTo(p.x + dx * offset, p.y + dy * offset); ctx.lineTo(p.x + dx * (offset - 3) - dy * 7, p.y + dy * (offset - 3) + dx * 7);}
      ctx.stroke();
    }
    {
      ctx.save();
      drawCompassRoses(ctx, compassRoses);
      for (const fix of fixSymbols) drawNavigationSymbol(ctx, fix);
      ctx.font = '12px "Simulator Fira", sans-serif';
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = "#fff"; ctx.shadowColor = "#000"; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
      for (const label of layoutFixLabels(fixSymbols, size, name => ctx.measureText(name).width, "all")) ctx.fillText(label.symbol.id, label.x, label.y);
      ctx.restore();
    }
    for (const feature of AIRPORT.features) {
      if (!options.taxiways && feature.kind !== "runway") continue;
      const runway = feature.kind === "runway";
      path(feature.points, runway ? IF_MAP_COLORS.runway : ["apron", "terminal", "hangar"].includes(feature.kind) ? "#656565" : IF_MAP_COLORS.taxiway, runway ? 2 : 1);
    }
    // The active airport's approach guides remain visible in IF when the
    // Approaches switch hides background-airport approach vectors.
    for (const {id} of runwayEnds(AIRPORT)) {
      const g = approachGuide(id, airport);
      path([g.threshold, g.left, g.right, g.threshold], g.color, 1.5);
      path([g.threshold, g.center], g.centerColor, 1.5);
    }
    if (options.approaches) for (const approach of radarEnvironment?.approaches ?? []) {
      if (!approach.airportIcao || approach.airportIcao === AIRPORT.icao || approach.type === "visual" || !approach.threshold || !approach.departure) continue;
      const heading = Math.atan2(approach.departure.x - approach.threshold.x, approach.departure.y - approach.threshold.y), dx = Math.sin(heading), dy = Math.cos(heading);
      const center = {x: approach.threshold.x - dx * 11, y: approach.threshold.y - dy * 11};
      path([approach.threshold, {x: center.x + dy * .5, y: center.y - dx * .5}, {x: center.x - dy * .5, y: center.y + dx * .5}, approach.threshold], approach.type === "ils" ? "#dc6464" : "#808080", 1.5);
    }
  }, [scopeFontReady, camera, size, options, AIRPORT, airport, radarMode, radarEnvironment, fixSymbols, compassRoses, airspaces, mapLayers.data, winds.data, displayedWindAltitude, displayProcedures, procedureOpacity]);
  const taxiAircraft = selectedAircraft && (frequency === "all" || frequency === "ground" && selectedAircraft.frequency === frequency) && taxiPathEditable(selectedAircraft) ? selectedAircraft : undefined;
  const routeEditable = !!taxiAircraft && !!onTaxiPathEdit && editMode !== "position" && editMode !== "flightPlan";
  const taxiPreview = taxiAircraft && routeDraft?.aircraftId === taxiAircraft.id ? {...taxiAircraft, ...(taxiAircraft.runwayExit ? {runwayExit: editedTaxiPath(routeDraft.path, routeDraft.edit)} : {taxiPath: editedTaxiPath(routeDraft.path, routeDraft.edit)})} : taxiAircraft;
  const arrivalRoute = frequency === "all" && taxiPreview && (taxiPreview.runwayExit || taxiPreview.arrivalExit) ? remainingTaxiPath(taxiPreview) : undefined;
  const taxiLine = arrivalRoute ?? (sentGroundRoute || groundRouteCleared || editMode === "taxi" || editMode === "taxi-preview" ? sentGroundRoute?.points ?? (taxiPreview ? taxiPreview.mode === "pushback" && taxiPreview.pushback ? [taxiPreview.position, ...taxiPreview.pushback.path.slice(taxiPreview.pushback.index)] : remainingTaxiPath(taxiPreview).length > 1 ? remainingTaxiPath(taxiPreview) : [] : []) : []);
  const routeState = taxiPreview ? taxiPathState(taxiPreview) : undefined;
  const nodeIndex = routeDraft?.aircraftId === selected ? routeDraft.edit.index : routeNode?.aircraftId === selected ? routeNode.index : routeHover?.kind === "move" ? routeHover.index : undefined;
  const routeHandle = routeEditable && routeState && nodeIndex !== undefined && nodeIndex >= routeState.index ? routeState.path[nodeIndex] : undefined;
  const projection = useMemo(() => {
    const a = snapshot.find(a => a.id === selected);
    return a && showProjectedPaths && frequency === "all" && remainingTaxiPath(a).length < 2 ? projectedPath(a, 120, snapshot, autoReadback) : [];
  }, [snapshot, selected, frequency, autoReadback, projectedPath, showProjectedPaths]);
  const following = frequency === "all" ? scopeFollowTarget(snapshot, aircraft, selected, followedAircraft) : undefined;
  useLayoutEffect(() => {
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
      if (!trafficVisible(a, options.filter, frequency)) continue;
      if (options.trails && (frequency === "all" || !options.frequencyTrails || a.frequency === frequency)) path([...a.trail, a.position], "#808080", 1, true);
      path(headingProjection(a), IF_COLORS.text, 1.5);
      if (a.id === flightPlanAircraft?.id && !["parked", "taxi", "lineup", "rollout"].includes(a.mode)) path(a.flightPlan, IF_MAP_COLORS.flightPlan, 1.5);
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
    const choices = context && frequency !== "all" && event.detail ? aircraft.filter(other => trafficVisible(other, options.filter, frequency) && distance(project(other.position), at) < 24).map(other => other.id) : [];
    setTap({id: a.id, point, choices: choices.length > 1 ? choices : []});
    onSelect(a.id); setPopup(null); setAirportView(null);
  };
  const aircraftContext = selectedAircraft && !vectorDraft && !routing.draft && context ? context(selectedAircraft, onGroundClearance && frequency === "ground" ? runway => {
    const end = runwayEnds(airport).find(end => end.id === runway);
    const point = end?.point ?? planParkingRoute(airport, selectedAircraft.position, selectedAircraft.intentions?.parkingStand).path?.at(-1);
    if (point) routing.start(selectedAircraft, point, end ? {type: "runway", id: end.id} : destinationAt(airport, point), "taxi");
  } : undefined) : null;
  const alertBoxes: {x: number; top: number; height: number}[] = [];
  return <div data-simulator-tour="radar" className={styles.scope} ref={container} tabIndex={-1} onDragStart={event => {if (!(event.target instanceof Element) || !event.target.closest('input,textarea,[contenteditable="true"]')) event.preventDefault();}} aria-label={`${AIRPORT.icao} radar scope`} onContextMenu={event => {if (!onScopeContextMenu || (event.target as HTMLElement).closest("button,input,select,a,[data-airport-panel]")) return; event.preventDefault(); onScopeContextMenu({point: vectorPoint(event), screen: {x: event.clientX, y: event.clientY}});}} onPointerDownCapture={event => {navigationCamera.stop(); if (!event.isPrimary) {cancelVector(); cancelTag(); cancelGate(); cancelGroundDrag();}}}>
    <div className={styles.mapSurface} style={routeEditable && routeHover ? {cursor: "crosshair"} : undefined} onPointerDown={event => {
      if (event.button !== 0 || vectorDrag.current) return;
      if (routing.draft?.route && !routing.busy && !groundDrag.current) {
        const hit = hitGroundRoute(routing.draft.route, pointAt(event), 14 / camera.scale);
        if (hit) {
          event.currentTarget.setPointerCapture(event.pointerId);
          if (hit.insert) routing.move(hit.index, snapGroundControl(airport, pointAt(event), 25 / camera.scale), true);
          groundDrag.current = {pointerId: event.pointerId, aircraftId: routing.draft.aircraftId, index: hit.index, start: {x: event.clientX, y: event.clientY}, last: {x: event.clientX, y: event.clientY}, armed: true};
          return;
        }
      }
      if (groundDrag.current && groundDrag.current.index === undefined) {const bounds = event.currentTarget.getBoundingClientRect(); navigationCamera.down(event.pointerId, {x: event.clientX - bounds.left, y: event.clientY - bounds.top}, event.pointerType, true); return;}
      setRevealedFixKey(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      const bounds = event.currentTarget.getBoundingClientRect();
      navigationCamera.down(event.pointerId, {x: event.clientX - bounds.left, y: event.clientY - bounds.top}, event.pointerType, !editMode);
      if (navigationCamera.motion.pointers.size > 1) {routeDrag.current = null; setRouteDraft(null); return;}
      const hit = routeEditable && taxiAircraft ? hitTaxiPath(taxiAircraft, pointAt(event), 11 / camera.scale) : undefined;
      if (hit && taxiAircraft) {routeDrag.current = {aircraftId: taxiAircraft.id, pointerId: event.pointerId, path: taxiPathState(taxiAircraft).path.map(p => ({...p})), edit: hit, start: {x: event.clientX, y: event.clientY}, moved: false}; if (hit.kind === "move") setRouteNode({aircraftId: taxiAircraft.id, index: hit.index});}
    }}
      onPointerMove={event => {
        if (groundDrag.current?.armed) {
          const drag = groundDrag.current; if (drag.pointerId === event.pointerId && drag.index !== undefined) routing.move(drag.index, snapGroundControl(airport, pointAt(event), 25 / camera.scale));
          return;
        }
        if (vectorDrag.current) return;
        const previous = navigationCamera.motion.pointers.get(event.pointerId);
        if (!previous) {
          const hit = routeEditable && taxiAircraft ? hitTaxiPath(taxiAircraft, pointAt(event), 11 / camera.scale) : undefined;
          setRouteHover(current => current?.index === hit?.index && current?.kind === hit?.kind ? current : hit);
          const bounds = event.currentTarget.getBoundingClientRect();
          setRevealedFixKey(!editMode ? hitFixSymbol(fixSymbols, {x: event.clientX - bounds.left, y: event.clientY - bounds.top})?.key ?? null : null);
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
        if (groundDrag.current?.pointerId === event.pointerId && groundDrag.current.armed) {cancelGroundDrag(); navigationCamera.cancel(event.pointerId); return;}
        const current = routeDrag.current;
        const tapped = current ? (navigationCamera.cancel(event.pointerId), false) : navigationCamera.up(event.pointerId);
        if (current?.pointerId === event.pointerId) {
          if (current.moved && current.aircraftId === selected && routeEditable) {onTaxiPathEdit?.(current.aircraftId, current.path, {...current.edit, point: pointAt(event)}); setRouteNode({aircraftId: current.aircraftId, index: current.edit.index});}
          routeDrag.current = null; setRouteDraft(null); setRouteHover(undefined);
        } else if (tapped && !routing.draft) {
          setRouteNode(null);
          const bounds = event.currentTarget.getBoundingClientRect();
          const fix = !editMode ? hitFixSymbol(fixSymbols, {x: event.clientX - bounds.left, y: event.clientY - bounds.top}, event.pointerType === "touch" ? 22 : 12) : undefined;
          const point = {x: event.clientX - bounds.left, y: event.clientY - bounds.top};
          const airports = !editMode ? hitAirports(airportSymbols, point, project) : [];
          if (airports.length) openAirport(airports, point);
          else if (fix) {setRevealedFixKey(fix.key); setPopup(null);}
          else if (!routing.draft && onPoint && editMode) onPoint(pointAt(event));
          else if (!routing.draft) {onSelect(null); setPopup(null);}
        }
      }} onPointerCancel={event => {navigationCamera.cancel(event.pointerId); cancelGroundDrag(); routeDrag.current = null; setRouteDraft(null);}}
      onLostPointerCapture={event => {navigationCamera.cancel(event.pointerId); cancelGroundDrag(); routeDrag.current = null; setRouteDraft(null);}}
      onPointerLeave={event => {setRouteHover(undefined); if (event.pointerType !== "touch") setRevealedFixKey(null);}}><canvas ref={canvas} className={styles.mapCanvas}/><canvas ref={trafficCanvas} className={`${styles.mapCanvas} ${styles.trafficCanvas}`}/>
      {radarMode ? <svg className={styles.holdOverlay} width={size.width} height={size.height} aria-label="Holding patterns">{aircraft.filter(a => trafficVisible(a, options.filter, frequency) && a.atcManeuver?.kind === "hold").map(a => <polyline key={a.id} role="img" aria-label={`${a.callsign} holding pattern${a.atcManeuver?.fixName ? ` at ${a.atcManeuver.fixName}` : ""}`} points={holdingPattern(a).map(p => {const s = project(p); return `${s.x.toFixed(2)},${s.y.toFixed(2)}`;}).join(" ")} fill="none" stroke={IF_COLORS.warning} strokeWidth="2" strokeLinejoin="round"/>)}</svg> : null}
      {routing.draft?.route ? <GroundRouteOverlay airport={airport} route={routing.draft.route} aircraftType={draftAircraft?.type} project={project} scale={camera.scale} bounds={size} onMove={(index, point) => routing.move(index, snapGroundControl(airport, point, 25 / camera.scale))}/> : null}
      {taxiAircraft && taxiLine.length > 1 ? <svg className={styles.taxiRouteOverlay} width={size.width} height={size.height} role="group" aria-label={`${taxiAircraft.callsign} taxi route`}>
        <polyline points={taxiLine.map(p => {const s = project(p); return `${s.x},${s.y}`;}).join(" ")} fill="none" stroke="#000" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points={taxiLine.map(p => {const s = project(p); return `${s.x},${s.y}`;}).join(" ")} fill="none" stroke={IF_COLORS.cleared} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        {!routing.draft ? taxiLine.map((p, i) => i === 0 || i === taxiLine.length - 1 || "hold" in p && p.hold || "name" in p && p.name && p.name !== (taxiLine[i - 1] as TaxiPoint).name ? <circle key={`sent-point-${i}`} cx={project(p).x} cy={project(p).y} r="3" fill="none" stroke={IF_COLORS.cleared} strokeWidth="2"/> : null) : null}
        {routeHandle && nodeIndex !== undefined ? <circle className={styles.taxiWaypoint} cx={project(routeHandle).x} cy={project(routeHandle).y} r="7" fill={routeHandle.hold ? "#ff8e8e" : IF_COLORS.cleared} stroke="#14251b" strokeWidth="2" role="button" tabIndex={0} aria-label={`Taxi waypoint ${nodeIndex + 1}${routeHandle.hold ? ", hold short" : ""}`} onFocus={() => setRouteNode({aircraftId: taxiAircraft.id, index: nodeIndex})} onKeyDown={event => {
          const offsets: Record<string, Point> = {ArrowLeft: {x: -1, y: 0}, ArrowRight: {x: 1, y: 0}, ArrowUp: {x: 0, y: 1}, ArrowDown: {x: 0, y: -1}};
          const offset = offsets[event.key]; if (!offset || !onTaxiPathEdit) return; event.preventDefault();
          const step = (event.shiftKey ? 50 : 10) / camera.scale;
          onTaxiPathEdit(taxiAircraft.id, taxiPathState(taxiAircraft).path.map(p => ({...p})), {kind: "move", index: nodeIndex, point: {x: routeHandle.x + offset.x * step, y: routeHandle.y + offset.y * step}});
        }}><title>Drag to move this waypoint. Arrow keys adjust it; Shift moves farther.</title></circle> : null}
      </svg> : null}
      {!routing.draft && taxiLine.length > 1 ? <GroundHoldLabels points={taxiLine} project={project}/> : null}</div>
    {gates?.map(gate => {const p = project(gate.point); if (p.x < 0 || p.x > size.width || p.y < 0 || p.y > size.height) return null; return <button key={gate.id} type="button" className={`${styles.gateTarget} ${gateDraft?.gateId === gate.id ? styles.hoveredGate : ""}`} style={{left: p.x, top: p.y}} aria-label={gate.label} aria-pressed={selectedGate === gate.id} title={gate.label} onClick={event => onGateSelect?.(event.detail && gates ? gateAtPoint(gates, vectorPoint(event), 24 / camera.scale)?.id ?? gate.id : gate.id)}><span/></button>;})}
    {draftAircraft ? <GroundRouteEditor airport={airport} aircraft={draftAircraft} routing={routing}/> : onGroundClearance && frequency === "ground" && selectedAircraft && selectedAircraft.frequency === frequency && canRouteGround(selectedAircraft, airport) ? <button className={styles.groundRouteLauncher} onClick={() => {
      const end = runwayEnds(airport).find(end => end.id === (selectedAircraft.departureRunway ?? selectedAircraft.runway));
      const destination = groundRouteKind(selectedAircraft, airport) === "taxi" ? end?.point : selectedAircraft.taxiPath.find(point => distance(point, selectedAircraft.position) > .01);
      routing.start(selectedAircraft, destination ?? selectedAircraft.position);
    }}>Plan ground route</button> : null}
    {gateDraft ? <span className={styles.gatePlacementHint} role="status">{gateDraft.gateId ? `Release to place at ${gates?.find(gate => gate.id === gateDraft.gateId)?.label}` : "Drag onto a blue gate dot · Escape to cancel"}</span> : null}
    {runwayEnds(AIRPORT).map(end => {const p = project(end.point), color = runwayWindColors[atisRunwayWind(end.heading, weather ?? EXERCISE_WEATHER)]; return <span key={end.id} className={styles.runwayTag} style={{left: p.x, top: p.y, color, borderColor: color}}>{end.id}</span>;})}
    <button className={styles.airportMarker} style={{left: project({x: 0, y: 0}).x, top: project({x: 0, y: 0}).y}} aria-label={`${AIRPORT.icao} airport information`} onClick={event => {
      const bounds = container.current!.getBoundingClientRect(), point = event.detail ? {x: event.clientX - bounds.left, y: event.clientY - bounds.top} : project({x: 0, y: 0});
      const choices = hitAirports(airportSymbols, point, project);
      openAirport(choices.length ? choices : [airportSymbols[0]], point);
    }}><span>{AIRPORT.icao}</span><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M14 1v5m0 16v5M1 14h5m16 0h5" stroke="currentColor" strokeWidth="2"/><circle cx="14" cy="14" r="5" fill="#90ee90"/></svg></button>
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
    {aircraft.filter(a => trafficVisible(a, options.filter, frequency)).map(a => {
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
      const appearance = aircraftAppearance(a, frequency, {selected: a.id === selected, open: a.id === openStripId, hasStripControl: !missingStripControls?.includes(a.id), pending: pendingAircraft?.includes(a.id), reminder: a.reminderAt !== null && a.reminderAt <= elapsed, dragging: tagDraft?.aircraftId === a.id, alert: conflicts.length ? conflicts.some(c => c.level !== "warning") ? "alert" : "warning" : undefined});
      const color = appearance.iconColor, tagColor = appearance.textColor;
      const labelStyle={color:tagColor,backgroundColor:"transparent","--label-steady":tagColor} as React.CSSProperties;
      const label = radarFlightLabel(a, AIRPORT, radarEnvironment);
      const holding = a.atcManeuver?.kind === "hold";
      const tagAngle = tagDraft?.aircraftId === a.id ? tagDraft.angle : a.tagAngle;
      const tagOffset = tagAngle === undefined ? {x: a.tag === "left" ? -28 : 28, y: -25} : {x: Math.cos(tagAngle * Math.PI / 180) * Math.hypot(28, 25), y: Math.sin(tagAngle * Math.PI / 180) * Math.hypot(28, 25)};
      return <div key={a.id} className={styles.aircraftPosition} style={{left: 0, top: 0, transform: `translate(${p.x}px, ${p.y}px)`, color, "--aircraft-steady": color} as React.CSSProperties}>
        {giveWayTargets?.includes(a.id) ? <span className={styles.giveWayTarget} role="img" aria-label={`Likely give-way traffic: ${a.callsign}`}/> : null}
        {busting ? <div className={styles.bustingRing} role="status" aria-label={`Busting ${a.callsign}`}><div className={styles.bustingTag} style={{bottom: `calc(100% + ${alertOffset}px)`}}>{conflicts.map(alert => <span key={alert.otherId}>{separationLabel(alert)}</span>)}{agl !== undefined ? <span>{Math.floor(agl)}ft AGL</span> : null}</div></div> : null}
        <button data-scope-aircraft={a.id} aria-label={`Select ${a.callsign}`} title={gates?.length && selected === a.id ? "Drag to a blue gate dot" : undefined} className={`${styles.aircraft} ${appearance.iconFlash ? iconFlashClasses[appearance.iconFlash] : ""} ${openStripId === a.id ? styles.extendedAircraftIndicator : selected === a.id ? styles.selectedAircraft : ""} ${conflictTargets?.includes(a.id) ? styles.conflictTarget : ""} ${gates?.length && selected === a.id ? styles.gateAircraft : ""}`} onContextMenu={event => {if (onScopeContextMenu) {event.preventDefault(); event.stopPropagation(); onScopeContextMenu({point: vectorPoint(event), screen: {x: event.clientX, y: event.clientY}, aircraftId: a.id});} else if (onVector) event.preventDefault();}}
          onPointerDown={event => {
            suppressClick.current = false;
            if (onGroundClearance && frequency === "ground" && a.frequency === frequency && canRouteGround(a, airport) && event.button === 0 && event.isPrimary && !routing.busy) {
              cancelGroundDrag(); event.currentTarget.setPointerCapture(event.pointerId);
              const drag: NonNullable<typeof groundDrag.current> = {pointerId: event.pointerId, aircraftId: a.id, start: {x: event.clientX, y: event.clientY}, last: {x: event.clientX, y: event.clientY}, armed: false};
              groundDrag.current = drag;
              drag.timer = setTimeout(() => {if (groundDrag.current === drag) drag.armed = true;}, VECTOR_HOLD_MS);
              return;
            }
            if (onGateDrop && gates?.length && a.id === selected && !running && event.button === 0 && event.isPrimary) {event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); gateDrag.current = {aircraftId: a.id, pointerId: event.pointerId, start: {x: event.clientX, y: event.clientY}, moved: false}; return;}
            if (!vectorEnabled || event.button !== 0 || !event.isPrimary || !measureVectors && (a.frequency !== frequency || a.radar?.transferred) || !airborne(a, airport)) return;
            cancelVector();
            event.currentTarget.setPointerCapture(event.pointerId);
            const start = {x: event.clientX, y: event.clientY};
            const current: NonNullable<typeof vectorDrag.current> = {aircraftId: a.id, pointerId: event.pointerId, start, last: start, selection: selected, armed: false};
            vectorDrag.current = current;
            current.timer = setTimeout(() => {
              if (vectorDrag.current !== current) return;
              current.armed = true;
            }, VECTOR_HOLD_MS);
          }}
          onPointerMove={event => {
            const drag = groundDrag.current;
            if (drag?.pointerId === event.pointerId) {
              drag.last = {x: event.clientX, y: event.clientY};
              if (!drag.armed) {if (distance(drag.start, drag.last) > 20) {suppressClick.current = true; cancelGroundDrag();} return;}
              const point = vectorPoint(event);
              if (!drag.started && !outsideVectorCircle(a.position, point, camera.scale)) return;
              event.stopPropagation(); suppressClick.current = true;
              if (!drag.started) {drag.started = true; onSelect(a.id); setPopup(null); routing.start(a, point);}
              else routing.move(1, point);
              return;
            }
            const placement = gateDrag.current;
            if (placement?.pointerId === event.pointerId && gates) {event.stopPropagation(); if (!placement.moved && distance(placement.start, {x: event.clientX, y: event.clientY}) < 4) return; placement.moved = true; const point = vectorPoint(event); setGateDraft({aircraftId: a.id, point, gateId: gateAtPoint(gates, point, 24 / camera.scale)?.id}); return;}
            const current = vectorDrag.current;
            if (!current || current.pointerId !== event.pointerId || !vectorEnabled) return;
            current.last = {x: event.clientX, y: event.clientY};
            if (!current.armed) {
              if (distance(current.start, current.last) > 20) {suppressClick.current = true; cancelVector();}
              return;
            }
            const point = vectorPoint(event);
            if (outsideVectorCircle(a.position, point, camera.scale) || suppressClick.current) {
              suppressClick.current = true; setPopup(null); setRevealedFixKey(null);
              setVectorDraft({aircraftId: a.id, point});
            }
          }}
          onPointerUp={event => {
            const drag = groundDrag.current;
            if (drag?.pointerId === event.pointerId) {if (drag.started) {event.stopPropagation(); navigationCamera.cancel(event.pointerId); suppressClick.current = true; const point = vectorPoint(event); if (outsideVectorCircle(a.position, point, camera.scale)) routing.choose(point, destinationAt(airport, point));} cancelGroundDrag(); return;}
            const placement = gateDrag.current;
            if (placement?.pointerId === event.pointerId) {event.stopPropagation(); if (placement.moved) {suppressClick.current = true; const gate = gates && gateAtPoint(gates, vectorPoint(event), 24 / camera.scale); if (gate && placement.aircraftId === selected) onGateDrop?.(placement.aircraftId, gate.id);} cancelGate(); return;}
            const current = vectorDrag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            if (current.armed && suppressClick.current) {
              suppressClick.current = true;
              const point = vectorPoint(event);
              if (!measureVectors && onVector && a.frequency === frequency && !a.radar?.transferred && airborne(a, airport) && outsideVectorCircle(a.position, point, camera.scale)) {
                const preview = vectorPreview(a, point, AIRPORT, radarEnvironment, camera.scale);
                onVector(a.id, preview.heading, {x: event.clientX, y: event.clientY}, preview.target);
              }
            }
            cancelVector();
          }}
          onPointerCancel={() => {suppressClick.current = true; cancelVector(); cancelGate(); cancelGroundDrag();}} onLostPointerCapture={() => {cancelVector(); cancelGate(); cancelGroundDrag();}}
          onClick={event => {if (suppressClick.current) {suppressClick.current = false; return;} selectAt(a, event);}}><AircraftSymbol type={a.type} heading={a.heading} /></button>
        {aircraftTagVisible(a, frequency, openStripId ?? selected) ? <>
          <svg className={styles.tagLeader} width="1" height="1" aria-hidden="true"><line x1="0" y1="0" x2={tagOffset.x} y2={tagOffset.y} stroke={IF_MAP_COLORS.labelLeader}/></svg>
          <button className={`${styles.aircraftTag} ${appearance.textFlash ? labelFlashClasses[appearance.textFlash] : ""}`} style={{...labelStyle, left: tagOffset.x, top: tagOffset.y, right: "auto", bottom: "auto", transform: `translate(${tagOffset.x < 0 ? "-100%" : "0"}, ${tagOffset.y < 0 ? "-100%" : "0"})`, textAlign: tagOffset.x < 0 ? "right" : "left"}}
            aria-label={`Flight label ${a.callsign}`}
            onPointerDown={event => {suppressTagClick.current = false; if (!onTagAngle || event.button !== 0 || !event.isPrimary) return; event.currentTarget.setPointerCapture(event.pointerId); tagDrag.current = {aircraftId: a.id, pointerId: event.pointerId, start: {x: event.clientX, y: event.clientY}, at: performance.now(), moved: false};}}
            onPointerMove={event => {const current = tagDrag.current; if (!current || current.pointerId !== event.pointerId || !onTagAngle) return; if (!current.moved && distance(current.start, {x: event.clientX, y: event.clientY}) < (event.pointerType === "touch" ? 12 : 8)) return; if (event.pointerType === "touch" && performance.now() - current.at < 180) {suppressTagClick.current = true; cancelTag(); return;} current.moved = true; const bounds = container.current!.getBoundingClientRect(); const angle = (Math.atan2(event.clientY - bounds.top - p.y, event.clientX - bounds.left - p.x) * 180 / Math.PI + 360) % 360; current.angle = angle; setTagDraft({aircraftId: a.id, angle});}}
            onPointerUp={event => {const current = tagDrag.current; if (!current || current.pointerId !== event.pointerId) return; if (current.moved) {suppressTagClick.current = true; if (current.angle !== undefined) onTagAngle?.(a.id, current.angle);} cancelTag();}}
            onPointerCancel={() => {suppressTagClick.current = true; cancelTag();}} onLostPointerCapture={cancelTag}
            onContextMenu={event => {event.preventDefault(); event.stopPropagation();}} onClick={event => {event.stopPropagation(); suppressTagClick.current = false;}}>{a.color ? <span className={styles.tagColorDot} style={{background: a.color}} aria-hidden="true"/> : null}{conflictTags?.[a.id] ? <span className={styles.conflictTag}>{conflictTags[a.id]}</span> : null}<span>{a.callsign}</span><span>{label.flight}</span>{label.approach || holding ? <span>{label.approach ?? "\u00a0"}</span> : null}{holding ? <span className={styles.holdStatus}>HOLD</span> : frequency === "all" && a.radar?.cleared ? <span>CLR</span> : null}</button>
        </> : null}
      </div>;
    })}
    <AircraftPopupPresence scope={container} onDismiss={dismissAircraftMenu} popup={aircraftContext && selectedAircraft ? {key: `${selectedAircraft.id}:${contextPoint?.x ?? tap?.point.x ?? "click"}:${contextPoint?.y ?? tap?.point.y ?? "click"}`, point: project(selectedAircraft.position), screenPoint: contextPoint ?? (tap?.id === selected ? tap.point : undefined), content: <>
      {tap?.id === selected && tap.choices.length > 1 ? <div className={`${styles.aircraftMenu} ${styles.radarQuick}`} role="menu" aria-label="Choose aircraft">{tap.choices.map(id => {const a = snapshot.find(item => item.id === id); return a ? <button key={id} role="menuitem" onClick={() => {setTap({...tap, id, choices: []}); onSelect(id);}}>{a.callsign}</button> : null;})}</div> : aircraftContext}
    </>} : null}/>
    {following && trafficVisible(following, options.filter, frequency) ? <span role="img" aria-label={`Traffic to follow: ${following.callsign}`} className={styles.followingRing} style={{left: project(following.position).x, top: project(following.position).y}}/> : null}
    {selectedAircraft && frequency === "all" && (showProjectedPaths || taxiLine.length > 1) ? <div className={styles.pathLegend}>{taxiLine.length > 1 ? <>Taxi route{routeEditable ? <><br/>Drag the green line to reshape · drag a waypoint to move it</> : null}</> : <>Projected path · {selectedAircraft.mode}<br/>{!selectedAircraft.radar && ["pattern", "takeoff", "lineup", "go-around", "rollout"].includes(selectedAircraft.mode) ? <>Solid: {selectedAircraft.hand} traffic · Dotted: {selectedAircraft.hand === "left" ? "right" : "left"} traffic{selectedAircraft.optionHand ? <><br/>After option: {selectedAircraft.optionHand} traffic</> : null}</> : null}</>}</div> : null}
    {editMode ? <div className={styles.editHint}>{editMode === "taxi-preview" ? "Taxi route · drag the green line to adjust" : editMode === "taxi" ? "Click to extend route · drag the line or a waypoint to reshape" : editMode === "flightPlan" ? "Click to add flight-plan waypoint" : "Click to reposition selected aircraft"}</div> : null}
    <div className={styles.scopeButtons}>
      <button aria-label="Scope options" aria-expanded={popup === "options" || popup === "hide"} onClick={() => {setAirportView(null); setPopup(popup === "options" || popup === "hide" ? null : "options");}}><Gear size={32} weight="fill"/></button>
      <button aria-label="Zoom in" onClick={() => zoom(1.4)}><MagnifyingGlassPlus size={32} weight="bold"/></button>
      <button aria-label="Zoom out" onClick={() => zoom(1 / 1.4)}><MagnifyingGlassMinus size={32} weight="bold"/></button>
      <button aria-label="Recenter airport" onClick={() => navigationCamera.reset(airportCamera(size.width, size.height, frequency === "all"))}><Crosshair size={32} weight="bold"/></button>
    </div>
    {popup === "options" ? <div className={styles.optionsMenu} role="menu" aria-label="Scope options">{scopeOptionRows.map(([key, label]) => <button key={key} role="menuitemcheckbox" aria-checked={options[key]} onClick={() => setOptions(o => ({...o, [key]: !o[key]}))}><span aria-hidden="true">{options[key] ? "✓" : ""}</span>{label}</button>)}<button role="menuitem" aria-haspopup="menu" onClick={() => setPopup("hide")}><span aria-hidden="true">{options.filter !== "none" ? "✓" : ""}</span>Hide Traffic <span className={styles.arrow} aria-hidden="true">›</span></button><button role="menuitemcheckbox" aria-checked={options.windsAloft} onClick={() => setOptions(o => ({...o, windsAloft: !o.windsAloft}))}><span aria-hidden="true">{options.windsAloft ? "✓" : ""}</span>Winds Aloft</button><button role="menuitem" onClick={() => {setProcedureOverlays([]); setPopup(null);}}><span aria-hidden="true">×</span>Clear All Procedures</button></div> : null}
    {revealedFix ? <span role="tooltip" className={styles.fixTooltip} style={{left: Math.max(6, Math.min(size.width - 130, revealedFix.x + 12)), top: Math.max(6, Math.min(size.height - 32, revealedFix.y - 30))}}>{revealedFix.id} · {revealedFix.route && !revealedFix.background ? "Flight plan" : revealedFix.kind === "fix" ? "Fix" : revealedFix.kind.toUpperCase()}</span> : null}
    {popup === "hide" ? <div className={styles.optionsMenu} role="menu" aria-label="Hide Traffic">{trafficFilters.map(([value, label]) => <button key={value} role="menuitemcheckbox" aria-checked={options.filter === value} onClick={() => {setOptions(o => ({...o, filter: toggleTrafficFilter(o.filter, value)})); setPopup(null);}}><span aria-hidden="true">{options.filter === value ? "✓" : ""}</span>{label}</button>)}</div> : null}
    {airportView?.kind === "menu" ? <AirportPopup airports={airportView.airports} point={airportView.point} size={size} weather={weather ?? EXERCISE_WEATHER} origin={AIRPORT.icao} environment={radarEnvironment}
      onInformation={airport => setAirportView({...airportView, kind: "details", airports: [airport]})} onProcedures={airport => setAirportView({...airportView, kind: "procedures", airports: [airport]})} onClose={closeAirport}/> : null}
    {airportView?.kind === "details" ? <AirportDetails key={airportView.airports[0].identifier} airport={airportView.airports[0]} origin={AIRPORT.icao} exerciseWeather={weather ?? EXERCISE_WEATHER} environment={radarEnvironment}
      onClose={closeAirport}/> : null}
    {airportView?.kind === "procedures" ? <ScopeProcedures key={airportView.airports[0].identifier} airport={airportView.airports[0].identifier} data={procedureData.data} error={procedureData.error} selected={procedureOverlays} opacity={procedureOpacity}
      onToggle={procedure => setProcedureOverlays(previous => previous.some(item => procedureKey(item) === procedureKey(procedure)) ? previous.filter(item => procedureKey(item) !== procedureKey(procedure)) : [...previous, procedure])}
      onClear={() => setProcedureOverlays(previous => previous.filter(item => item.airport !== airportView.airports[0].identifier))} onOpacity={setProcedureOpacity} onRetry={procedureData.retry} onClose={closeAirport}/> : null}
    {options.windsAloft ? <div className={styles.windsPanel}><label>WINDS<select aria-label="Winds Aloft altitude" value={windAltitude} onChange={event => setWindAltitude(Number(event.target.value))}>{windAltitudeChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{winds.data ? <small><a href={winds.data.source} target="_blank" rel="noreferrer">Open-Meteo</a> · {new Date(winds.data.validAt).toISOString().slice(11, 16)}Z forecast</small> : <small role="status">{winds.error ?? "Loading winds…"}{winds.error ? <button type="button" onClick={winds.retry}>Retry</button> : null}</small>}</div> : null}
    {options.airspaces && airspaceNames.length ? <div className={styles.airspaceLabel} aria-label="Airspaces">{airspaceNames.join(" · ")}</div> : null}
    {mapLayers.error ? <div className={styles.mapLayerStatus} role="status">Airport layer unavailable. <button type="button" onClick={mapLayers.retry}>Retry</button></div> : null}
    <span className={styles.attribution}><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>{radarMode ? <> · Terrain: InfiniteTerrain</> : null}</span>
    {terrainSamples.unavailable ? <span role="status" className={styles.terrainUnavailable}>Terrain data unavailable for {terrainSamples.unavailable} aircraft</span> : null}
    {(options.waypoints || options.navaids) && !navigation.catalog && !mapLayers.data?.navaids?.length ? <div className={styles.navigationStatus} role="status">{navigation.error ? <>Navigation fixes unavailable. <button type="button" onClick={navigation.retry}>Retry navigation</button></> : "Loading navigation fixes…"}</div> : null}
  </div>;
}
/** Both roles animate at the display's frame rate between authoritative motion
 * frames. A background staff tab's throttled timer no longer makes the mentee jump. */
function useRadarAircraft(snapshot: Aircraft[], running: boolean, autoReadback: boolean, airport: Airport, radarEnvironment?: RadarEnvironment, weather?: import("./model").ExerciseWeather) {
  const {predictAircraft} = useMemo(() => engineFor({airport: airport.icao, airportDataVersion: airport.dataVersion, radarEnvironment, weather, traffic:snapshot}), [airport, radarEnvironment, weather, snapshot]);
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
