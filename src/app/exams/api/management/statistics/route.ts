import {requireManagementCapability} from "@/src/lib/discord-auth";
import {getExamStatistics} from "@/src/lib/exam-statistics";
import {parseStatisticsWindow} from "@/src/lib/statistics-window";
import {corsPreflight, withManagementCors} from "@/src/lib/management-cors";
import {managementAuthorizationError, managementError, ManagementValidationError} from "@/src/lib/management-route";
import {assertManagementCapability} from "@/src/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const actor = await requireManagementCapability(request, "review-attempts");
    if (actor instanceof Response) return withManagementCors(request, await managementAuthorizationError(actor));
    try {
        assertManagementCapability(actor, "review-attempts");
        const window = parseStatisticsWindow(new URL(request.url).searchParams);
        return withManagementCors(request, Response.json(await getExamStatistics(window), {headers: {"Cache-Control": "private, no-store"}}));
    } catch (error) {
        if (error instanceof ManagementValidationError) return withManagementCors(request, managementError(error));
        return withManagementCors(request, Response.json({error: "Exam reporting is temporarily unavailable."}, {status: 503}));
    }
}

export function OPTIONS(request: Request) { return corsPreflight(request); }
