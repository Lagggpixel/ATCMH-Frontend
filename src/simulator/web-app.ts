import type {MetadataRoute} from "next";

/**
 * Home Screen install for mentees on iOS, where the fullscreen API is missing (iPhone) or easy to drop (iPad).
 * Scope is the whole site so sign-in at "/?login=1" stays inside the installed app.
 */
export const sweatboxManifest = {
  id: "/sweatbox/mentee",
  name: "ATCMH Sweatbox",
  short_name: "Sweatbox",
  description: "Join Sweatbox sessions your ATCMH mentor assigns to you.",
  start_url: "/sweatbox/mentee",
  scope: "/",
  display: "standalone",
  orientation: "any",
  background_color: "#f6f3ee",
  theme_color: "#12264a",
  icons: [{src: "/dashboard-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any"}],
} satisfies MetadataRoute.Manifest;
