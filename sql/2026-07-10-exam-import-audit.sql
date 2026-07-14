-- Additive only. Review and apply through the deployment migration process; do not run automatically.
CREATE TABLE IF NOT EXISTS exam_import_audit (
  idempotency_key CHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  imported_by_discord_id VARCHAR(20) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result_quiz_id CHAR(36) NOT NULL,
  result_ids JSON NOT NULL,
  PRIMARY KEY (idempotency_key)
);

CREATE TABLE IF NOT EXISTS exam_import_previews (
  nonce CHAR(36) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  imported_by_discord_id VARCHAR(20) NOT NULL,
  binding_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  PRIMARY KEY (nonce),
  KEY exam_import_previews_expiry_idx (expires_at)
);
