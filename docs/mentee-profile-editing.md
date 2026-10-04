# Mentee profile editing

Mentors and administrators can edit a mentorship record's region, timezone and weekly UTC availability.

- Discord: `/mentee edit-profile`, optionally specifying a mentee, or run it in their registered channel. The modal checks the submitting staff member and current mentor permissions. The existing moderator `/update-mentee set-availability` also opens this profile editor.
- Dashboard: open a mentee profile and choose **Edit profile**, then **Save profile**. Cancel discards the form.
- API: authenticated `PUT /admin/mentees/:id/profile` with `region`, `timezone`, and `availability`. The existing dashboard mentor access policy applies.

Region and timezone are required strings of at most 128 characters. Timezone retains the application's human-readable format (for example Europe/London or UTC+1). Availability lists Monday through Sunday in order with valid UTC HHMM-HHMM times or Not available, at most 512 characters. All three fields persist in one SQL update and refresh the repository cache. Existing schema already supports these fields; no migration is required.

Changed profiles emit `mentee.profile.update` in the durable audit system, with the actor, exact record ID and before/after values. Dashboard attribution uses the existing account/impersonation context. The same values are sent to the configured mentee-logs channel with mentions disabled and long changes split across embed fields. Identical saves do not generate change events. Discord delivery uses the existing live bot connection and requires the configured channel and send permissions.
