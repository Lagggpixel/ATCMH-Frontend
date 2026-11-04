# Test the private ATCMH Sweatbox runtime locally

This first migration slice moves ATCMH's session, scenario and replay APIs into a separate Node process. The Next.js app still verifies the browser login and CSRF token and serves the existing routes. When configured, it sends short-lived actor details to the runtime over IPv4 loopback. Live streams reconnect periodically so the web app can recheck browser access. Airport data and Pocket speech still use the web app's routes and ask the runtime for assignment or radio-message authorization.

Use Node 24. In a fresh checkout, install the locked dependencies with `npm ci`.

## Run the smoke test

```text
node --import tsx --test src/simulator/sqlite-session-store.test.ts
```

This uses a disposable SQLite database and synthetic accounts. It exercises real loopback HTTP without a dashboard backend, email, Discord, or speech service. It creates and publishes a scenario, launches it, checks mentor and mentee access, advances a session over the event stream, reconnects, and opens the replay after archiving. The test runner needs permission to connect to loopback.

## Try the browser flow

Use the normal local ATCMH website sign-in configuration. Create an empty disposable simulator database at a new path in an existing directory.

```text
node storage/create-local-sweatbox-db.mjs <new-sqlite-path>
```

The command prints the absolute path for the runtime and refuses to replace an existing file. To use existing test scenarios instead, take a SQLite backup of an ATCMH version-1 test database or stop its writers and checkpoint it before copying. Set the same freshly generated key of at least 32 characters in both terminals. Keep the key outside Git.

| Process | Environment | Command |
| --- | --- | --- |
| Runtime | `SWEATBOX_RUNTIME_KEY`, `SIMULATOR_SQLITE_PATH` set to the absolute path of the disposable database. `SWEATBOX_RUNTIME_PORT` defaults to `4317`. | `npm run sweatbox:runtime` |
| ATCMH web | Usual development sign-in settings, `SIMULATOR_ENABLED=true`, `SWEATBOX_RUNTIME_KEY`, and `SWEATBOX_RUNTIME_URL=http://127.0.0.1:4317`. Leave `SIMULATOR_SQLITE_PATH` unset in this process. | `npm run dev -- --webpack` |

1. Open `/sweatbox` on the configured local web origin and sign in as a mentor.
2. Save and publish a Ground & Tower scenario. Launch it, open the mentor view, and press Play. Open the assigned mentee view using another signed-in browser profile if available.
3. Issue a command and check that updates continue across a refresh. End the session and open its replay. If the runtime stops, Sweatbox requests report it as unavailable until it restarts.

The runtime entry point suppresses Discord notification delivery and speculative Pocket speech calls. If testing audio, configure the web app with a test speech service or use browser fallback. Leave retention jobs off for the disposable database. Without `SWEATBOX_RUNTIME_URL`, the web app uses its existing in-process handlers.

Remaining migration work includes moving notification delivery back to the web app, moving maintenance ownership, adding the standalone site policy and store, and rehearsing the Portainer handoff and rollback. This entry point only listens on the local machine.
