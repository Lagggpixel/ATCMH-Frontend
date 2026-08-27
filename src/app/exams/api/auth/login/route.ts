// Legacy Exams URL delegates to the main-site shared login.
import {GET as unifiedLogin} from "@/src/app/api/auth/login/route";

export const runtime = "nodejs";
export const GET = unifiedLogin;
