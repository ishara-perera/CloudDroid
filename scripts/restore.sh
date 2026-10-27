#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
archive=${1:?Pass an encrypted CloudDroid backup archive}
: "${BACKUP_IDENTITY_FILE:?Set the age private identity file path}"
test "${RESTORE_CONFIRM:-}" = replace_clouddroid_database || { echo 'Set RESTORE_CONFIRM=replace_clouddroid_database after reading docs/ADMIN.md'; exit 1; }
command -v age >/dev/null
test -z "$(docker ps -q --filter label=clouddroid.managed=true)" || { echo 'Stop Android before restoring'; exit 1; }
restore_path=$(mktemp -d)
trap 'rm -rf -- "$restore_path"' EXIT
age --decrypt -i "$BACKUP_IDENTITY_FILE" "$archive" > "$restore_path/archive.tar"
python3 scripts/unpack-backup.py "$restore_path/archive.tar" "$restore_path"
test -s "$restore_path/database.dump"
for file in "$restore_path"/clouddroid-*-data.tgz; do
  test -f "$file" || continue
  volume=$(basename "$file" .tgz)
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    echo 'Destination profile volume already exists; use a clean host.'
    exit 1
  fi
done
docker compose stop api
docker compose up -d --wait db
docker compose exec -T db pg_restore -U clouddroid -d clouddroid --clean --if-exists --no-owner < "$restore_path/database.dump"
docker compose exec -T db psql -U clouddroid -d clouddroid -c 'DELETE FROM sessions;'
for file in "$restore_path"/clouddroid-*-data.tgz; do
  test -f "$file" || continue
  volume=$(basename "$file" .tgz)
  docker volume create "$volume" >/dev/null
  docker run --rm --network none --mount "type=volume,source=$volume,target=/restore" \
    --mount "type=bind,source=$restore_path,target=/backup,readonly" ubuntu:24.04 \
    tar xzf "/backup/$volume.tgz" -C /restore
done
docker compose start api
echo 'Restore imported; all sessions revoked. Complete the post-restore acceptance checks.'
