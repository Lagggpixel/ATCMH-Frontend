import data from "@/src/simulator/data/egph.json";
/** The same derived database imported by the simulator, without session/user data. */
export function GET() {
  return Response.json(data, {headers: {"Content-Disposition": 'attachment; filename="atcmh-egph.json"', "X-Content-Type-Options": "nosniff"}});
}
