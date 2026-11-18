import EndlessReplay from "@/src/simulator/EndlessReplay";
import replayStyles from "@/src/simulator/ReplayViewer.module.css";

export const metadata = {title: "Endless replay"};
export default async function EndlessReplayPage({params}: {params: Promise<{id: string}>}) {
  return <div className={replayStyles.theme}><EndlessReplay id={(await params).id} home="/sweatbox/endless"/></div>;
}
