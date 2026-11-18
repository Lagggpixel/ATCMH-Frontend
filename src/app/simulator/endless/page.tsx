import EndlessStudio from "@/src/simulator/EndlessStudio";

export const metadata = {title: "Endless practice"};
export default async function EndlessPage({searchParams}: {searchParams: Promise<{view?: string}>}) {
  return <EndlessStudio home="/sweatbox/endless" replays={(await searchParams).view === "replays"}/>;
}
