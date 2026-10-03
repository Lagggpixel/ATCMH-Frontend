import type {PilotGuide} from "./pilot-guide";

export type PilotGuideVideo = {
  id: "transition" | "upwind-conflict" | "go-around";
  description: string;
  url?: string;
  youtubeId?: string;
};

export type PilotGuideSourceBlock = {
  heading?: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  video?: PilotGuideVideo;
};

export type PilotGuideSourceChapter = {
  id: string;
  title: string;
  introduction?: string;
  blocks: readonly PilotGuideSourceBlock[];
  callout?: {label: string; text: string};
};

export const pilotGuideMetadata = {
  title: "Pilot Guide",
  introduction: "Welcome to the Pilot Guide! All pilots must fully understand the contents of this guide prior to participating in training sessions. Thank you for helping us maintain an effective and professional training environment.",
  lastUpdated: "2026-02-02",
  lastUpdatedLabel: "February 2, 2026",
} as const;

export const pilotGuideChannels = {
  requests: "https://discord.com/channels/1210021410110447637/1210061769532244028",
  sessions: "https://discord.com/channels/1210021410110447637/1210135084472995861",
} as const;

export const pilotGuideChapters: readonly PilotGuideSourceChapter[] = [
  {
    id: "getting-started",
    title: "Getting started",
    introduction: "When a session is scheduled and requires pilots, a bot request will post in #requests. All sessions take place on the training server unless otherwise noted.",
    blocks: [{
      paragraphs: ["All posts will have the following information:"],
      items: [
        "The airport where the session will take place (ICAO code)",
        "The number of pilots needed",
        "The start time of the session",
        "The \"I'm Attending\" button to sign up",
      ],
    }],
    callout: {
      label: "Important",
      text: "If you are using both Infinite Flight and Discord on the same device, please tell the Mentor. Certain scenarios can only happen when you're told to do them in real time. By telling the Mentor that you're single device, they will plan scenarios accordingly and tag pilots who they can ensure will see their messages. Additionally, if you must opt out of the session prior to starting, un-react to the post and let the Mentor know as soon as possible.",
    },
  },
  {
    id: "in-a-session",
    title: "In a session",
    introduction: "At the session start time, the hosting mentor will make a new thread in #sessions with all the details you need regarding that session. This includes spawn locations, scenarios/conflicts to make, sometimes the aircraft to fly, etc.",
    blocks: [{
      paragraphs: ["Once you’re aware of your spawn location, you may spawn and begin your assignment. While in a session, it is important to listen to the directions of the host. While it may seem beneficial to create your own scenarios to test the mentee, sessions are planned in advance so the mentor can test specific things. Not following the mentor's instructions makes it extremely difficult to run an effective session and may result in you being asked to leave."],
    }],
  },
  {
    id: "local-tower",
    title: "Local/Tower",
    introduction: "Local sessions are designed to test a controller’s ability to simultaneously control Ground & Tower frequencies safely and efficiently. In most sessions, the following things are tested:",
    blocks: [
      {
        heading: "On Ground Frequency",
        items: [
          "Pushback Conflict (PBC)",
          "Drag and Taxi (D&T)",
          "Give-way Conflict (GWC)",
          "Safe & efficient runway crossings (if applicable)",
          "Wind appropriate runway assignments (if applicable)",
        ],
      },
      {
        heading: "On Tower Frequency",
        items: [
          "Takeoff Clearances, with traffic direction when appropriate",
          "Pattern Entries",
          "Sequencing and Re-Sequencing",
          "Landing/Option Clearances",
          "Transition Altitudes",
          "Upwind Conflicts (UWC)",
          "Runway Changes",
          "Go-Around Scenarios (GA)",
          "Frequency Changes",
        ],
      },
      {paragraphs: ["Continue below to see your responsibility as a pilot when assigned one of these testing items."]},
    ],
  },
  {
    id: "ground-frequency",
    title: "Ground frequency",
    blocks: [
      {
        heading: "Pushback Conflict",
        paragraphs: [
          "At least 2 pilots will be assigned with creating a Pushback Conflict (PBC). Both pilots should request pushback around the same time. The controller should tell one aircraft to hold position while approving the other. Aircraft should be issued pushback via Drag and Push at airports that support it. Once the first aircraft begins its taxi and a conflict no longer exists, the second aircraft should be approved for pushback.",
          "It is acceptable to approve both aircraft at once and issue a give-way command, however the above method is the suggested course of action.",
          "Please note that one of the two pilots assigned to the pushback conflict will also need to participate in the give-way conflict during taxi.",
        ],
      },
      {
        heading: "Drag & Taxi",
        paragraphs: ["Drag & Taxi (D&T) is expected to be issued when the airport supports it. A good D&T route will avoid conflicts, but also limit turns, creating an efficient path to the runway. Any hold points on inactive runways should be removed. If you see an issue with the D&T routing, please screenshot it and include it in your feedback when the session concludes."],
      },
      {
        heading: "Give-Way Conflict",
        paragraphs: ["At least one pilot will be assigned with creating a Give-Way Conflict (GWC). Two taxing aircraft will be on converging taxiways, and the controller should tell one aircraft to give-way to the other (\"Give-way to aircraft on your left/right\"). Please ensure to still follow D&T when possible, and coordinate a GWC location with one of the pilots assigned to a pushback conflict."],
      },
      {
        heading: "Runway Crossings",
        paragraphs: ["If the taxi routing requires crossing a runway to get to the departure runway, try waiting to see if you receive the runway crossing clearance prior to requesting. Ground efficiency includes being proactive with runway crossings, especially when the runway is not in use. If a runway crossing is not issued prior to reaching the hold line, then hold short and request permission to cross."],
      },
    ],
  },
  {
    id: "tower-frequency",
    title: "Tower frequency",
    blocks: [
      {
        heading: "Inbounds",
        paragraphs: ["When inbound, you should receive a pattern entry (PE), sequence (if necessary), and a clearance for the option with a traffic direction (\"...after the option, make left/right traffic\"). If your PE doesn't make sense relative to your position, note it in your feedback. If you are instructed to continue inbound, expect a pattern entry shortly. Do not file a flight plan, unless specifically instructed to do so, for a general inbound for touch and go assignment. If you are asked to file a flight plan and are unsure of what to do, ask the mentor for clarification or for an alternate assignment."],
      },
      {
        heading: "Transitions",
        paragraphs: ["When assigned to complete a transition, request transition as soon as you depart and have tuned to tower. Fly at the altitude issued by the tower controller and aim to pass over the airport midfield. It's best to fly perpendicular to the runway(s) to fly over the airport. Once directly overhead, request inbound for touch and go. You should receive a PE, sequence (if necessary), and a clearance for the option with a traffic direction (\"...after the option, make left/right traffic\")."],
        video: {
          id: "transition",
          description: "This video shows how to complete a transition assignment as a pilot.",
          url: "https://youtu.be/KQPcirkqKAY?si=syZTqXrYiIcUuwlo",
          youtubeId: "KQPcirkqKAY",
        },
      },
      {
        heading: "Request Departure",
        paragraphs: ["Aircraft that are included in the PBC and GWC will need to send a request for takeoff with tower. When requesting departure, always include \"remaining in the pattern\" in your request, unless otherwise specified. You should be given a traffic direction in the takeoff clearance. If on parallel runways, you should typically be given a traffic direction relative to your runway (22L = Left Traffic/22R = Right Traffic), although situations may vary."],
      },
      {
        heading: "In the Pattern",
        paragraphs: ["Fly at jet pattern altitude (1500 feet above airport level). Never exceed 210kts on downwind. Do not exceed 180kt on base. Do not exceed 160kt on final. Exceptions may apply to certain GA scenarios. Your downwind should be no more than 5NM and no less than 3NM wide. While established in the pattern, there is no need to call inbound. The controller will issue you a sequence and clearance when necessary."],
      },
      {
        heading: "Runway Changes",
        paragraphs: ["When instructed to change runways, do so right away. You should receive a PE for the new runway, a sequence (if necessary), and a clearance with a traffic direction. Monitoring a second device to view the session thread is crucial to effective and timely runway changes."],
      },
      {
        heading: "Sequencing/Re-Sequencing",
        paragraphs: ["Whenever there is more than one aircraft going to the same runway, all aircraft behind number one will need a sequence to know who they're following. Sequences can be given with a PE or separately. In the event that a sequence is changed, you may need to receive a re-sequence (\"...number X, traffic to follow is on...\"). Re-sequencing typically happens after runway changes. Ensure you are following your sequence at all times. Do not cut in line."],
      },
      {
        heading: "Upwind Conflicts",
        paragraphs: ["When two aircraft are both on upwind for parallel runways, one of them will be instructed by the mentor to request a runway change. This creates a conflict due to both aircraft's close proximity. To resolve this conflict, the controller should tell the requesting aircraft to extend upwind. Once the second aircraft turns crosswind, the requesting aircraft should receive a PE for the new runway, a sequence, and clearance with a traffic direction."],
        video: {
          id: "upwind-conflict",
          description: "This video shows how to complete an upwind conflict assignment as a pilot.",
          url: "https://youtu.be/PZOu-uke1-g?si=EEOncfn4xeV3x8Fi",
          youtubeId: "PZOu-uke1-g",
        },
      },
      {
        heading: "Runway Exit Commands",
        paragraphs: ["When landing, the controller should wait until the aircraft is around 70kts to issue the runway exit command. Wait until the mentor requests you to \"FULL STOP\" before slowing down and exiting a runway."],
      },
      {
        heading: "Go Arounds",
        paragraphs: ["Near the end of a session, the mentor will instruct at least 2 pilots to create a go-around scenario by saying, \"Pilot 1, GA on Pilot 2.\" Pilot 1 should land normally, acknowledge the runway exit command, but not exit the runway. Pilot 2 should continue their approach and receive a GA instruction from the controller before crossing the threshold. Generally, 200-300 feet above the ground is the best time for a go-around to be issued. If the controller does not issue the go-around, initiate one yourself after crossing the threshold. This would mean a failed go-around scenario."],
        video: {
          id: "go-around",
          description: "This video shows how to complete a GA assignment as a pilot.",
          url: "https://youtu.be/WJX1Dhpc5Gg?si=Cix3J8RrOOLcxB3B",
          youtubeId: "WJX1Dhpc5Gg",
        },
      },
      {
        heading: "Departures",
        paragraphs: ["If you are told to depart the airspace entirely, request to depart and expect a frequency change once clear of any conflicts."],
      },
      {paragraphs: ["Professional piloting makes successful controllers. Thank you for your contribution."]},
    ],
  },
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function linkedText(text: string): string {
  return escapeHtml(text).replace(/#(requests|sessions)\b/g, (_match, channel: keyof typeof pilotGuideChannels) => `<a href="${pilotGuideChannels[channel]}" target="_blank" rel="noopener noreferrer">#${channel}</a>`);
}

function paragraph(text: string): string {
  return `<p>${linkedText(text)}</p>`;
}

function chapterHtml(chapter: PilotGuideSourceChapter): string {
  const parts: string[] = [];
  if (chapter.introduction) parts.push(paragraph(chapter.introduction));
  for (const block of chapter.blocks) {
    if (block.heading) parts.push(`<h3>${escapeHtml(block.heading)}</h3>`);
    if (block.paragraphs) parts.push(...block.paragraphs.map(paragraph));
    if (block.items) parts.push(`<ul>${block.items.map(item => `<li>${paragraph(item)}</li>`).join("")}</ul>`);
    if (block.video) {
      parts.push(paragraph(block.video.description));
      if (block.video.youtubeId) {
        parts.push(`<div data-youtube-video=""><iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(block.video.youtubeId)}" title="${escapeHtml(block.video.description)}" width="560" height="315" loading="lazy" allowfullscreen="" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`);
      }
      if (block.video.url) parts.push(`<p><a href="${escapeHtml(block.video.url)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></p>`);
    }
  }
  if (chapter.callout) parts.push(`<blockquote><p><strong>${escapeHtml(chapter.callout.label)}:</strong></p>${paragraph(chapter.callout.text)}</blockquote>`);
  return parts.join("\n");
}

// Seed content is not a persisted revision. The backend assigns revision and updatedAt.
export const initialPilotGuide: PilotGuide = {
  title: pilotGuideMetadata.title,
  introduction: pilotGuideMetadata.introduction,
  lastUpdated: pilotGuideMetadata.lastUpdated,
  revision: 0,
  updatedAt: null,
  chapters: pilotGuideChapters.map(chapter => ({id: chapter.id, title: chapter.title, html: chapterHtml(chapter)})),
};
