import type {Metadata} from "next";
import LearningFrame from "@/src/learning/LearningFrame";
import PilotGuideReader from "@/src/learning/PilotGuideReader";
import AdminPreviewGate from "@/src/platform/auth/AdminPreviewGate";
import {getPilotGuide} from "@/src/lib/pilot-guide-api-client";

export const metadata: Metadata = {title: "Pilot Guide"};

export default async function PilotGuidePage() {
  const guide = await getPilotGuide().catch(() => null);
  return <LearningFrame product="Pilot Guide"><AdminPreviewGate>{guide ? <PilotGuideReader guide={guide}/> : <section style={{padding: "64px 24px", textAlign: "center"}}><h1>Pilot Guide unavailable</h1><p>We couldn’t load the guide. Please try again in a moment.</p><a href="/pilot-guide">Try again</a></section>}</AdminPreviewGate></LearningFrame>;
}
