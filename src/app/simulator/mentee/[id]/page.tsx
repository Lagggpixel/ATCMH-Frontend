import Simulator from "@/src/simulator/Simulator";
import {notFound} from "next/navigation";

export default async function MenteeSessionPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <Simulator role="mentee" sessionId={id}/>;
}
