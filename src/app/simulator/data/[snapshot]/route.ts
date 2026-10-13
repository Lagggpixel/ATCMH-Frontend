import {airportData, type AirportId} from "@/src/simulator/airports";

/** Public source database only; excludes all exercise and account records. */
export async function GET(_request: Request, {params}: {params: Promise<{snapshot: string}>}) {
  const {snapshot} = await params;
  const match = /^([a-z]{4})\.json$/.exec(snapshot);
  const id = match?.[1].toUpperCase() as AirportId;
  if (!id || !Object.hasOwn(airportData, id)) return new Response("Airport not found", {status: 404});
  return Response.json(airportData[id], {headers: {"Content-Disposition": `attachment; filename="atcmh-${id.toLowerCase()}.json"`, "X-Content-Type-Options": "nosniff"}});
}
