export type TutorialOutcome = "completed" | "skipped" | "radar";
export const tutorialKey = (accountId: string) => `atcmh:simulator:staff-tutorial:v1:${accountId}`;

/** Personal browser preference; radar means the Sessions tour is done. */
export function tutorialPreference(accountId: string) {
  return {
    read(): TutorialOutcome | null {
      try {
        const value = window.localStorage.getItem(tutorialKey(accountId));
        return value === "completed" || value === "skipped" || value === "radar" ? value : null;
      } catch {return null;}
    },
    write(outcome: TutorialOutcome) {
      try {window.localStorage.setItem(tutorialKey(accountId), outcome);} catch { /* Tours remain usable without storage. */ }
    },
  };
}

export function shouldStartTutorial(outcome: TutorialOutcome | null, live: boolean) {
  return outcome === null || live && outcome === "radar";
}

export interface TutorialStep {target: string; fallback?: string; title: string; text: string; hint: string}
export const SESSION_TOUR: readonly TutorialStep[] = [
  {target: "scenarios-tab", title: "Start with a scenario", text: "This is your scenario library. Build a setup here, save it and publish it before using it in a session.", hint: "Scenarios are shared with other staff. A session uses the published revision."},
  {target: "new-session", title: "Create a paused session", text: "Choose New session, then pick a published scenario. Your exercise starts paused so you can prepare before the mentee joins.", hint: "You can use the highlighted controls during this tour. Nothing is created automatically."},
  {target: "session-library", title: "Choose your exercise", text: "Saved sessions appear here with their airport and connected mentor and mentee. Select a session to see its sharing controls.", hint: "If this list is empty, create a session from a published scenario first."},
  {target: "mentee-sharing", fallback: "session-library", title: "Invite your mentee", text: "Select a session, then use Copy mentee link in its details. Send that link to your mentee so they can sign in and join their own page.", hint: "Each session has one staff control seat and one mentee seat. Avoid opening duplicate seat tabs."},
  {target: "staff-radar-link", fallback: "session-library", title: "Continue on the staff radar", text: "Open staff radar for a session with a free mentor seat. The next part of the tour points out the controls inside the exercise.", hint: "If no radar is available yet, continue later. The radar tour will open on your next staff radar visit."},
];
export const RADAR_TOUR: readonly TutorialStep[] = [
  {target: "play-pause", title: "Control the pace", text: "Use Play when you and your mentee are ready. Pause freezes the exercise whenever you need to explain a decision.", hint: "The tour does not pause a running exercise for you."},
  {target: "traffic", title: "Select an aircraft", text: "This is your traffic list. Select a callsign here to open its controls below the map, or use Add aircraft to introduce more traffic.", hint: "Try selecting an aircraft now. The guide stays open while you use the simulator."},
  {target: "automatic", title: "Choose how pilots respond", text: "Automatic reads back and follows valid instructions after 1.5 exercise seconds, and sends supported follow-up requests. Turn it off when you want to respond manually.", hint: "Automatic never grants clearances. Turning it off does not freeze movement; use Pause for that."},
  {target: "radar", title: "Watch the aircraft on the radar", text: "Select an aircraft on the map, pan to follow traffic and use the map controls to adjust your view. Selection matches the Traffic list.", hint: "Use a computer or a tablet in landscape for the radar and aircraft controls."},
  {target: "aircraft-controls", title: "Act as the pilot", text: "With an aircraft selected, use Pilot messages to send a request or respond to the mentee. Intentions, Flight controls and Routes & position manage that aircraft.", hint: "The Global message log shows the whole conversation; Aircraft message log filters to the selected aircraft."},
  {target: "timeline", fallback: "toolbar", title: "Run events and save feedback", text: "For a scenario session, open Timeline to review events, run manual events while playing, or choose Finish attempt to save feedback.", hint: "A session without a scenario shows Save scenario here instead."},
  {target: "return-sessions", title: "Return for a debrief", text: "Return to Sessions here. Leaving keeps the saved session. End session closes it permanently and saves its recording in Replays for your debrief.", hint: "You can reopen this on-screen tour at any time with Tutorial in Sessions or the staff radar."},
];

export interface TourRect {left: number; top: number; width: number; height: number}
/** Keep the guide beside its target where possible, inside small/short viewports. */
export function placeTourCard(target: TourRect | null, viewport: {width: number; height: number}, card: {width: number; height: number}) {
  const gap = 16, margin = 12;
  let left = viewport.width - card.width - margin, top = viewport.height - card.height - margin;
  if (target) {
    if (target.left + target.width + gap + card.width <= viewport.width - margin) {left = target.left + target.width + gap; top = target.top;}
    else if (target.left - gap - card.width >= margin) {left = target.left - gap - card.width; top = target.top;}
    else if (target.top + target.height + gap + card.height <= viewport.height - margin) {left = target.left; top = target.top + target.height + gap;}
    else if (target.top - gap - card.height >= margin) {left = target.left; top = target.top - gap - card.height;}
    else {left = target.left + target.width - card.width - gap; top = target.top + gap;}
  }
  return {left: Math.max(margin, Math.min(left, viewport.width - card.width - margin)), top: Math.max(margin, Math.min(top, viewport.height - card.height - margin))};
}
