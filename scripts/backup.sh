#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
: "${BACKUP_RECIPIENT:?Set your age public recipient key; keep its private key offline}"
command -v age >/dev/null
test -z "$(docker ps -q --filter label=clouddroid.managed=true)" || { echo 'Stop all Android sessions before backing up'; exit 1; }
mkdir -p backups
backup_path="$(mktemp -d)"
trap 'rm -rf -- "$backup_path"; docker compose start api >/dev/null' EXIT
docker compose stop api
docker compose exec -T db pg_dump -U clouddroid --format=custom clouddroid > "$backup_path/database.dump"
docker volume ls --format '{{.Name}}' | while IFS= read -r volume; do
  if [[ "$volume" =~ ^clouddroid-[0-9a-f-]{36}-data$ ]]; then
    docker run --rm --network none --mount "type=volume,source=$volume,target=/source,readonly" \
      --mount "type=bind,source=$backup_path,target=/backup" ubuntu:24.04 \
      tar czf "/backup/$volume.tgz" -C /source .
  fi
done
tar -C "$backup_path" -cf - . | age -r "$BACKUP_RECIPIENT" -o "backups/clouddroid-$(date -u +%Y%m%dT%H%M%SZ).tar.age"
echo 'Encrypted backup created. Preserve ENCRYPTION_KEY separately; it is intentionally absent from this archive.'
