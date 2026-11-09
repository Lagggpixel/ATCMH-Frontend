const $ = id => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
let data, result, airport, runway, zoom = 20, cursor = 0, playback, busy = false;
const fields = ["airport", "runway", "profile", "east", "north", "heading", "altitude", "speed", "windDirection", "windSpeed", "minutes", "tower"];
const number = id => Number($(id).value);
const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const rounded = (value, decimals = 0) => Number(value.toFixed(decimals));

function stop() {clearInterval(playback); playback = undefined; $("play").textContent = "▶"; $("play").setAttribute("aria-label", "Play simulation");}
function selectedMode() {return document.querySelector('input[name="mode"]:checked').value;}
function input() {return {airport: $("airport").value, runway: $("runway").value, profile: $("profile").value, mode: selectedMode(),
  east: number("east"), north: number("north"), heading: number("heading"), altitude: number("altitude"), speed: number("speed"),
  windDirection: number("windDirection"), windSpeed: number("windSpeed"), tower: $("tower").checked, minutes: number("minutes")};}

function refreshRunways() {
  airport = data.airports.find(item => item.icao === $("airport").value);
  const previous = $("runway").value;
  $("runway").replaceChildren(...airport.runways.map(item => new Option(item.id, item.id)));
  $("runway").value = airport.runways.some(item => item.id === previous) ? previous : airport.icao === "EGLL" ? "27L" : airport.runways[0].id;
  $("altitude").min = airport.elevation + 1;
  if (number("altitude") <= airport.elevation) $("altitude").value = airport.elevation + 1500;
  refreshRunway();
}
function refreshRunway() {
  runway = airport.runways.find(item => item.id === $("runway").value);
  $("map-title").replaceChildren(document.createTextNode(airport.icao + " "), Object.assign(document.createElement("span"), {textContent: "/"}), document.createTextNode(" " + runway.id));
}
function markDirty() {
  stop(); result = undefined; cursor = 0; $("play").disabled = true; $("timeline").disabled = true; $("timeline").value = 0;
  $("outcome").textContent = "Ready to simulate"; $("outcome-dot").className = "result-dot"; $("result-time").textContent = "";
  $("reason").textContent = "Settings changed. Run the simulation to update the path."; $("stage").textContent = "—";
  $("events").replaceChildren(Object.assign(document.createElement("span"), {className: "empty", textContent: "Events will appear after a run."}));
  $("play-time").textContent = "00:00"; $("duration").textContent = "00:00";
  ["read-alt", "read-speed", "read-heading"].forEach(id => $(id).textContent = "—");
  draw();
}
function element(name, attrs = {}, content) {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (content !== undefined) node.textContent = content;
  return node;
}
function draw() {
  if (!runway) return;
  const svg = $("map"), scale = 500 / zoom, origin = runway.threshold;
  const project = p => ({x: 500 + (p.x - origin.x) * scale, y: 350 - (p.y - origin.y) * scale});
  svg.replaceChildren();
  svg.append(element("rect", {width: 1000, height: 700, fill: "#0b171b"}));
  const spacing = zoom > 35 ? 10 : zoom > 15 ? 5 : zoom > 7 ? 2 : 1;
  for (let i = -Math.ceil(zoom / spacing); i <= Math.ceil(zoom / spacing); i++) {
    const n = i * spacing, x = 500 + n * scale, y = 350 - n * scale;
    svg.append(element("line", {x1: x, y1: 0, x2: x, y2: 700, stroke: "#1c3032", "stroke-width": 1}));
    svg.append(element("line", {x1: 0, y1: y, x2: 1000, y2: y, stroke: "#1c3032", "stroke-width": 1}));
  }
  for (const ring of [5, 10, 20, 40]) if (ring <= zoom * 1.3) {
    svg.append(element("circle", {cx: 500, cy: 350, r: ring * scale, fill: "none", stroke: "#294541", "stroke-width": 1, "stroke-dasharray": "4 8"}));
    svg.append(element("text", {x: 507 + ring * scale, y: 344, fill: "#607e7c", "font-size": 11}, `${ring} NM`));
  }
  const threshold = project(runway.threshold), departure = project(runway.departure);
  const dx = runway.departure.x - runway.threshold.x, dy = runway.departure.y - runway.threshold.y, length = Math.hypot(dx, dy);
  const ux = dx / length, uy = dy / length;
  const extended = project({x: runway.threshold.x - ux * 35, y: runway.threshold.y - uy * 35});
  svg.append(element("line", {x1: threshold.x, y1: threshold.y, x2: extended.x, y2: extended.y, stroke: "#83a19c", "stroke-width": 1.5, "stroke-dasharray": "7 8"}));
  svg.append(element("line", {x1: threshold.x, y1: threshold.y, x2: departure.x, y2: departure.y, stroke: "#eef6e7", "stroke-width": 8, "stroke-linecap": "round"}));
  svg.append(element("text", {x: threshold.x + 8, y: threshold.y - 11, fill: "#d5e7db", "font-size": 14, "font-weight": 700}, `${airport.icao} ${runway.id}`));
  if (result?.points.length > 1) {
    const points = result.points.map(p => {const q = project(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;});
    svg.append(element("polyline", {points: points.join(" "), fill: "none", stroke: "#8c8158", "stroke-width": 2, "stroke-opacity": .5}));
    svg.append(element("polyline", {points: points.slice(0, cursor + 1).join(" "), fill: "none", stroke: "#eac879", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round"}));
    const last = project(result.points.at(-1));
    svg.append(element("circle", {cx: last.x, cy: last.y, r: 5, fill: result.outcome === "Landed" ? "#96e4b7" : "#eac879", stroke: "#0b171b", "stroke-width": 2}));
  }
  const selected = result?.points[cursor] ?? {x: origin.x + number("east"), y: origin.y + number("north"), heading: number("heading")};
  const pos = project(selected), angle = selected.heading;
  svg.append(element("circle", {cx: pos.x, cy: pos.y, r: 13, fill: "none", stroke: "#98e7bd", "stroke-opacity": .35, "stroke-width": 1.5}));
  svg.append(element("path", {d: "M 0 -12 L 5 8 L 0 5 L -5 8 Z", transform: `translate(${pos.x} ${pos.y}) rotate(${angle})`, fill: "#baf5d0", stroke: "#17372c", "stroke-width": 1}));
  svg.append(element("text", {x: pos.x + 16, y: pos.y - 10, fill: "#c9e8d7", "font-size": 12, "font-weight": 700}, "TEST 1"));
  $("zoom-label").textContent = `${zoom} NM`;
}
function updateCursor() {
  if (!result?.points.length) return;
  cursor = Math.min(result.points.length - 1, Number($("timeline").value));
  const point = result.points[cursor];
  $("play-time").textContent = time(point.time); $("stage").textContent = point.stage;
  $("read-alt").textContent = `${Math.round(point.altitude).toLocaleString()} ft`;
  $("read-speed").textContent = `${Math.round(point.speed)} kt`;
  $("read-heading").textContent = `${String(Math.round(point.heading) % 360).padStart(3, "0")}°`;
  draw();
}
function fit() {
  if (!runway) return;
  const all = result?.points.length ? result.points : [{x: runway.threshold.x + number("east"), y: runway.threshold.y + number("north")}];
  const span = Math.max(5, ...all.map(p => Math.max(Math.abs(p.x - runway.threshold.x), Math.abs(p.y - runway.threshold.y) * 1000 / 700)));
  zoom = Math.min(100, Math.max(5, Math.ceil(span * 1.2 / 5) * 5)); draw();
}
async function run(event) {
  event?.preventDefault(); if (busy || !$('settings').reportValidity()) return;
  const settings = input(), controls = [...$("settings").querySelectorAll("input, select, button")];
  busy = true; controls.forEach(control => {control.disabled = true;});
  stop(); $("run").textContent = "Simulating flight…";
  $("outcome").textContent = "Simulating"; $("reason").textContent = "Following the simulator’s flight model. This can take a moment.";
  try {
    const response = await fetch("/api/simulate", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(settings)});
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Simulation failed.");
    result = body; cursor = result.points.length - 1;
    $("outcome").textContent = result.outcome; $("outcome-dot").className = `result-dot ${result.outcome === "Landed" ? "success" : result.outcome === "In progress" ? "" : "failure"}`;
    $("result-time").textContent = `at ${time(result.elapsed)}`;
    $("reason").textContent = result.reason || (result.outcome === "Landed" ? "The aircraft reached the runway." : result.outcome === "In progress" ? "The aircraft is still flying at the end of the selected duration." : "");
    $("timeline").max = Math.max(0, result.points.length - 1); $("timeline").value = cursor;
    $("timeline").disabled = result.points.length < 2; $("play").disabled = result.points.length < 2;
    $("duration").textContent = time(result.elapsed); $("events").replaceChildren();
    result.events.forEach(event => {const chip = document.createElement("span"), stamp = document.createElement("b"); chip.className = "event"; stamp.textContent = time(event.time); chip.append(stamp, document.createTextNode(event.label)); $("events").append(chip);});
    fit(); updateCursor();
  } catch (error) {
    result = undefined; $("outcome").textContent = "Could not simulate"; $("outcome-dot").className = "result-dot failure"; $("reason").textContent = error.message; draw();
  } finally {busy = false; controls.forEach(control => {control.disabled = false;}); $("run").innerHTML = '<span class="run-icon">▶</span> Run simulation <span class="key">↵</span>';}
}
$("settings").addEventListener("submit", run);
fields.forEach(id => $(id).addEventListener("change", () => {
  if (id === "airport") refreshRunways();
  if (id === "runway") refreshRunway();
  if (id === "profile") $("speed").value = data.profiles.find(item => item.id === $("profile").value).inbound;
  $("wind-summary").textContent = number("windSpeed") ? `${number("windDirection")}° / ${number("windSpeed")} kt` : "Calm";
  markDirty();
}));
document.querySelectorAll('input[name="mode"]').forEach(radio => radio.addEventListener("change", () => {$("tower-label").hidden = selectedMode() !== "visual"; markDirty();}));
$("map").addEventListener("click", event => {
  if (busy) return;
  const point = $("map").createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const p = point.matrixTransform($("map").getScreenCTM().inverse()), scale = 500 / zoom;
  $("east").value = rounded((p.x - 500) / scale, 1); $("north").value = rounded((350 - p.y) / scale, 1); markDirty();
});
$("timeline").addEventListener("input", () => {stop(); updateCursor();});
$("play").addEventListener("click", () => {
  if (playback) {stop(); return;}
  if (Number($("timeline").value) >= Number($("timeline").max)) $("timeline").value = 0;
  $("play").textContent = "Ⅱ"; $("play").setAttribute("aria-label", "Pause simulation"); updateCursor();
  playback = setInterval(() => {const next = Number($("timeline").value) + 1; $("timeline").value = next; updateCursor(); if (next >= Number($("timeline").max)) stop();}, 200);
});
$("zoom-in").addEventListener("click", () => {zoom = Math.max(5, zoom - 5); draw();});
$("zoom-out").addEventListener("click", () => {zoom = Math.min(100, zoom + 5); draw();});
$("fit").addEventListener("click", fit);

try {
  const response = await fetch("/api/catalog"); if (!response.ok) throw new Error("The airport catalogue could not be loaded.");
  data = await response.json();
  $("airport").replaceChildren(...data.airports.map(item => new Option(`${item.icao} · ${item.name}`, item.icao)));
  $("airport").value = data.airports.some(item => item.icao === "EGLL") ? "EGLL" : data.airports[0].icao;
  $("profile").replaceChildren(...data.profiles.map(item => new Option(`${item.id} · ${item.name}`, item.id)));
  $("profile").value = data.profiles.some(item => item.id === "A320") ? "A320" : data.profiles[0].id;
  refreshRunways(); draw(); run();
} catch (error) {$("outcome").textContent = "Could not start"; $("reason").textContent = error.message; $("run").disabled = true;}
