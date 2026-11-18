import EndlessReplay from "@/src/simulator/EndlessReplay";

export const metadata = {title: "Endless replay"};
export default async function EndlessReplayPage({params}: {params: Promise<{id: string}>}) {
  return <EndlessReplay id={(await params).id} home="/sweatbox/endless"/>;
}
