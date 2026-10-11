import ScenarioEditor from "@/src/simulator/ScenarioEditor";
export default async function Page({params}: {params: Promise<{id: string}>}) {return <ScenarioEditor id={(await params).id}/>;}
