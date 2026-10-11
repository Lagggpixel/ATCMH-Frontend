import Simulator from "@/src/simulator/Simulator";
export default async function MenteeSessionPage({params}: {params: Promise<{id: string}>}) {return <Simulator role="mentee" sessionId={(await params).id}/>;}
