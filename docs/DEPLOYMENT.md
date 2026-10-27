# Cloud deployment runbook

## Prerequisites and paid actions

This runbook creates paid infrastructure only when you run the provisioning script with your own authorized project. No provisioning commands were executed during development. Review your budget and SDK/image license compatibility with your actual use first. The project does not purchase telephone numbers, automatically create Google accounts, or infer geographic eligibility.

Use a dedicated US x86_64 Ubuntu 24.04 machine. The reference is GCE `n2-standard-2` (2 vCPU, 8 GB), US Central, 80 GB balanced persistent disk. It is the lowest-resource non-spot reference configuration in this project; performance remains unmeasured. N2-standard-4 offers more headroom. Google documents nested-virtualization restrictions, including exclusion of E2 and ARM VMs: [official requirements](https://docs.cloud.google.com/compute/docs/instances/nested-virtualization/overview).

```bash
export GCP_PROJECT=your-authorized-project
export GCP_ZONE=us-central1-a
bash deploy/provision-gce.sh
```

The script creates a VM and HTTP/HTTPS firewall rule. It uses no VM service account to reduce metadata-credential exposure. You must arrange restricted SSH/IAP access and separately permit TURN ports if using it. Do not expose Docker 2375/2376, ADB 5554/5555, API 8000, PostgreSQL 15432, or emulator gRPC 8554 publicly. Apply cloud firewall controls; Docker's port publishing can bypass naive UFW expectations. Review default VPC rules yourself.

## Host preparation

1. Use provider disk encryption at rest; use a separately managed customer key or LUKS if your threat model requires it. The application does not create a LUKS volume. Docker profile volumes live under the Docker data root; make sure that location is on the encrypted persistent disk.
2. Confirm `uname -m` is x86_64 and `test -c /dev/kvm` succeeds. Install KVM tools as needed. Use the official emulator `-accel-check` after building. Do not substitute software emulation and describe it as equivalent.
3. Install Docker Engine + Compose using [Docker's official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Docker group membership and Docker socket access are root-equivalent.
4. Install Python 3.13/venv, Node 22.12+, git, age for backups, and optionally coturn from supported distribution packages. Copy this source project to a private server directory. Do not copy your Windows data or initial password file into a public repository.
5. Create a virtual environment, install backend requirements and run the bootstrap script. Avoid keeping cloud/provider account credentials in shell history.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python scripts/bootstrap.py
chmod 600 .env
```

Set `.env`:

```dotenv
PUBLIC_URL=https://android.your-domain.example
DOMAIN=android.your-domain.example
COOKIE_SECURE=true
RUNTIME_ENABLED=true
MAX_ACTIVE_SESSIONS=1
```

Preserve the generated ENCRYPTION_KEY, password hash and PostgreSQL password. Create the DNS A record for your actual server public IPv4. Do not publish an AAAA record unless your HTTPS/host IPv6 configuration is intentionally supported; guest IPv6 egress is disabled.

The runtime Dockerfile pins Android command-line tools build `15859902` with its official SHA-256. Official package metadata checked during development advertised stable emulator `37.2.12` and API-35 Google APIs x86_64 system-image revision 9. `sdkmanager` resolves the stable emulator/platform tools when building, so record the image ID/digest and installed package list after validation. Rebuilds can select newer SDK revisions; promote an immutable tested image for production. Inspect current official metadata without downloading binaries:

```bash
.venv/bin/python scripts/verify-sdk-manifest.py
```

Build only after reviewing and accepting the applicable SDK/image terms:

```bash
export ACCEPT_ANDROID_SDK_LICENSES=yes
bash deploy/install-host.sh
docker compose ps
```

Compose uses host networking for API/Caddy so WebRTC can bind host ICE sockets. PostgreSQL is bound only to 127.0.0.1:15432. The API listens only at 127.0.0.1:8000. Caddy obtains HTTPS certificates for the configured public domain. This Linux host-network Compose file is not a Windows Docker Desktop deployment recipe.

The API has the Docker socket and is consequently highly trusted. Keep this a dedicated single-administrator VM. API containers are read-only apart from `/tmp`, but Docker access can still control the host. A future public multi-tenant product must use a separately authenticated restricted runtime agent and stronger VM boundaries.

## TURN and WebRTC

Without TURN, an authenticated web page may work while media fails through cloud NAT or mobile firewalls. Configure a private coturn service or another legitimately provisioned TURN server. For self-hosted coturn, use a private `/etc/turnserver.conf` based on this example; substitute real values and restrict file access. Consult [coturn documentation](https://github.com/coturn/coturn) for your installed version.

```conf
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=YOUR_RANDOM_SERVER_SECRET
realm=turn.your-domain.example
external-ip=YOUR_PUBLIC_IP/YOUR_PRIVATE_IP
min-port=49160
max-port=49200
no-cli
no-loopback-peers
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
```

Also deny access to other sensitive private networks according to the TURN host topology, while allowing the specific API host media address when it is private. A blanket RFC1918 denial on a co-hosted cloud deployment can also block the legitimate API ICE candidate. Use coturn's documented allowed-peer exceptions or a separate relay topology and validate it. TLS TURN additionally requires a real certificate/key configuration for the TURN hostname; renew it operationally. Do not assume the Caddy HTTPS certificate automatically configures coturn.

Set matching `.env` values:

```dotenv
TURN_URL=turn:turn.your-domain.example:3478?transport=udp
TURN_SECRET=YOUR_RANDOM_SERVER_SECRET
```

Both browser and aiortc receive temporary HMAC credentials, never the shared secret. Permit UDP/TCP 3478 and your chosen relay range in host/cloud firewalls, and TCP 5349 for TLS TURN if configured. Test restrictive-network behavior, then prefer `turns:` on a supported TLS endpoint if UDP is blocked. CloudDroid currently accepts one TURN URL; multiple relay endpoints/failover are future work. TURN traffic is paid bandwidth and can be abused if you expose an unauthenticated/open relay.

## Profile runtime/network behavior

The API creates containers named `clouddroid-<UUID>` and volumes `clouddroid-<UUID>-data`. It publishes no emulator ports. Root installs the network rules and a root-owned tmpfs configuration, then drops the emulator to uid 1000 and the connector to uid 1001. KVM access uses a supplementary device group. Only the supervisor retains NET_ADMIN. Profiles start with location disabled.

In proxy mode, guest TCP is redirected to a local connector that can reach only the selected proxy's pinned public IPv4/port. HTTP CONNECT, verified TLS HTTPS CONNECT and SOCKS5 username/password are implemented. A proxy disconnect or connector death leaves DROP rules installed and never enables direct guest egress. The supervisor also stops Android if the connector exits. External guest UDP (including QUIC), direct DNS and IPv6 cannot escape through another route. DNS A queries go to a local DNS stub, then Cloudflare DoH through the proxy; AAAA answers are suppressed because guest IPv6 is unsupported. DoH/proxy outages return SERVFAIL, not the host resolver.

Direct mode permits public cloud-host egress and uses DoH. It blocks guest access to private/link-local/metadata destinations. Loopback is permitted for emulator management and DNS. These are developer Android images: a malicious guest app may reach its own namespace's loopback developer services. They are not a hardened mobile malware sandbox. Profile namespace/storage separation is not a guarantee against emulator/container escape.

Proxy endpoint DNS is resolved by the control plane once at launch and pinned. This administrative bootstrap lookup is distinct from Android DNS. All IPv4 answers must be public; DNS rebinding to private/metadata endpoints is rejected. Restart to adopt endpoint address changes. Proxies can observe destination metadata and unencrypted HTTP traffic; supply trusted endpoints. No list of public shared proxies is bundled.

HTTP and SOCKS5 proxy authentication is not encrypted on the client-to-proxy hop by those protocols themselves. Prefer an HTTPS proxy, an independently secured transport, or the trusted US host's direct egress when sending proxy credentials over a public network.

Per-profile diagnostics run as the same uid/firewall subject as the emulator. They compare `api.ipify.org` and `ipwho.is` observations. A country classification comes from a geolocation database and may disagree with Google or another service. The displayed check time is end-to-end diagnostic duration, not a pure ICMP ping or proxy-only latency. Automatic checks run after boot and roughly every minute; stale results expire at 120 seconds. A full independent DNS attribution test and real outage capture remain acceptance steps.

## Twilio setup

1. Acquire a US number legitimately through Twilio under your account's eligibility, identity and payment requirements. No purchasing endpoint is included in CloudDroid. Verify SMS/voice capabilities and number type with the provider; mobile/VoIP acceptance by third-party services remains unknown.
2. In Settings supply the Account SID and Auth Token. For browser voice also supply a proper API key SID/secret and TwiML application SID. Inventory checks prove API access at that time. Basic Lookup checks ownership-assigned numbers' US country and validity; paid line-type intelligence is not automatically requested.
3. Assign the number in Phone center. A number can belong to only one profile. Changing an assignment requires clearing that profile's phone history first, preventing casual mixing of unrelated inboxes.
4. Configure the number in Twilio Console (HTTP POST):

| Provider setting | Public endpoint |
|---|---|
| A message comes in | `https://your-domain/hooks/twilio/sms` |
| A call comes in | `https://your-domain/hooks/twilio/voice` |
| Voice status callback | `https://your-domain/hooks/twilio/call-status` |

The Dial action also reports call status. Use exact PUBLIC_URL paths; do not rewrite URLs or put these endpoints behind an interactive login challenge. Every webhook checks the official Twilio signature against the configured public URL/all form fields, plus the account SID and destination. SDK tokens are valid for ten minutes, restricted to incoming calls, and refreshed only with an authenticated admin session. Outbound messages/calls and public shared SMS inboxes are excluded.

The TwiML App SID is recorded as provider setup metadata; receive-only tokens do not grant an outgoing application. Never configure an unrestricted outbound TwiML endpoint as an accidental workaround. Browser calls require HTTPS, microphone access and an active receiver. Switching profile or signing out destroys the browser receiver. On iOS/Android, foreground/background limitations must be tested on actual devices. Trial accounts and regional restrictions may prevent real delivery; test credentials and synthetic fixtures do not establish live service.

## Validate and operate

Complete [VALIDATION.md](VALIDATION.md) on the target host before admitting sensitive accounts. Save the immutable Android image ID, package versions and dated acceptance evidence without SMS codes/passwords. Use [ADMIN.md](ADMIN.md) for backups and recovery. Set billing budgets/alerts outside the application. CloudDroid's CPU/memory display measures the API host; it is not a cloud billing meter.
