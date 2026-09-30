
### Live community counts

The home page requests `/api/dashboard/public/community-stats` through the existing
`DASHBOARD_API_URL` relay on load, every minute while visible, and when returning to
the tab. Members round down to hundreds; graduates round down to fifties. The hero
and About cards share the same response. Missing counts display `—`; a failed
refresh retains the last available count with an unavailable tooltip.

Deploy the backend community statistics route alongside the frontend. It uses the
existing bot's ATCMH guild and `GRADUATE_ROLE_ID`, requires a connected gateway and
fully loaded member cache, and returns only aggregate counts. No new Discord
credentials or database changes are required.

### Website access evidence

The Next proxy reports each meaningful page/API request to the backend through
`POST /internal/auth/request-events`, using the existing `DASHBOARD_API_URL` and
server-only `EXAMS_AUTH_KEY`. Static assets, Next internals, health checks and
OPTIONS requests are excluded. The report contains only the pathname (never the
query), method, optional central session token and unchanged forwarding chain.
The backend resolves the client IP using its trusted-proxy configuration.

Production Next instances must only be reachable through ingress that appends the
actual peer to `X-Forwarded-For`; arbitrary client-provided forwarding headers are
not authoritative. Missing/oversized chains are not replaced with a guessed IP.
Same-origin `/api/access` requests also capture cached client navigation, restored
pages and returning to a visible tab. Requests served completely offline cannot be
observed until a beacon reaches the network; this is not an interval-based monitor.
Backend relay calls carry a derived, reporting-only HMAC marker so the frontend's
egress IP is not mistaken for a visitor. The generic relay never forwards client
internal headers or supplies the internal service key, and blocks `/internal`.
Reporting failures are bounded by a timeout and do not block browsing.
