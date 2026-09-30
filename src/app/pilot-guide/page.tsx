import type {Metadata} from "next";
import SiteFrame from "@/src/platform/SiteFrame";
import AdminPreviewGate from "@/src/platform/auth/AdminPreviewGate";

export const metadata: Metadata = {title: "Pilot Guide"};

export default function PilotGuidePage() {
  return <SiteFrame><AdminPreviewGate><main className="section" aria-labelledby="pilot-guide-title">
    <h1 id="pilot-guide-title">Pilot Guide</h1>
    {/* Add pilot guide content here when it is ready. */}
  </main></AdminPreviewGate></SiteFrame>;
}
