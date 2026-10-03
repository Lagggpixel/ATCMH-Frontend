import type {DashboardAuthSession} from "@/src/dashboard/types/Account";
import {availableUserName} from "@/src/lib/user-display-name";

export function profileDisplayName(session: DashboardAuthSession | null): string {
  for (const provider of ["ifc", "discord"]) {
    const identity = session?.identities.find(value => value.active !== false && value.provider.toLowerCase() === provider);
    const name = availableUserName(identity?.displayName);
    if (name) return name;
  }
  return "User";
}

export function safeAvatarUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
      && (url.hostname === "community.infiniteflight.com" || url.hostname.endsWith(".discourse-cdn.com"))
      ? url.href : null;
  } catch { return null; }
}
