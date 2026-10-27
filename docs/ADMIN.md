# Administrator runbook

## Security model

CloudDroid has one administrator. That administrator intentionally has access to every profile's inbox and notes. Profiles isolate Android disks/processes/network namespaces; they do not create mutually distrustful users or conceal all hardware identifiers. The API's Docker socket is root-equivalent. Use a dedicated host, patched OS/Docker/emulator, an HTTPS origin, restrictive cloud firewall rules, and encrypted host disks. Do not put this app on shared hosting or treat Android apps as a malware sandbox.

Sensitive profile labels/recovery notes, proxy credentials, provider credentials, SMS bodies and call details are encrypted with Fernet authenticated encryption before DB writes. Profile IDs/display names, provider event IDs, event kinds/timestamps and phone-number resource SIDs are operational metadata, not encrypted columns. Android AVD disks are protected by the host disk's encryption, not Fernet. Root or an attacker with the running API and master key can decrypt protected fields. Backups must be encrypted and their keys managed separately.

Sessions are opaque random tokens stored as SHA-256 digests. Cookies are HttpOnly/SameSite=Strict, Secure for HTTPS, with an eight-hour default expiry. Mutations also require the session's CSRF token and exact Origin. Sign-in is limited to five attempts per source address per five minutes. API rate limits are bounded in-memory and depend on the single API process; they are not a distributed protection service. Caddy TLS terminates on the same host. Requests forwarded from Caddy appear local to the API, so login throttling is effectively shared among remote users, appropriate to the single-admin design. No MFA, SSO, password-reset email, or distributed scheduler is implemented.

WebRTC sessions are profile-bound, last at most ten minutes, and close on logout/stop/archive/delete. Browser navigation closes its peer and voice receiver. TURN credentials expire after ten minutes. Twilio tokens allow incoming calls only, use a profile identity and renew through the authenticated API. Provider-issued tokens already handed to a browser can remain valid until their ten-minute expiry; immediate third-party token revocation is not implemented. For an account compromise, rotate provider API secrets as well.

## Secrets and password reset

- Keep `.env` out of git, shared folders and backup archives that lack encryption. Bootstrap restricts file permissions; Windows uses the current user's ACL. Recheck server ownership/mode after copying files.
- Preserve ENCRYPTION_KEY independently of data backups. Losing it means losing access to encrypted notes, proxies and messages. Do not run bootstrap to generate a replacement key against an existing database.
- To change an administrator password, generate a new Argon2 hash without echoing the password:

```bash
.venv/bin/python -c 'import getpass; from argon2 import PasswordHasher; print(PasswordHasher().hash(getpass.getpass("New password: ")))'
```

For Windows use `".\.venv\Scripts\python.exe"` in the equivalent PowerShell invocation with `&` and double-quote the Python code. Update only ADMIN_PASSWORD_HASH in `.env`, preserving its surrounding single quotes so `$` characters are literal. The hash is not the password, but should still be protected. Stop the API, delete existing sessions, then start it with the new configuration:

```bash
docker compose stop api
docker compose exec -T db psql -U clouddroid -d clouddroid -c 'DELETE FROM sessions;'
docker compose up -d api
```

In local SQLite mode, stop the process, run Python's sqlite3 connection against `data/clouddroid.db` and execute `DELETE FROM sessions`, commit, then restart. Do not delete profile tables to reset a password.

Encryption-key rotation requires a controlled migration: back up and stop writes, decrypt each encrypted column using the existing key, re-encrypt with the new key, atomically commit, replace the configured key and test a restore. No automated rotation endpoint is supplied. Do not change the key alone.

Provider secrets can be updated in Settings after a successful provider check. You must unassign all numbers before changing the provider account SID. Recheck each assignment after provider number ownership/capability changes. Ownership is established at assignment time, not guaranteed indefinitely.

## Logs and health

```bash
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 caddy
docker ps -a --filter label=clouddroid.managed=true
```

Application logs contain request UUID/method/status and generic runtime monitor events. They exclude bodies, credentials, cookies, tokens, URLs, SMS text and verification codes. Uvicorn access logging is disabled; Caddy access logging is not enabled. Do not enable verbose Twilio/HTTP client debug logging against real private messages. Emulator/Docker startup logs are separate and can contain Android debugging information; restrict their retention and access. Never collect screenshots or crash dumps of signed-in accounts for public bug reports.

`/healthz` reports control-plane/DB health. It does not establish Android boot readiness, public US egress, or provider availability. Android readiness uses `sys.boot_completed`; network diagnostics need a running profile and expire after 120 seconds. Dashboard CPU/memory measures the API host. It is not per-profile billing or a proven capacity forecast.

Use a single API worker. Additional workers would invalidate in-memory lifecycle locks, media ownership and rate limits. Set cloud billing alerts, disk-space monitoring, log rotation and provider spending limits through your infrastructure/provider controls. Container limits are currently fixed at 2 CPUs/4 GB and the active slot count is configurable.

## Backups

On the Linux PostgreSQL deployment, stop every Android session through the UI. A suspended session is still active and cannot be included in a consistent offline backup. Install `age` and generate a backup key pair in your own secure key-management workflow. Keep the private identity off the Android host where practical.

```bash
export BACKUP_RECIPIENT=age1YOUR_PUBLIC_RECIPIENT
bash scripts/backup.sh
```

The script refuses active Android containers, stops API writes, dumps PostgreSQL, archives each managed profile volume, encrypts the complete backup using age, and restarts the API. It does not include ENCRYPTION_KEY or provider/cloud master credentials. Maintain those through a separate protected secret channel. Temporary plaintext is created only in a restrictive local directory; the host disk must be encrypted. Run as an account authorized to access Docker and the temporary directory. First pull `ubuntu:24.04` before an offline backup so the helper image is available.

Test backups by restoring onto a separate clean host; file existence alone is not proof of recoverability. Provider-side SMS/call retention and purchased numbers are outside this backup. Reset/revoke sessions after restoration. Copy the age archive to private off-host storage and use a retention policy appropriate for private messages. Secure file deletion of SSD/cloud snapshots is not guaranteed by deleting the application row or file.

For local SQLite development: stop the server, copy `data/clouddroid.db` into an encrypted archive, and preserve `.env`/ENCRYPTION_KEY separately. Do not copy a live SQLite file without using SQLite's backup API or stopping writes. Screenshots and initial password files are not needed in backups.

## Restore

Use a clean dedicated host and the tested source/container versions. Restore `.env` from your separate secret store, especially the original ENCRYPTION_KEY. Start PostgreSQL, keep API stopped, and decrypt the age backup into a private directory. The supplied helper validates the archive's outer file names and refuses profile volumes that already exist:

```bash
export BACKUP_IDENTITY_FILE=/secure/offline-derived-age-identity.txt
export RESTORE_CONFIRM=replace_clouddroid_database
bash scripts/restore.sh /secure/clouddroid-backup.tar.age
```

This replaces the CloudDroid database, imports profile volumes, clears administrator sessions and starts the API only on successful completion. Use a clean destination: the script aborts if any volume it needs already exists. It does not merge Android data and does not remove unrelated volumes. On failure, leave API stopped, inspect only sanitized errors, and recover from the original archive rather than partially starting a mixed state.

After restoring, sign in, inspect labels/notes, start each profile separately and check app/browser state, phone assignments, egress/DNS and webhook delivery. Confirm key custody and off-host backup access. Recreate/verify HTTPS DNS and TURN; those external services are not restored by a DB dump. Rebuild/pin the same Android SDK/image revision so AVD compatibility is preserved.

## Deletion and retention

Archive stops Android and retains storage. Delete removes DB events/configuration and the managed Android volume when the runtime is enabled and reachable. A Docker failure prevents the API from declaring deletion successful. Do not disable/move the runtime before cleaning up volumes on its original host. Cloud snapshots, external backup copies and provider history require their own retention/deletion procedures. Deleting/unassigning a profile never cancels a paid number; release it through your provider when you intend to stop billing.

SMS webhook IDs are deduplicated while the event exists. Clearing an inbox removes those local deduplication rows; a later valid provider retry can therefore reappear. Twilio signatures have no application-enforced timestamp. Do not replay saved signed webhooks against reassigned production numbers. A production extension should preserve minimal receipt tombstones with a defined retention period before allowing long-lived number reuse across profiles.

## Updates

Back up first. Test dependency/emulator image updates on an isolated host. Run backend tests, lint, TypeScript build and browser tests, then repeat live Android isolation, firewall outage, DNS and phone checks whenever runtime/network/provider versions change. `npm audit --omit=dev` was checked for the delivered dependency tree; it is not a security audit of Android or this application. Review OS/base-image vulnerabilities and SDK licenses independently before deployment.
