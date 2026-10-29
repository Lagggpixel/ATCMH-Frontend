# Simulator SQLite storage

`SIMULATOR_SQLITE_PATH` selects the imported SQLite database for simulator sessions,
replays and frames, scenarios and revisions, attempts, assignments, staff preferences,
position feedback and owner interventions. Account authentication and email preferences
continue to use MariaDB. ATCMH's LMS and notification preferences continue to use MariaDB.
Without this setting, the simulator uses its existing MariaDB storage.

Use separate persistent directories:

- ATCMH: `/mnt/HC_Volume_104384073/sweatbox/atcmh`
- Standalone: `/mnt/HC_Volume_104384073/sweatbox/standalone`

Mount the relevant directory into both the web and retention containers at `/app/data`,
owned by uid/gid 1001, and set `SIMULATOR_SQLITE_PATH=/app/data/simulator.sqlite` in
both services. The directory must also hold SQLite's WAL and shared-memory files.
Do not share one database between these hosts or mount it over a network filesystem.

The worker performs SQLite operations outside the web event loop. A transaction queue
and nested transaction context keep session/replay/scenario writes atomic; SQLite
serializes writers from other processes. WAL permits readers during writes. FULL
synchronization and a bounded busy timeout are configured. The web service fails
closed if the database is missing or its storage version is unsupported.

## Import and cutover

First build and verify the production images locally. During the authorized maintenance
window stop both the web and retention consumers for the host being migrated. Preserve
encrypted stack recovery and the unchanged source MariaDB tables. Run the new image's
`node storage/import-simulator.mjs` with its existing MYSQL variables, the persistent
mount, and the destination SIMULATOR_SQLITE_PATH. Never expose these variables in logs.

The importer reads a consistent MariaDB snapshot, derives columns and indexes from
schema metadata, imports bounded pages by primary key, and verifies every page's content.
It checks SQLite integrity and foreign keys before publishing the database filename.
It refuses an existing destination; failed incomplete copies are removed. Original
MariaDB records are never modified by the importer. Counts alone do not verify content.

Start the checked web and retention images with the persistent mount and configuration.
Verify session access and persistence, replay reading, scenario lifecycle, health,
retention dry-run and unrelated service identities. Record the imported row counts and
release identities. There is no automatic data migration on application startup.

## Recovery and backups

Before any new SQLite writes are accepted, a failed cutover can return to the preserved
MariaDB source and preceding stack configuration. Once SQLite accepts new writes,
switching back to stale MariaDB would discard those updates: quiesce consumers and
reconcile data before changing storage back. Do not blindly redeploy an old image.

Back up an active SQLite database through SQLite's backup facility, or stop both
consumers and checkpoint before copying it. Copying only the database file during
live writes can omit committed WAL contents. Keep backups outside the web document
root, with restricted access. No automatic deletion of the source MariaDB tables is
part of this migration.
