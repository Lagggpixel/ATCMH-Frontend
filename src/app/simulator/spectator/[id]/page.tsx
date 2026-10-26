import Simulator from "@/src/simulator/Simulator";
import {notFound} from "next/navigation";

/** Superadmins watch a live session here, and can take staff controls or demonstrate. */
export default async function SpectatorSessionPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <Simulator role="spectator" sessionId={id}/>;
}
