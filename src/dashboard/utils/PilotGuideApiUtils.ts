import type {PilotGuide} from "@/src/learning/pilot-guide";
import {parsePilotGuideResponse, pilotGuideRevisionHeader, pilotGuideWriteRequest} from "@/src/lib/pilot-guide-contract";
import {ApiUtils} from "./ApiUtils";

export class PilotGuideRequestError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = "PilotGuideRequestError";
    }
}

async function guideFromResponse(response: Response): Promise<PilotGuide> {
    if (!response.ok) {
        const messages: Record<number, string> = {
            401: "Your ATCMH session has expired. Sign in again before editing the guide.",
            403: "You do not have permission to edit the pilot guide.",
            409: "The pilot guide changed since you opened it. Reload the latest guide before saving.",
            428: "The guide revision is missing. Reload the guide before saving.",
        };
        let message = messages[response.status] ?? "The pilot guide request failed. Please try again.";
        if (response.status === 400 || response.status === 422) {
            const body = await response.json().catch(() => null) as {error?: unknown} | null;
            if (typeof body?.error === "string" && body.error.trim()) message = body.error.trim().slice(0, 300);
        }
        throw new PilotGuideRequestError(message, response.status);
    }
    const body: unknown = await response.json();
    return parsePilotGuideResponse(body).guide;
}

export class PilotGuideApiUtils {
    static async getGuide(csrfToken: string | null, signal?: AbortSignal): Promise<PilotGuide> {
        if (!csrfToken?.trim()) throw new PilotGuideRequestError("Sign in again before editing the pilot guide.", 401);
        return guideFromResponse(await fetch(`${ApiUtils.apiOrigin}/admin/pilot-guide`, {
            credentials: "include", cache: "no-store", signal,
        }));
    }

    static async saveGuide(guide: PilotGuide, csrfToken: string): Promise<PilotGuide> {
        if (!csrfToken.trim()) throw new PilotGuideRequestError("Sign in again before saving the pilot guide.", 401);
        return guideFromResponse(await fetch(`${ApiUtils.apiOrigin}/admin/pilot-guide`, {
            method: "PUT",
            credentials: "include",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken,
                "If-Match": pilotGuideRevisionHeader(guide.revision),
            },
            body: JSON.stringify(pilotGuideWriteRequest(guide)),
        }));
    }
}
