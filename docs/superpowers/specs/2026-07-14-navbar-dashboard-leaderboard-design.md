# Navbar Dashboard and Leaderboard Design

## Goal

Expose the unified application's staff entry point and public attendance leaderboard from the marketing navbar without weakening the existing application-scoped authentication boundary.

## Design

- Add `Leaderboard` as a normal primary-navigation link to the public `/leaderboard` route.
- Add `Dashboard` as a normal primary-navigation link to `/auth?returnTo=/dashboard`. The existing auth page will continue an authenticated Dashboard session or present the central sign-in choices when no session exists.
- Render `/leaderboard` with the existing attendance leaderboard component and Dashboard session provider so its account menu and sign-in behavior remain intact.
- Change the leaderboard's signed-out return destination from the retired `/home` path to `/leaderboard`.
- Add the exact `/leaderboard` path to the backend Dashboard return policy. Descendants and prefix lookalikes remain rejected.

## Security and compatibility

The leaderboard remains public and uses the existing public user-data request. Authentication stays in the Dashboard audience, and the backend continues to validate every return destination against a canonical same-origin path allowlist. No new cross-origin requests or client-visible secrets are introduced.
