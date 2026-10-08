# Mentor application follow-up — 8 October 2026

Removed the requested mentor appointment sentence. Staff application details
show freshly queried all-time and last-30-day attendance through the existing
JdbcUserAttendanceSummaryStore, including manual attendance and completed,
non-cancelled sessions; legacy attendance contributes to all time. Attendance
lookup failures show unavailable rather than a misleading zero. Owner history
does not query staff attendance data. The staff list has 3rem top padding.

New submissions queue one Discord embed after the application and submission
audit commit. DiscordConfig.MENTOR_APPLICATIONS_CHANNEL_ID is
1557720064252186634. The embed includes identity, rank, region, timezone, pending
status, submission time and a Review application button. Its title also links
to /dashboard/mentor-applications?applicationId=<id> at FRONTEND_PUBLIC_ORIGIN.
The dashboard opens that specific application after its normal authentication
and staff checks. The embed contains no full application answers and disables
mentions. Delivery success/failure is audited; Discord failures preserve the
saved application and are logged without user answers or credential data.
There is no automatic delivery retry or historical notification backfill.

Accounts Overview now displays application status, effective waiting period,
default versus individual setting, and the current denial deadline. Edit
cooldown reuses the application's waiting-period/date editor. Accounts without
applications can have an individual waiting period set for future denials.
Both entry points use the same override table and atomic audit implementation.
Account settings endpoints preserve moderator/admin checks, CSRF and the
impersonation prohibition. Account directory access keeps its existing policy.
Policy/latest-application revisions reject stale edits, including accounts
without a first attempt. Individual saves increment the policy revision to
invalidate an older global-settings dialog. No additional migration is needed
beyond the prepared mentor-application-decisions migration from this task.

Validation: frontend production build/TypeScript passed, targeted ESLint had
zero errors and one existing AdminAccounts navigation warning, and the final
offline Gradle compileJava passed with Java 21 using the existing local cache.
Restricted cache/Java resource access initially blocked compilation; the normal
Gradle compile succeeded after the build cache access was approved. Temporary
fallback compilation directories created during diagnosis were removed.
No tests were added or run. Screenshots and interactions used fictional local
fixture data only. No migration, real Discord notification, production decision,
application submission or deployment was performed. Confirm live database and
Discord channel permissions at release.
