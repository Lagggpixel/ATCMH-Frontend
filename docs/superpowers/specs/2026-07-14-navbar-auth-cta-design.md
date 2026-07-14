# Navbar authentication CTA

## Goal

Replace the shared header's `Enroll Now` button with the existing permission-aware authentication control. Preserve the rule that a signed-out Login control is available only on the home page.

## Behavior

- Desktop renders navigation links in the center and one authentication area in the former primary CTA position.
- The authentication area shows a loading placeholder while Dashboard session state is unresolved.
- On the home page, a signed-out user sees the existing Login link, which opens the home login modal and returns to `/`.
- Leaderboard, Exams, legal, account, and Dashboard pages do not show a signed-out Login control.
- A valid Dashboard session shows Account and Log out. Dashboard appears only after the live admin capability request succeeds.
- An Exams-only session continues to show its Exams session accessory without implying Dashboard authorization.
- Mobile retains the same authentication state inside the mobile navigation menu because the desktop CTA position is hidden at the mobile breakpoint.
- The authentication control is removed from the center desktop navigation so it is rendered only once.

## Implementation

`SiteHeader` will render `AuthNavigation` inside a dedicated primary-action container after the desktop navigation. The mobile menu will continue rendering its own responsive instance. Existing `PortalAuthProvider`, `headerAuthState`, and home-login routing remain unchanged.

CSS will style the new authentication area with the existing blue primary-button treatment while allowing authenticated controls to fit without overflow. No security, session, routing, or backend behavior changes are required.

## Testing

- Add a source contract that fails while `Enroll Now` remains and while desktop authentication is nested in the center navigation.
- Assert the new primary-action container owns desktop authentication.
- Preserve the existing header-state tests for loading, signed out, account, administrator, backend unavailable, and Exams-only states.
- Run the full frontend tests, ESLint, production build, and `git diff --check`.
- Browser-check desktop and mobile header placement and confirm the home modal still opens correctly.
