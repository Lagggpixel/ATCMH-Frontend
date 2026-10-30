export interface ChangelogUpdate {readonly title: string; readonly description: string}
export interface ChangelogDay {readonly date: string; readonly updates: readonly ChangelogUpdate[]}

/**
 * Ground & Tower changes for mentors, curated from the standalone Sweatbox changelog (Simulator/src/changelog/changelog.ts).
 * Copy an entry here only when it changes Ground or Tower work: taxi and pushback, runways, circuits, Tower calls,
 * Ground & Tower traffic setup and conflict exercises, or ATIS. Leave out Approach, Center, terrain, accounts and page
 * layout changes. Say mentor/mentee, and trim radar-only sentences. Add to the London calendar day it shipped.
 */
export const CHANGELOG: readonly ChangelogDay[] = [
  {date: "2026-10-30", updates: [
    {title: "Aircraft setup and fuel", description: "The scenario aircraft setup now shows performance and fuel more clearly. New aircraft start with 120 minutes of normal fuel; choosing Minimum or Emergency fuel sets 30 or 15 minutes, and endurance can still be edited."},
    {title: "More aircraft performance profiles", description: "More aircraft types now have their own simplified training profiles, including types used by the shared templates."},
  ]},
  {date: "2026-10-29", updates: [
    {title: "Departures from opposite runway holds", description: "Aircraft cleared for takeoff can enter the runway when traffic is holding on the opposite side. Ground traffic still stops for aircraft on its route."},
    {title: "More realistic aircraft turns", description: "Aircraft now turn with a maximum bank of 0.33 radians, including smooth roll-in and roll-out. Circuit and holding turns adjust to the wider turn radius."},
    {title: "Infinite Flight style aircraft information", description: "Show Information now opens Infinite Flight’s Information panel beside the strips, with Summary, User and Flight Plan sections. The flight plan lists procedures with their fixes and altitudes, as in Infinite Flight, and a Procedures section names each SID, STAR and approach. Sweatbox pilots are simulated, so the User details are made up."},
  ]},
  {date: "2026-10-28", updates: [
    {title: "Cleaner Add aircraft menu", description: "Ground & Tower traffic now starts from six clear choices with only the fields that choice needs, and less-used settings fold under More. The menu remembers your last settings for each airport, with Reset to start fresh."},
    {title: "Right-click to add traffic in the scenario editor", description: "Right-click the scope while editing a scenario to spawn an aircraft at that point or departing a nearby airfield, as in a live session."},
    {title: "Departures and transits that call Tower", description: "Aircraft departing another airfield call Tower once airborne to land, touch and go or request transition, or stay quiet. Transiting aircraft can keep going or call inbound for touch and go or to land when overhead, set as a plan on the aircraft instead of a timeline event."},
  ]},
  {date: "2026-10-26", updates: [
    {title: "Clearer departure readiness calls", description: "Pilot calls now say ready for departure at runway 27L, using the aircraft's selected runway."},
    {title: "Boston Logan training", description: "KBOS is available for Ground & Tower scenarios, with all six runway pairs, mapped taxiways and stands, and Boston radio calls. Taxi routes to 14, 32 and 33R need a taxi route planned by the mentor."},
  ]},
  {date: "2026-10-25", updates: [
    {title: "Holding departures no longer trigger false go-arounds", description: "Aircraft stopped at mapped holding points, including Heathrow A1, no longer make cleared arrivals go around. Aircraft entering or crossing the runway and arrivals still clearing it continue to count as runway traffic."},
    {title: "Reliable arrival resequencing", description: "Numbered arrival instructions respect the existing follow order when a downwind aircraft is closer to the runway than the traffic it follows. Unjoined arrivals holding their entry heading no longer take places in the pattern queue, so instructions select the intended aircraft to follow."},
    {title: "Aligned runways at six airports", description: "Corrected runway alignment at Naha, Calgary, Las Vegas, Athens, Auckland and Santiago. New scenarios use the corrected geometry; saved scenarios and replays retain their original airport version."},
    {title: "Hold Short accepted while waiting to depart", description: "Waiting departures in cancel-takeoff exercises acknowledge Hold Short and stay stopped, including aircraft with no taxi route or a completed route. A later lineup instruction still moves them onto the runway."},
    {title: "Back Taxi follows Tower ground traffic", description: "Back Taxi appears immediately after Line up and Wait in the Tower command list. It is available only while the aircraft is on the ground."},
    {title: "Ground turns stay on route", description: "Aircraft brake before tight taxiway turns and begin runway-exit turns before the intersection. Short route segments and expedited exits no longer make them overshoot and circle back to a missed point."},
    {title: "Infinite Flight zoom limits", description: "Ground and Tower views can zoom much closer in and farther out, using Infinite Flight’s ATC camera limits."},
    {title: "Cleaner runway markings", description: "Runway labels have rounded corners and disappear sooner as you zoom out. Runways use thinner lines, and approach cones no longer repeat runway labels at their far ends."},
    {title: "Review option traffic before sending", description: "Option clearances keep Left Traffic, Right Traffic and Send available for aircraft requesting the option, including touch-and-go traffic. Choosing a traffic direction now opens a separate Send button before the clearance is transmitted."},
    {title: "Runway-change aircraft marked in UWC", description: "The aircraft changing runway is labeled UWC (C), while its partner keeps the UWC label."},
    {title: "Slower, better-timed go-around conflicts", description: "GA leaders brake promptly and roll slowly enough to keep the runway occupied for the following arrival. They can take an earlier reachable exit instead of always skipping toward the far end. Cancelling the exercise or giving an exit instruction restores normal exit speed."},
    {title: "Thinner, persistent taxi paths", description: "The mentee's assigned taxi path stays visible in full as the aircraft moves and reaches its destination. Draft and assigned taxi paths use thinner lines, leaving taxiway detail easier to see."},
  ]},
  {date: "2026-10-24", updates: [
    {title: "20-knot taxi speed", description: "Aircraft now taxi at 20 knots on straight routes, with gradual braking for turns and holds."},
    {title: "Conflict status on the scope", description: "GA, UWC and cancel-takeoff exercises appear as cards in the top left of the scope instead of over the aircraft panel, showing both callsigns, the runway, elapsed time and progress. Pairing instructions join the same stack, finished exercises show their outcome briefly, and the stack can be collapsed."},
    {title: "Together on final for UWC", description: "Paired touch-and-go aircraft adjust speed gradually on final to stay within 0.1 NM of matching runway progress and touch down together. Downwind staging uses the same tighter spacing target."},
    {title: "Reliable go-around conflict timing", description: "Go-around exercises pace the leading aircraft's automatic runway exit against the following arrival, keeping it moving while allowing time for the intended go-around. Exercises that clear too early now say the conflict did not materialise."},
    {title: "Intersection departures", description: "Aircraft line up and attempt departure from the intersection you selected, using their existing performance limits. Insufficient runway leads to a rejected takeoff or an overrun, without an extra pilot transmission."},
    {title: "Cancel-takeoff timing and cleanup", description: "Cancel-takeoff arrivals call their own go-around at the same point as GA exercises: 50 ft above the airport or the runway threshold. The conflict label clears after a successful cancellation or a missed cancellation leads to a go-around."},
    {title: "Spacing after runway changes", description: "Sequenced circuit entries wait for room behind the aircraft they are following before turning from upwind. Close traffic also adjusts speed to open a gap, including when both aircraft started at the same speed."},
    {title: "Consistent runway clearance", description: "Go-around exercises and arriving aircraft now recognize the same runway exit boundary, preventing late go-arounds after the preceding aircraft is clear."},
    {title: "Smoother runway exits and taxi braking", description: "Aircraft slow gradually through taxiway turns and look ahead across short exit segments to brake for holds and route endpoints, instead of dropping speed abruptly."},
    {title: "ATIS weather and broadcast order", description: "Visibility, temperature and dew point use whole numbers. Generated ATIS follows Infinite Flight’s element order, including remarks before landing and departing runways, with the expected approach beside the landing runway."},
    {title: "Inbound calls for spawned aircraft", description: "Airborne aircraft spawned in Ground & Tower sessions automatically call Tower for landing or the option, matching their selected landing intention. Paused sessions wait for Start, and manual pilots remain silent."},
    {title: "Normal descent before landing clearance", description: "Aircraft descend normally on final while waiting for clearance, allowing later option clearances on repeat circuits. Automatic pilots still go around at the runway if landing clearance has not been received."},
    {title: "Drag-and-taxi for mentors", description: "Mentors now plan taxi routes the same way mentees do: press and hold a ground aircraft and drag it to a taxiway, stand or runway, or use Plan on scope. The route follows the taxiways, holds are ticked in the route list, and Start Taxi or Start Pushback sends the aircraft on its way. The scenario editor uses the same tool to save an aircraft's taxi route. Drawing taxi paths point by point has been removed."},
    {title: "Moving runway conflicts and later go-arounds", description: "GA leaders keep rolling toward an exit at a minimum of 15 kt instead of stopping to hold the runway. Following aircraft wait until 50 ft above airport elevation or the runway threshold before automatically going around. Small map offsets no longer cause reachable left exits such as KDAL 31R M5 to be refused."},
    {title: "Next landing in Flight", description: "Change Full stop or Touch and go from the Flight tab, without a duplicate setting in Setup."},
    {title: "ATIS selections and information menu", description: "ATIS uses Infinite Flight’s black backgrounds and centered button labels with matching line breaks. The editor opens directly with its wind controls without an extra simulated-weather row. Selected options keep their backgrounds and show an amber outline. Click the information word to choose Alpha through Zulu from a scrollable menu, with keyboard navigation and outside-click dismissal. Publish keeps the information word you chose."},
    {title: "Reliable runway exits and landing safety", description: "Aircraft brake for their selected exit, avoid turning back along the runway, and go around for occupied runways or an unstable landing. Mentors see the current exit route, and corrected runway lengths improve landing and taxi planning."},
    {title: "Ground and Tower scenarios at every airport", description: "Choose Ground & Tower when creating a scenario and place surface aircraft at airports without mapped gates. New circuit aircraft slow automatically for landing."},
    {title: "Responsive commands and ground routes", description: "Commands appear and dismiss their menu immediately while delivery continues. ATIS choices respond immediately, and taxi and pushback paths stay visible as you reshape them."},
    {title: "More reliable training conflicts", description: "GA exercises work on short runways, UWC can start with aircraft on different legs and at different heights, and sequence assignment handles changing traffic positions without circular follow links."},
    {title: "Aircraft taps and reviewed ground routes", description: "Old pushback or textual taxi messages no longer reveal a seeded taxi path. Touch-drag routes and aircraft map-menu taxi shortcuts open Current Path for review and require a separate press on Send Taxi or Send Pushback."},
    {title: "Automatic weather and a fixed ATIS editor", description: "New sessions, resets and restarted attempts load METAR weather only, retaining the controller’s ATIS choices. Full public broadcasts are not imported automatically. The fixed ATIS screen has no automatic-load notice."},
    {title: "Clearer runway and conflict rules", description: "Normal taxi commands and dragged paths mark only intermediate runway crossings as holds. Crossing holds remove Contact tower when ready; eligible completed routes hand over to Tower. Mentors can prepare GA/UWC before clearance, including a full-stop arrival cleared for the option. Takeoff traffic-direction choices retain their pilot-request requirement."},
    {title: "Drag taxi and pushback routes", description: "Ground controllers can hold and drag an aircraft, reshape its route and review Hold points in the matching Current Path menu. Runway entry holds are recognized along the runway and selected automatically. Small route rings and boxed labels match Infinite Flight, and unissued movement paths no longer appear as cleared green routes. Routed pushback supports a push followed by a pull."},
    {title: "Amend pushback while still straight", description: "Correct an initial pushback direction while the aircraft is still moving straight from the stand, when the revised path remains reachable."},
    {title: "Natural conflict exercises and runway exits", description: "UWC and go-around setup keeps aircraft in their actual positions and checks achievable spacing. Long rollouts use gradual braking, skip at most one exit, and display changing ground speeds. Short-runway braking is planned for the available forward exit, while stopped aircraft wait for an instruction if no forward exit remains."},
    {title: "Complete Dublin north runway", description: "Dublin’s 10L/28R uses its full mapped centerline, restoring the correct approach position and forward runway exits."},
    {title: "Focused training feedback and handoffs", description: "Ground and Tower exercises omit separation incidents and aircraft-contact crashes, and mentees no longer see separation rings or warning colors. Local handoffs use Ground or Tower."},
  ]},
  {date: "2026-10-23", updates: [
    {title: "ATIS follows Infinite Flight", description: "Use the matching runway DEP/LDG tiles, exclusive expected approaches, all remarks and NOTAMs, SID/STAR procedure choices and directional frequency sectors. Publish explicitly, including an unchanged broadcast, while draft edits leave the current ATIS intact."},
    {title: "Controller commands follow Infinite Flight", description: "Assignments appear as soon as instructions are sent while aircraft wait for the pilot to follow them. Airborne takeoff traffic gets the airborne menu and contextual replies stay in the normal menu order. Handoffs follow nearby active facilities, and inbound, position, Unicom and fuel calls retain their choices and state."},
    {title: "Paired conflict training", description: "Right-click Ground & Tower aircraft to set up UWC, GA or Cancel takeoff exercises with another aircraft. Clear validation explains unsuitable pairs, and mentor-only red labels identify active conflicts. Right-click the map to spawn at that position."},
    {title: "Taxi controls after pushback", description: "Aircraft show taxi controls as soon as pushback finishes."},
    {title: "Easier Ground & Tower traffic setup", description: "Add aircraft at a mapped gate, on a runway final, in a chosen circuit leg or at a custom airborne position. Set callsigns, type, runway, frequency and intentions before adding, with occupied gates clearly marked. Scenario creation uses the same setup and can add a timed spawn event in one step."},
  ]},
];

export const CHANGELOG_PATH = "/sweatbox/changelog";
export const londonDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"}).format(now);
const validDay = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function visibleChangelog(today = londonDay(), days = CHANGELOG): readonly ChangelogDay[] {
  return days.filter(day => validDay(day.date) && day.date <= today && day.updates.length).toSorted((a, b) => b.date.localeCompare(a.date));
}
export function unreadChangelog(days: readonly ChangelogDay[], seen?: string): readonly ChangelogDay[] {
  return validDay(seen) ? days.filter(day => day.date > seen) : days;
}
export const changelogDate = (date: string, part: "weekday" | "date") => new Intl.DateTimeFormat("en-GB", part === "weekday" ? {weekday: "short", timeZone: "UTC"} : {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"}).format(new Date(`${date}T12:00:00Z`));

export const changelogKey = (accountId: string) => `sweatbox:changelog:v1:${accountId}`;
type SeenStorage = Pick<Storage, "getItem" | "setItem">;
// Keep this tab usable when browser storage is disabled. No server-side preference state.
const tabSeen = new Map<string, string>();
export function changelogPreference(accountId: string, storage: SeenStorage) {
  const key = changelogKey(accountId);
  const read = () => {
    let stored: string | null = null;
    try {stored = storage.getItem(key);} catch { /* Fall back to this tab. */ }
    const memory = tabSeen.get(key);
    return [stored, memory].filter(validDay).sort().at(-1);
  };
  return {read, write(day: string) {
    if (!validDay(day)) return;
    const latest = read();
    if (latest && latest >= day) return;
    tabSeen.set(key, day);
    try {storage.setItem(key, day);} catch { /* Navigation in this tab still remembers it. */ }
  }};
}
export const browserChangelogPreference = (accountId: string) => changelogPreference(accountId, {
  getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value),
});
