// Rolling-deploy compatibility for links issued before session unification.
import {GET as unifiedCallback} from "@/src/app/api/auth/callback/route";

export const runtime = "nodejs";
export const GET = unifiedCallback;
