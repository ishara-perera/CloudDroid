# Validation evidence and remaining acceptance gates

Development date: 2026-10-27. Host: Windows 11, Python 3.13.7, Node 25.8.2. No Docker executable/daemon on Windows; WSL Ubuntu exposes x86_64 KVM but has no Docker executable configured. No cloud, proxy, Twilio account credentials or owned telephone number were provided. No real Google account was created or connected.

## Local checks

- Python API/unit suite: **47 passed**, final run 15.52 seconds, no warnings. Includes a real local WebRTC peer exchange carrying an explicit image fixture (not an Android device), HTTP CONNECT transport, SOCKS authentication rejection, DNS failure behavior and safe backup extraction.
- Frontend TypeScript/production Vite build: passed. React 19.3.1, Vite 8.3.5, TypeScript 7.0.2. Exact transitive versions are in package-lock.json.
- Playwright real browser/API tests: **6 passed**, final run 16.1 seconds, covering desktop Chromium and a mobile Pixel 7 browser viewport, all six screens, no horizontal overflow, login/logout, persistent profile CRUD, labels, network configuration and archive/restore. Test login sessions are reused to respect the real five-attempt throttle.
- Ruff lint, Python compilation and pip dependency consistency checks: passed, including final source changes.
- `npm audit --omit=dev`: zero reported production dependency vulnerabilities for the installed tree at check time. This does not prove absence of other vulnerabilities.
- Bash syntax: runtime entrypoint, deployment, backup and restore scripts checked using WSL bash. Docker image build/Compose startup were not run.
- Official SDK metadata: stable emulator 37.2.12, API-35 Google APIs x86_64 revision 9 found in Google's repository XML. Current command-line tools build 15859902/SHA-256 verified against the official download page. No SDK binaries/images were downloaded or licenses accepted by a build.
- Desktop and mobile dashboard screenshots were inspected. They show unavailable Android/provider state, not a mock live emulator.
- The delivered local application was started at http://localhost:8000, with HTTP 200 for the real UI and `/healthz` reporting control-plane/database health. Local administrator credentials remain outside the source archive.

Provider fixture tests validate signatures and encrypted destination-bound persistence; they do not establish real carrier delivery. Firewall policy tests inspect generated rules; they do not establish kernel enforcement or absence of DNS leaks. A screenshot at a mobile viewport does not establish physical Android microphone/WebRTC compatibility.

## MVP acceptance matrix

| User criterion | Current evidence | Required live validation |
|---|---|---|
| 1. Authenticated remote Android access | Authentication + viewer/adapter code | HTTPS cloud host, booted emulator and actual WebRTC video/input |
| 2. Three independently opened profiles | Three persistent records, unique volume naming | Boot all three sequentially on KVM |
| 3. Isolated Android apps/browser data | Separate-volume/container design | Write distinct app/localStorage/cookies, switch/restart and prove no cross-profile data |
| 4. Configured and independently verified US egress | Two-observer diagnostics code | Both observers agree on actual US egress IP inside profile |
| 5. Fail closed on proxy outage | DROP policy/connector rules tests | Real external proxy blocked/unavailable during active traffic, packet capture shows no direct fallback |
| 6. Accurate live network status | Unknown/unavailable/stale behavior and timed monitor | Live success, failure, recovery, stale timestamp checks |
| 7. Authenticated supported provider | Adapter/check/save logic | Real paid/trial account and inventory/ownership/capability check |
| 8. Incoming SMS in correct inbox | Signed fixture, tamper/destination/dedup/encryption tests | Real carrier message and retry to each assigned number |
| 9. Official Google registration, manually operated | Fixed official URL; no registration automation | Real Android browser opens page; human operates required official verification |
| 10. Windows/Android browsers | Desktop + mobile browser viewport tests | Physical Windows/Android WebRTC, touch, microphone and inbound-call tests |
| 11. All documented automated tests pass | Local suite/build/browser tests | Linux CI and live runtime checks after deployment |
| 12. Unsupported/paid requirements identified | README, architecture, deployment and admin runbooks | Review actual provider bill/host quote and SDK/image license fit |

**The remote Android MVP is not yet accepted.** Supplying a supported host, domain/TURN and real provider credentials is necessary; emulator boot, network enforcement, physical device/browser behavior and carrier delivery must then be tested.

## Live host checklist

Use test-only profiles first. Do not publish sensitive logs or screenshots.

1. Verify encrypted Docker data disk, `/dev/kvm`, licensed image, matching x86_64 CPU, HTTPS certificate and single API worker. Save Android image ID and installed SDK package versions. Confirm no public ADB/Docker/DB/API ports.
2. Launch profile A and wait for `sys.boot_completed=1`. Connect viewer from Windows and an actual Android smartphone. Tap, swipe, navigate, type/paste an innocuous ASCII value, and use full screen. Confirm wrong/no cookie and expired stream/session cannot access media/control.
3. Set a unique marker in Android Settings, install a legitimate test app or use a controlled browser page to save unique cookies/localStorage. Stop A, boot B and C: each should start with separate state. Create different markers, restart every profile and confirm persistence. Never clone an AVD disk or account directory when testing configuration cloning.
4. Use a US host without a proxy and run diagnostics; record the actual IP/country, both observers and timestamp. Repeat from a separate external IP lookup inside Android's browser. No US classification may be inferred solely from a cloud region label.
5. Configure a trusted real proxy while stopped. Boot and verify actual proxy egress. From the host, inspect that container's `iptables-save`, IPv6 policy and process UIDs. Capture only transport metadata; do not retain account payloads.
6. In a root shell **inside the test container**, block its pinned proxy endpoint before an allowed rule (e.g. `iptables -I OUTPUT 1 -p tcp -d PROXY_IP --dport PROXY_PORT -j REJECT`). Trigger fresh Android requests and diagnostics. They must fail and must not use cloud-host direct egress. Restart the profile to rebuild clean rules after the test. Never run this rule against the host's OUTPUT chain.
7. Verify DNS requests use the local stub/DoH path. During route failure, confirm no public UDP/TCP 53 or IPv6 packets leave. Open the independent DNS test in Android and record actual authoritative resolver attribution. Do not declare a leak test passed based on the stub resolving one hostname or on an IP check.
8. Stop the tunnel process inside a disposable test container. The supervisor must stop Android, and DROP rules must not be removed. Check a blackholed proxy, invalid credentials, rejected CONNECT, hostname address changes, and unavailable geolocation service. Do not assume all public proxies support CONNECT to arbitrary TLS destinations.
9. Assign a real owned US number with supported capabilities to each desired profile. Confirm a number cannot be assigned twice. Configure exact HTTPS callbacks; send a real non-sensitive test SMS and real incoming call. Check wrong destination/account/signature rejection and real browser audio answer/end. Confirm messages are never logged and switching profile closes the old receiver.
10. Open Google's registration URL inside the chosen profile. The human completes Google's workflow, including any required identity/phone checks. If Google rejects a number/image/location, report that result without modifying the app to bypass the decision. A user label is not evidence of account creation.
11. Complete a stopped-profile encrypted backup and restore it onto a clean host with the preserved key. Recheck cookies/app state, private fields, network/phone mappings, HTTPS and session revocation. Record recovery time and retain no plaintext artifacts outside encrypted storage.
12. Measure actual frame rate, input latency, CPU/RAM, disk growth and paid data transfer. Tune or move to the documented native WebRTC upgrade only after measured validation. Re-run these gates whenever relevant runtime/firewall/media components change.
