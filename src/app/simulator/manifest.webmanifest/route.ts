import {sweatboxManifest} from "@/src/simulator/web-app";
export const dynamic = "force-static";
export function GET() {
  return new Response(JSON.stringify(sweatboxManifest), {headers: {"content-type": "application/manifest+json", "cache-control": "public, max-age=3600"}});
}
