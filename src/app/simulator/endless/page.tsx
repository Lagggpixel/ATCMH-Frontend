import EndlessStudio from "@/src/simulator/EndlessStudio";

export const metadata = {title: "Endless practice"};
export default function EndlessPage() {
  return <EndlessStudio paths={{home: "/sweatbox/endless", sessions: "/sweatbox/staff"}}/>;
}
