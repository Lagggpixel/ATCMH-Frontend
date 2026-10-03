import type {PilotGuide} from "@/src/learning/pilot-guide";
import {parsePilotGuideResponse} from "./pilot-guide-contract";
import {resolvePublicRuntimeConfig, type RuntimeEnvironment} from "./runtime-config";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The public reader always loads the published backend guide, never a local draft. */
export async function getPilotGuide(
    env: RuntimeEnvironment = process.env,
    fetchImpl: Fetch = fetch,
): Promise<PilotGuide> {
    const {dashboardApiUrl, frontendPublicOrigin} = resolvePublicRuntimeConfig(env, process.env.NODE_ENV);
    const response = await fetchImpl(`${dashboardApiUrl}/pilot-guide`, {
        headers: {Origin: frontendPublicOrigin},
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`The published pilot guide is unavailable (${response.status}).`);
    return parsePilotGuideResponse(await response.json()).guide;
}
