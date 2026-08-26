// Rolling-deploy compatibility. New clients use /api/auth/login.
import {GET as unifiedLogin} from "@/src/app/api/auth/login/route";

export const runtime = "nodejs";
export const GET = unifiedLogin;
