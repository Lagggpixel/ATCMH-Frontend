import type { CourseDocumentV1 } from "./course-document";

/** A reusable training template; creating it does not change a saved course. */
export function createGroundControlDocument(quizId: string): CourseDocumentV1 {
    return {
        version: 1,
        blocks: [
            { id: "ground-intro", type: "text", markdown: `# Ground Control

Build a clear picture of aircraft movements, spot conflicts early, and give pilots short, useful instructions. Work through eight learning blocks, practise five ungraded checks, then use the revision sheet before your final quiz.

These are illustrative simulated-training situations, not instructions for real-world airport operations. Diagram positions are examples, not measured separation standards.` },
            { id: "ground-role", type: "text", markdown: `## 1. What Ground Does

Ground manages movement between parking and the runway area: pushbacks, taxiing departures, arriving aircraft, and conflicts along their routes. Your aim is an orderly flow with enough space for each aircraft to move safely.

Think ahead of the aircraft. A clear taxiway now may become blocked when another aircraft pushes back or turns into it. Watch intended routes as well as current positions. Ground controls surface movement within its assigned responsibility; Tower retains responsibility for active-runway operations and coordination.

For each movement, ask: **Where is it going? What will it meet? Where can it safely wait?**` },
            { id: "ground-flow", type: "diagram", diagramId: "ground-movement-flow" },
            { id: "ground-setup", type: "text", markdown: `## 2. Setup

Before accepting traffic, inspect the airport layout. Locate stands, aprons, taxiways, runway holding points, and likely arrival exits. Identify narrow sections and intersections where opposing routes could meet. Confirm the runway direction in use and understand how it affects departure routes and arriving traffic.

Do not rely solely on coloured runway numbers on the map to identify the runway in use. Confirm operational runway information through ATIS and coordination; use METAR and TAF wind information to understand current and forecast conditions, not as runway assignments.

Review the available airport and weather information. Wind helps explain runway selection; visibility and weather affect how easily pilots can identify routes and traffic. Do not treat a forecast as a current observation.

| Source | Full name | Use |
| --- | --- | --- |
| METAR | Meteorological Aerodrome Report | Current observed aerodrome weather. |
| ATIS | Automatic Terminal Information Service | Broadcast airport information, including operational and weather details. |
| TAF | Terminal Aerodrome Forecast | Expected aerodrome weather over a stated forecast period. |

Check that your planned routes fit the airport's current operation. If a runway direction or traffic situation changes, reassess the plan instead of repeating your previous instructions.` },
            { id: "ground-pushback-heading", type: "text", markdown: `## 3. Pushback

A pushback creates a moving obstacle before the aircraft begins taxiing. Check behind the stand, the adjacent taxilane, and approaching traffic before approval. Consider the aircraft's final position: can it start taxiing without blocking another aircraft or facing an unresolved conflict?

If the space is available, issue **Pushback approved**. Use **Give way to...** when an aircraft may continue safely while allowing clearly identified traffic to pass first; use **Hold position** when it must stop completely. For example, a taxiing aircraft near a stand can **Give way to Aircraft A** as A clears the pushback path. Recheck the path and final position before approving a waiting pushback.` },
            { id: "ground-pushback-decision", type: "callout", tone: "decision", title: "Before approving pushback", markdown: "Check the flight plan and runway in use, moving traffic behind the stand, other pushbacks, and the departure queue. Choose a direction and final position that fit the onward taxi route without trapping or blocking aircraft." },
            { id: "ground-pushback-command", type: "callout", tone: "command", title: "Choose the pushback instruction", markdown: "**Pushback approved** authorizes the movement when clear. Use **Pushback approved, tail to the X** when specifying the tail direction, replacing X with the appropriate direction. **Drag and pushback** is not available at every airport. Where available, define the intended pushback position; check its path and endpoint before approval." },
            { id: "ground-pushback-stop", type: "callout", tone: "command", title: "Stop, reassess, then resume", markdown: "If an approved pushback develops a conflict, issue **Hold position**. Once the conflict clears, check the area again and issue **Pushback approved** to resume the pushback. Do not leave the pilot to infer that movement may restart." },
            { id: "ground-pushback-diagram", type: "diagram", diagramId: "ground-pushback" },
            { id: "ground-pushback-rule", type: "callout", tone: "rule", title: "Approve the space, not just the request", markdown: "A request does not mean the area is clear. Include taxiing aircraft and other pushbacks in your scan, then keep monitoring after approval." },
            { id: "ground-pushback-check", type: "check", prompt: "An aircraft requests pushback while another is approaching behind its stand. Their paths would conflict. What should you do first?", options: ["Approve both movements and let the pilots resolve it.", "Hold the requesting aircraft and reassess after the passing traffic clears.", "Approve pushback because taxi has not started."], correctOption: 1, explanation: "Existing moving traffic must be protected first. Once it passes, reassess the pushback path before issuing Pushback approved.", incorrectExplanation: "A pushback request does not reserve the area. Protect the existing movement first and reassess once it clears." },
            { id: "ground-taxi", type: "text", markdown: `## 4. Taxi

Departure requests are **Ready to taxi** or **Ready to taxi to Runway X**. Parking requests are **Requesting taxi to parking** or **Requesting taxi to remote stand / Stand X**. Identify the requested destination before responding. Use **Taxi to Runway X** for the assigned departure runway, replacing X with its identifier. Know the route the aircraft is likely to take and identify conflicts before issuing the instruction. A taxi instruction does not remove the need to manage traffic along that route or obtain the appropriate runway-crossing authorization.

For arrivals, identify the runway exit and onward route to parking. Keep exit areas usable so an arriving aircraft can clear the runway when permitted. Avoid sending a departure into a space that the arrival needs.

Monitor progress after each instruction. If a conflict develops, intervene early enough for a controlled stop. Update your plan when a pilot takes an unexpected route; do not assume the original route is still being followed.` },
            { id: "ground-taxi-check", type: "check", prompt: "A departing pilot reports ‘Ready to taxi’. Which instruction authorizes taxi toward the assigned departure runway?", options: ["Taxi to Runway X", "Continue taxi at your discretion", "Pushback approved", "Expect progressive taxi instructions"], correctOption: 0, explanation: "Taxi to Runway X assigns taxi toward the departure runway. Monitor the route and manage conflicts after issuing it.", incorrectExplanation: "A departure taxi instruction must identify the assigned runway. Pushback approval and announcements about progressive guidance serve different purposes." },
            { id: "ground-conflicts", type: "text", markdown: `## 5. Managing Conflicts

Resolve the next shared space before aircraft reach it. Choose a sensible order, identify which aircraft should wait, and release it only after the route is clear. Prefer **Give way to...** where a specific conflict can be clearly identified and traffic can continue safely. Use **Hold position** when movement must stop completely or the situation needs further assessment.

| Instruction | Use | Controller follow-up |
| --- | --- | --- |
| Hold position | Stop the aircraft when movement must not continue. | Reassess and explicitly release it when appropriate. |
| Give way to... | Let clearly identified traffic pass first. | Monitor recognition, spacing, and the onward route. |

### Scenario 1 — Intersecting taxiways

Aircraft A and B approach the same intersection from different directions. Choose A to pass first and instruct B to **Give way to Aircraft A**. Monitor A clearing the conflict area; B then continues when clear.` },
            { id: "ground-intersection-diagram", type: "diagram", diagramId: "ground-intersection" },
            { id: "ground-head-on-text", type: "callout", tone: "scenario", title: "Scenario 2 — Head-on traffic", markdown: "Two aircraft are approaching on the same taxiway in opposite directions. Holding both after they meet may leave no usable way out. Stop one before it enters the narrow section and use an available alternate route or waiting area. Check that the chosen space actually allows the other aircraft to pass." },
            { id: "ground-head-on-diagram", type: "diagram", diagramId: "ground-head-on" },
            { id: "ground-arrival-text", type: "callout", tone: "scenario", title: "Scenario 3 — Arrival and departure", markdown: "An arrival needs the exit taxiway that a departure is approaching. Where practical, hold the departure clear of the exit and let the arrival continue away from the runway. This protects runway clearance without granting either aircraft an automatic right to move through other conflicts." },
            { id: "ground-arrival-diagram", type: "diagram", diagramId: "ground-arrival-priority" },
            { id: "ground-pushback-conflict", type: "callout", tone: "scenario", title: "Scenario 4 — Pushback and taxiing traffic", markdown: "A departing aircraft asks to push into an occupied taxilane. Hold the pushback while the taxiing aircraft passes. Recheck for following traffic before approval, then monitor the pushed aircraft's final position." },
            { id: "ground-three-way-text", type: "callout", tone: "scenario", title: "Scenario 5 — Three aircraft, one junction", markdown: "Normally prioritise an aircraft exiting the runway so it can clear the exit area, while checking all surrounding conflicts. Choose a clear sequence rather than releasing several aircraft together. Hold the others outside the junction, let the first clear, then reassess and release the next. Keep waiting aircraft out of other routes and avoid instructions that leave pilots guessing who moves first." },
            { id: "ground-three-way-diagram", type: "diagram", diagramId: "ground-three-way" },
            { id: "ground-conflicts-check", type: "check", prompt: "Three aircraft need the same junction. What is the clearest initial plan?", options: ["Release all three because they can see each other.", "Choose an order and hold the others clear of the junction.", "Wait until they enter the junction to decide."], correctOption: 1, explanation: "Establishing an order keeps the shared space usable. Reassess after each aircraft clears before the next movement.", incorrectExplanation: "Aircraft visibility alone does not resolve converging routes. Establish a clear sequence before the junction becomes congested." },
            { id: "ground-progressive", type: "text", markdown: `## 6. Progressive Taxi

Use progressive taxi when a pilot needs step-by-step help, the route is unclear, or a difficult layout makes a single destination instruction insufficient. Start with **Expect progressive taxi instructions**.

Give one manageable instruction at a time using identifiable turns or stopping points. Watch the aircraft reach the intended position before giving the next step. Keep enough room to stop before a conflict or runway boundary. If the aircraft turns unexpectedly, establish where it is before continuing.

When detailed guidance is no longer needed and the onward route is appropriate, use **Continue taxi at your discretion**. That does not cancel holding restrictions or authorize entering or crossing a runway.` },
            { id: "ground-progressive-diagram", type: "diagram", diagramId: "ground-progressive-taxi" },
            { id: "ground-progressive-check", type: "check", prompt: "During progressive taxi, the aircraft takes a different turn from the one you intended. What next?", options: ["Continue the original sequence without checking.", "Establish its actual position and reassess the route before the next instruction.", "Assume it has reached the runway."], correctOption: 1, explanation: "Confirming the actual position restores a shared traffic picture before the next step. Check nearby conflicts as you reassess.", incorrectExplanation: "Progressive instructions depend on the aircraft’s actual position. An unexpected turn makes the previous sequence unreliable until you reassess." },
            { id: "ground-crossings", type: "text", markdown: `## 7. Runway Crossings

Name the runway using its **direction in use**, not the nearest threshold. Issue a crossing at the earliest practical opportunity when the runway is free of conflicting traffic and **the crossing is imminent**. Do not wait unnecessarily for a request or for the aircraft to stop at the holding point.

With respect to departing traffic, a crossing may be issued in the potentially available situations below only after the remaining checks are satisfied. Under Infinite Flight rules, **altitude alone is not the deciding criterion**; a departure rolling toward the crossing remains a conflict.

Keep the crossing aircraft holding when uncertain. A taxi destination does not itself authorize crossing. Tower retains responsibility for active-runway operations and coordination. See the [Infinite Flight runway-crossing manual](https://infiniteflight.com/guide/atc-manual/2.-ground/2.3-runway-crossing).` },
            { id: "ground-crossing-schematic", type: "diagram", diagramId: "ground-runway-crossing", props: { scenario: "overview" } },
            { id: "ground-crossing-departures", type: "text", markdown: `### Departure traffic

| Departure state | Crossing status |
| --- | --- |
| Has not started takeoff roll | Potentially available |
| Rolling toward crossing point | Hold / conflicting |
| Airborne and visibly turning away | Potentially available |
| Already past crossing point | Potentially available |` },
            { id: "ground-crossing-arrivals", type: "text", markdown: `### Arrival traffic

| Arrival state | Crossing status |
| --- | --- |
| Before runway threshold | Potentially available |
| Exiting before crossing point | Potentially available |
| Occupying or moving through crossing area | Hold / conflicting |
| Past crossing point | Potentially available |` },
            { id: "ground-crossing-warning", type: "callout", tone: "warning", title: "Potentially available is not authorization", markdown: "‘Potentially available’ does not itself authorize a runway crossing. Check all other traffic, ensure the crossing is imminent, and use the appropriate authorization." },
            { id: "ground-crossing-check", type: "check", prompt: "An arrival is beyond your intended crossing point. Does that alone make a crossing safe?", options: ["Yes, its position guarantees the runway is available.", "No. Check other traffic, imminent conflicts, runway direction, and the required authorization."], correctOption: 1, explanation: "Checking the whole traffic picture and authorization accounts for conflicts that the arrival’s position alone cannot exclude.", incorrectExplanation: "One aircraft being past the crossing does not reserve the runway. Other traffic may conflict; the crossing must be imminent and appropriately authorized." },
            { id: "ground-frequency", type: "text", markdown: `## 8. Running the Frequency

Listen, identify the aircraft, decide, then transmit. Keep each instruction short and relevant. Prioritise an immediate conflict over a routine request, and avoid stacking instructions faster than pilots can follow them.

Maintain a scan while speaking: moving aircraft, waiting aircraft, runway exits, and new requests. A held aircraft remains part of your plan. Once its conflict clears, reassess and release it promptly when appropriate. If workload rises, slow the flow with clear holds rather than allowing unresolved movements to accumulate.

**Transfer to Tower:** Resolve outstanding ground conflicts, then transfer a departing aircraft at the appropriate holding area when Ground instructions are complete. Do not retain it unnecessarily or direct it onto the active runway as part of the handoff.

**Stand → Pushback → Taxi → Holding area → Tower**` },
            { id: "ground-revision", type: "text", markdown: `## Quick Revision Sheet

| Situation | Think | Command or action |
| --- | --- | --- |
| Pushback request | Flight plan, runway, traffic and queue clear? | Approve, hold or give way as appropriate |
| Pushback stopped | Has the conflict cleared? | Pushback approved |
| Taxi departure | Correct runway and conflict-free route? | Taxi to Runway X |
| Intersection conflict | Which aircraft should pass first? | Give way to... |
| Movement must stop | Protect the shared space | Hold position |
| Arrival just exited runway | Keep the exit clear | Normally prioritize the arrival |
| Progressive taxi ends | Can the pilot navigate the onward route? | Continue taxi at your discretion |
| Runway crossing | Traffic permits and crossing imminent? | Issue crossing using direction in use |
| Departure ready for Tower | Ground instructions complete? | Transfer at the appropriate holding area |

## Final Quiz

The practice checks above are ungraded. Complete the required final quiz below with **80% or higher**.` },
            { id: "ground-final-quiz", type: "quiz", quizId, required: true, passPercent: 80 },
        ],
    };
}
