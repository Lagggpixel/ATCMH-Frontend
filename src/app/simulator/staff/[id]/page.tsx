import Simulator from "@/src/simulator/Simulator";
export default async function StaffSessionPage({params}: {params: Promise<{id: string}>}) {return <Simulator role="staff" sessionId={(await params).id}/>;}
