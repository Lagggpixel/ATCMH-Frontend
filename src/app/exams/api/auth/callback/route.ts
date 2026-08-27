// Legacy callback alias; the shared main-site callback owns the browser session.
import {GET as unifiedCallback} from "@/src/app/api/auth/callback/route";

export const runtime = "nodejs";
export const GET = unifiedCallback;
