#!/usr/bin/env bash
set -euo pipefail
test "$(uname -m)" = x86_64 || { echo 'An x86_64 Linux host is required'; exit 1; }
test -c /dev/kvm || { echo 'KVM unavailable. Enable nested virtualization or use a supported bare-metal host.'; exit 1; }
: "${ACCEPT_ANDROID_SDK_LICENSES:?Review https://developer.android.com/studio/terms and set ACCEPT_ANDROID_SDK_LICENSES=yes}"
test "$ACCEPT_ANDROID_SDK_LICENSES" = yes || exit 1
command -v docker >/dev/null || { echo 'Install Docker Engine and Compose using official distribution instructions first.'; exit 1; }
docker info >/dev/null
docker compose version
test -f .env || { echo 'Run scripts/bootstrap.py first, then configure HTTPS origin/domain.'; exit 1; }
test -x .venv/bin/python || { echo 'Create the Python virtual environment as documented first.'; exit 1; }
PYTHONPATH=backend .venv/bin/python -c "from app.config import Settings; s=Settings.from_env(); assert s.cookie_secure and s.public_url.startswith('https://'), 'Set HTTPS PUBLIC_URL and COOKIE_SECURE=true before deployment'"
docker build -f runtime/Dockerfile -t clouddroid-android:local .
docker compose config --quiet
docker compose up -d --build
echo 'Check HTTPS /healthz, sign in, launch one profile, then run the live acceptance runbook.'
