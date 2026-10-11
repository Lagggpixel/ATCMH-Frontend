-- Apply before deploying account-persistent simulator preferences.
-- Preferences survive ending all sessions and are scoped to the central staff account.
CREATE TABLE IF NOT EXISTS atcmh_lms.simulator_staff_preferences (
  account_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  auto_readback TINYINT(1) NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
