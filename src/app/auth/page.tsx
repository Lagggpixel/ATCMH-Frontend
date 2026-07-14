import {redirect} from "next/navigation";
import {homeLoginHref, safeLoginReturnTo} from "@/src/platform/auth/login-routing";

export default async function AuthCompatibilityPage({searchParams}: {searchParams: Promise<{returnTo?: string; authError?: string; authRef?: string}>}) {
  const {returnTo, authError, authRef} = await searchParams;
  redirect(homeLoginHref("dashboard", safeLoginReturnTo("dashboard", returnTo), authError, authRef));
}
