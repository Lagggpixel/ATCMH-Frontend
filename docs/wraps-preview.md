# Personal wraps preview

`/wraps` is a restricted design preview. The Member, Mentee and Mentor buttons let a super admin compare the three presentations. Mentor includes the complete member attendance sections as well as mentoring and mock assessment statistics.

Each view starts with a sequence of scrollable statistics, showing 2026 totals first and August totals next. Each highlight animates when it enters the central viewport; scrolling back up animates it again. There is no automatic advancement, scroll interception or pause/next/show-all/replay control. The full journal and all statistics follow naturally at the bottom, and the highlights remain above it for scrolling back through. Changing views returns to the start. Reduced-motion preferences keep the same scrollable content with animation disabled.

Highlights use an open editorial layout: large cyan totals beside their explanation on desktop, stacked on phones, with a small period/position marker and thin progress rule. Repeated card containers and scroll instruction text are removed. The final journal begins with The whole picture.

Both periods appear in the final overview: 2026 to date (through 30 September), followed by 1–31 August 2026. There are no date or period selectors. Introductory highlights derive from the same data as the overview.

The page explicitly labels its data as example activity. `src/wraps/wraps-preview.ts` contains the sample records. These numbers are not fetched from the user's attendance, mentorship or exam history. A live data adapter is still needed before presenting personal results.

Authorization uses live backend session and admin endpoints on the server. Only a valid, unexpired, non-impersonating web session with `super_admin` privileges can access the route. Other users receive HTTP 404 before page streaming. Responses are private and not cached; the route is excluded from indexing. The account menu shows Your wrap only for super admins.

The separate local Vite review harness uses a fake super admin and public example activity. It does not alter production authentication and must not be deployed as the site's authenticated route.
