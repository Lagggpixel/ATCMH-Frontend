import {version} from "@/package.json";

/** Public build metadata only; operational diagnostics require admin authorization. */
export function GET() {
    return Response.json({version}, {headers: {"Cache-Control": "no-store"}});
}
