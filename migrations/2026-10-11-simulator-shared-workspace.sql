-- All existing scenarios/sessions/assignments become shared through application authorization.
-- owner_id remains immutable creator attribution, never an access restriction.
-- Apply before frontend 1.8.50. Replay-safe; content and seat snapshots stay unchanged.
USE atcmh_lms;
ALTER TABLE simulator_sessions ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) NULL;
ALTER TABLE simulator_scenarios ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) NULL;
ALTER TABLE simulator_assignments ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) NULL;
CREATE INDEX IF NOT EXISTS simulator_shared_updated ON simulator_sessions (updated_at);
CREATE INDEX IF NOT EXISTS scenario_shared_updated ON simulator_scenarios (updated_at);
CREATE INDEX IF NOT EXISTS assignment_shared_created ON simulator_assignments (created_at);

-- Resolve existing canonical account IDs against their Discord identity, without
-- copying credentials or changing creator IDs. Missing names fall back to IDs in UI.
UPDATE simulator_sessions s JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'discord'
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;
UPDATE simulator_scenarios s JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'discord'
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;
UPDATE simulator_assignments s JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'discord'
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;
