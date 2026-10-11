-- Some existing Discord identities have no stored display name. Use the same
-- account's active IFC identity as a verified fallback; never infer another user.
USE atcmh_lms;
UPDATE simulator_sessions s JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'IFC'
  AND i.active_account_provider IS NOT NULL
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;
UPDATE simulator_scenarios s JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'IFC'
  AND i.active_account_provider IS NOT NULL
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;
UPDATE simulator_assignments s JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'IFC'
  AND i.active_account_provider IS NOT NULL
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;
