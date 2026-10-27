# CloudDroid

A private Android control plane with a responsive React interface, FastAPI backend, isolated profile storage, configurable egress, and inbound Twilio SMS/voice adapters.

**Current delivery: a working, locally tested control plane and an implemented Linux/KVM runtime integration awaiting live host validation. This is not an already deployed cloud Android service.** No cloud resources, proxy subscriptions, Google accounts, or telephone numbers were created. No fake Android session or fabricated provider/network success is shown.

![CloudDroid desktop interface](docs/screenshots/desktop-dashboard.png)

## Start on Windows 11

Prerequisites: Python 3.13 and Node 22.12+ (Node 25 was used for local verification).

```powershell
Set-Location -LiteralPath 'C:\Workspace (D)\Projects\Gmail Accounts'
.\scripts\start-local.ps1
```

For a fresh checkout, the script installs dependencies, asks for an administrator password, builds the UI, and starts the server at **http://localhost:8000**. If PowerShell's script policy blocks the script, execute its commands individually instead of changing your machine-wide policy.

In this delivered workspace, dependencies are already installed, the UI is built, and `.env` already exists. The generated first-use password is in `data/initial-admin-password.txt`; username is `admin`. Store the password securely, then delete that plaintext file. Its value was not printed in logs or embedded in source. Restart the local application directly with:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
```

Local mode uses a real SQLite database, encrypted sensitive fields, real authentication, and three initial profiles: Personal, Work, Research. Start/viewer/network-provider actions accurately report unavailable prerequisites. The initial profiles are created once; deleting all profiles does not reseed them on restart. An Android phone cannot reach your PC's loopback URL; use the HTTPS cloud deployment for cross-device access.

## Implemented features and boundaries

| Capability | Implementation | Verified here |
|---|---|---|
| Administrator login/logout | Argon2 password hash, opaque hashed sessions, expiry, HttpOnly cookie, Origin + CSRF validation, throttling | API and real browser tests |
| Three independent profile records | CRUD, labels, encrypted recovery notes, archive/restore, configuration-only cloning | API and browser tests |
| Android data separation | One persistent named Docker volume and separate container/namespace per UUID | Adapter and path checks; actual Android disk/cookie isolation pending KVM run |
| Start/stop/restart/suspend/delete | Docker/ADB integration, one active slot by default, 2 CPUs/4 GB per container | Source and unit checks; actual emulator lifecycle pending |
| Browser Android access | WebRTC/aiortc, ADB screen capture, touch/swipe, ASCII keyboard/text paste, Android navigation, full screen | UI/adapter checks; real media negotiation pending host |
| US egress | US host placement or supplied proxy; two independent IP observers and country database | Diagnostics implementation; no real US IP verified |
| Proxy import | One HTTP, HTTPS CONNECT or SOCKS5 URL, optional credentials, text-file import | Validation, encryption, hostname rebinding checks |
| Fail-closed networking | Persistent OUTPUT DROP firewall; emulator TCP redirected to connector; pinned upstream only; DNS via DoH; IPv6/external UDP blocked | Policy tests; live packet/outage test pending |
| Network health | Automatic checks after boot and every ~60 seconds, manual checks, timestamps, stale status after 120 seconds | API state handling; actual route pending |
| DNS leak testing | Enforced DoH path plus button opening an independent browser test | Enforcement source only; external authoritative attribution explicitly pending |
| Owned US telephone numbers | Authenticated inventory; ownership, valid US country and inbound capability checks before assignment | Adapter/fixture tests; live account pending |
| Inbound SMS/calls | Official signature validation, destination-bound encrypted inbox/history, SMS deduplication, monotonic call status, per-profile TwiML client identity | Signed provider-fixture tests; real delivery pending |
| Browser voice | Twilio Voice SDK; short-lived receive-only tokens, renewal, answer/reject/end controls | Token and routing tests; real microphone/call pending |
| Google account workflow | Open official registration in Android; manual completion; user-supplied label | Fixed official URL implementation; real Google session pending |
| Desktop/mobile layout | Responsive interface across all six screens | Chromium desktop and Pixel 7 viewport tests; physical Android browser/media acceptance pending |
| Deployment/recovery | Compose, Caddy HTTPS, GCE provisioning, host validation, encrypted offline backups and recovery runbook | Shell syntax checked; Docker/cloud deployment not executed |

The initial stream targets **5 fps**, which is suitable as a baseline admin viewer, not a measured low-latency production stream. Android audio, bidirectional system clipboard, full Unicode input/IME, pinch/multitouch, background browser phone reception, verified Google account connection status, account OAuth linking, MMS attachment retrieval, outbound telephony, and multiple administrators are not implemented. Text paste is one-way printable ASCII input; avoid literal `%s`, which Android's input command interprets as a space. Reconnect the Android stream after its 10-minute authorization window. A native emulator WebRTC upgrade is described in the architecture document.

## Cloud installation

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The reference target is a dedicated US x86_64 Ubuntu 24.04 host with working `/dev/kvm`, Docker Engine/Compose, an HTTPS domain, an encrypted persistent disk, and TURN for reliable media across cloud NAT/mobile networks. Start with 2 vCPU / 8 GB for one active session and three stored profiles; consider 4 vCPU / 16 GB if measurements show contention. Neither size has been load-tested for this project.

Docker Desktop alone is not the official KVM deployment path. An installed WSL Ubuntu distribution here exposes `/dev/kvm`, but has no Docker CLI/daemon configured; no emulator was installed or booted in it. A cloud deployment is still required for a remotely hosted service.

**Android licensing is a real deployment gate.** Google's container scripts are experimental. The SDK license describes development uses and separately treats open-source components; it does not establish permission for an unrestricted general-purpose hosted account-management service. Review the [official SDK terms](https://developer.android.com/studio#terms) for your exact intended use before building/deploying Google SDK or Google-services images. A source-built AOSP alternative has a different licensing/component path and does not automatically include licensed Google services. CloudDroid does not bundle or redistribute a system image. [Official container project](https://github.com/google/android-emulator-container-scripts).

## Use the application

1. Sign in. Create or edit a profile. Labels are user assertions, not verified Google connections.
2. On a configured host, start one profile in **Android viewer**. Wait for Android boot, then select **Connect viewer**. Stop it before starting another profile when the default one-slot limit applies.
3. In **Network**, choose host egress or import your own proxy. Stop Android before changing routes. Launch it again, run diagnostics, inspect country/IP/timestamp, and run the independent DNS test inside Android.
4. Select **Open Google registration** in the viewer. Complete registration and any required verification manually through Google. Save a label only after you confirm the result yourself. Existing accounts are managed inside their own Android sessions.
5. In **Settings**, enter Twilio credentials. The backend checks provider authentication before saving. In **Phone center**, check inventory and assign a legitimately owned US number. Configure the signed HTTPS webhooks described in deployment instructions.
6. Enable the voice receiver to receive browser calls for the selected profile. Switching profiles destroys the old receiver and clears its displayed inbox state.

Profile deletion removes its DB metadata/events and, on an enabled reachable runtime, its container and Android volume. It **does not cancel/release a billed provider number**. Archive retains the profile disk. Suspend pauses the process but still reserves memory and the active slot. Stop retains disk data and frees the slot. Running more sessions requires raising the configured limit and provisioning enough CPU/RAM; this is a single-host design, not an implemented distributed scheduler.

## Costs

The web/API/database, Caddy, WebRTC libraries and routing code are free/open-source software. Google services and SDK images have their own terms. A free trial is distinct from an ongoing free tier.

| Cost category | What to expect |
|---|---|
| Free software | React/FastAPI/PostgreSQL/Caddy/aiortc and CloudDroid routing code; infrastructure still costs money |
| Ongoing cloud free tier | The GCE E2-micro offer is unsuitable for this nested-KVM emulator; no suitable permanent free host was established |
| Time-limited trials | Cloud credits and Twilio trials depend on account eligibility and expire or have restrictions; they are not the operating budget |
| Paid infrastructure | Supported US KVM host, persistent storage, IP/bandwidth, optional proxy, domain, backup storage and TURN traffic |
| Paid telephone service | Legitimately acquired numbers, rental, SMS segments, call legs and applicable fees |

The documented GCE N2 reference starts at approximately **$83/month before bandwidth, backups, domain, taxes and telephone service**, using 730 hours of a $0.097118/hour N2-standard-2, an estimated $8/month 80 GB balanced disk, and $3.65/month public IPv4. This is an estimate for the supported reference deployment, not a quote or a claim to be the cheapest host worldwide. Limiting active profiles to one and using the US host's egress avoids separate proxy costs. A metered VM used only during development costs less, but offline webhooks and calls will not reach CloudDroid. Free-tier E2 instances do not support the required nested virtualization. [Compute pricing](https://cloud.google.com/compute/pricing/general-purpose), [disk pricing](https://cloud.google.com/compute/disks-image-pricing), [IP pricing](https://cloud.google.com/vpc/network-pricing), [nested virtualization restrictions](https://docs.cloud.google.com/compute/docs/instances/nested-virtualization/overview).

Twilio US local rental is currently listed at **$1.15/month per number**, inbound long-code SMS **$0.0083/segment** plus applicable fees, inbound local voice **$0.0085/minute**, and browser/app voice leg **$0.004/minute**. An answered PSTN-to-browser call can incur both legs. Three numbers start at $3.45/month before usage/fees. Trial, registration, geographic purchase eligibility and number-type restrictions apply. Google verification eligibility is always reported **unknown**. See [Twilio SMS prices](https://www.twilio.com/en-us/sms/pricing/us), [voice/number prices](https://www.twilio.com/en-us/voice/pricing/us), and [trial restrictions](https://www.twilio.com/docs/usage/trials/try-out-voice). Prices checked 2026-10-27; confirm your account quote before purchase.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\ruff.exe check backend runtime scripts
Set-Location frontend
npm ci
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests launch a separate real API on port 8011 with a temporary database and explicit test-only credentials. They do not mock successful Android, network, or phone service behavior. Provider/unit fixtures are confined to tests. The CI workflow repeats local checks on Linux; no CI run has been claimed here. The Python lock snapshot is `backend/requirements-lock.txt`; the supported installation constraints are `backend/requirements.txt`, since wheel/platform dependencies differ. JavaScript uses `npm ci` and its lockfile.

See [docs/VALIDATION.md](docs/VALIDATION.md) for current evidence and the deployment acceptance checklist. Successful local tests do not mean that all remote MVP acceptance criteria have been met.

## Troubleshooting and administration

- **Login fails / 429**: verify username/password and exact PUBLIC_URL. Five attempts are allowed per source address per five minutes. Do not raise this limit to work around third-party restrictions.
- **Origin not allowed / CSRF required**: use the exact scheme/hostname/port configured in PUBLIC_URL. For Vite development, set PUBLIC_URL to http://localhost:5173 and restart the API. Production requires HTTPS and COOKIE_SECURE=true.
- **Android unavailable**: local mode deliberately has no emulator. Verify Docker, image, `/dev/kvm`, SDK licensing, encrypted disk and runtime configuration on Linux. Check `docker ps -a` and the relevant container's startup logs; never paste secrets from configuration files.
- **Starting indefinitely**: check KVM permissions, RAM, image/AVD compatibility and `adb shell getprop sys.boot_completed` inside that profile's container. State detection does not treat an unbooted process as ready.
- **Viewer cannot connect**: confirm HTTPS, running Android, ICE/TURN reachability and browser WebRTC support. TURN is important behind cloud NAT and on mobile networks. The current server uses one worker; additional workers would need shared locks/session/media coordination.
- **No internet with proxy**: check credentials, pinned endpoint and supported CONNECT behavior. Restart after proxy DNS/IP changes. Failure blocks traffic by design. SOCKS5 UDP and QUIC do not fall back to direct access. A failed geolocation provider is reported as unverified, not US.
- **No SMS / invalid signature**: verify account ownership, exact public HTTPS webhook URL, POST, account SID and current auth token. Reverse proxies must not rewrite the configured public path. Real provider test credentials do not deliver real SMS.
- **No voice**: confirm owned voice-capable number, API key/secret, provider account status, SDK microphone permission, open receiver and supported browser. SDK tokens permit incoming calls only.
- **No Android browser handles Google URL**: use a legitimately licensed image that includes an enabled browser, or install an authorized browser through supported Android tooling; the control plane does not sideload an unofficial Google-services package.
- **Unknown line type**: basic Lookup validates US country/number validity. Paid line-type intelligence is not requested automatically; do not infer mobile/Google eligibility from +1 or SMS capability.
- **Unrecoverable encrypted fields**: the original ENCRYPTION_KEY is necessary. Do not regenerate it over an existing database. See recovery instructions.

For logs, recovery, key handling, password reset and server hardening see [docs/ADMIN.md](docs/ADMIN.md). The [architecture and roadmap](docs/ARCHITECTURE.md) explain the selected stack, security boundaries, scaling direction and official references.
