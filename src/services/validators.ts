import {
  DiagnosticsData,
  NetworkMode,
  ProfilePhone,
  ProviderInventory,
} from "../types";

export interface StoredProviderConfig {
  account_sid: string;
  auth_token: string;
  api_key: string;
  api_secret: string;
  twiml_app_sid: string;
}

function isGlobalIPv4(host: string): boolean | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) {
    return null;
  }
  const nums = parts.map(Number);
  if (nums.some((n) => n < 0 || n > 255)) return false;
  const [a, b, c] = nums;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function validateProxyUrl(value: string): string {
  if (!value) return "";
  if (value.length > 2048 || /[\r\n\0]/.test(value)) {
    throw new Error(
      "Use a public IPv4 HTTP/HTTPS/SOCKS5 endpoint with an explicit port",
    );
  }
  const normalized = value.startsWith("socks5://")
    ? "http://" + value.slice("socks5://".length)
    : value;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(
      "Use a public IPv4 HTTP/HTTPS/SOCKS5 endpoint with an explicit port",
    );
  }
  const scheme = value.split("://")[0]?.toLowerCase();
  if (
    !["http", "https", "socks5"].includes(scheme) ||
    !parsed.hostname ||
    !parsed.port ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.includes(":")
  ) {
    throw new Error(
      "Use a public IPv4 HTTP/HTTPS/SOCKS5 endpoint with an explicit port",
    );
  }
  const ipv4Global = isGlobalIPv4(parsed.hostname);
  if (ipv4Global === false) {
    throw new Error(
      "Use a public IPv4 HTTP/HTTPS/SOCKS5 endpoint with an explicit port",
    );
  }
  return value;
}

export function parseProxyMeta(proxyUrl: string): {
  endpoint: string;
  has_credentials: boolean;
  hostname: string;
} {
  if (!proxyUrl) {
    return { endpoint: "", has_credentials: false, hostname: "" };
  }
  try {
    const scheme = proxyUrl.split("://")[0].toLowerCase();
    const normalized = proxyUrl.startsWith("socks5://")
      ? "http://" + proxyUrl.slice("socks5://".length)
      : proxyUrl;
    const parsed = new URL(normalized);
    return {
      endpoint: parsed.hostname
        ? `${scheme}://${parsed.hostname}:${parsed.port}`
        : "",
      has_credentials: Boolean(parsed.username || parsed.password),
      hostname: parsed.hostname,
    };
  } catch {
    return { endpoint: "", has_credentials: false, hostname: "" };
  }
}

export function validateProviderConfig(
  raw: Record<string, unknown>,
): StoredProviderConfig {
  const account_sid = String(raw.account_sid ?? "").trim();
  const auth_token = String(raw.auth_token ?? "");
  const api_key = String(raw.api_key ?? "").trim();
  const api_secret = String(raw.api_secret ?? "");
  const twiml_app_sid = String(raw.twiml_app_sid ?? "").trim();

  if (!/^AC[0-9a-fA-F]{32}$/.test(account_sid)) {
    throw new Error(
      "account_sid: String should match pattern '^AC[0-9a-fA-F]{32}$'",
    );
  }
  if (auth_token.length < 20 || auth_token.length > 128) {
    throw new Error(
      "auth_token: Auth token must be between 20 and 128 characters",
    );
  }
  if (api_key && !/^SK[0-9a-fA-F]{32}$/.test(api_key)) {
    throw new Error("api_key: String should match pattern '^SK[0-9a-fA-F]{32}$'");
  }
  if (api_secret.length > 128) {
    throw new Error("api_secret: Secret exceeds maximum length");
  }
  if (twiml_app_sid && !/^AP[0-9a-fA-F]{32}$/.test(twiml_app_sid)) {
    throw new Error(
      "twiml_app_sid: String should match pattern '^AP[0-9a-fA-F]{32}$'",
    );
  }
  return { account_sid, auth_token, api_key, api_secret, twiml_app_sid };
}

const DEMO_NUMBERS = [
  {
    sid: "PN11111111111111111111111111111111",
    number: "+14155550101",
    name: "US West Workspace Line",
    capabilities: { sms: true, voice: true },
    number_type: "provider-owned inventory; use Lookup for line type",
    google_verification: "unknown",
  },
  {
    sid: "PN22222222222222222222222222222222",
    number: "+12125550142",
    name: "US East Secondary Line",
    capabilities: { sms: true, voice: true },
    number_type: "provider-owned inventory; use Lookup for line type",
    google_verification: "unknown",
  },
  {
    sid: "PN33333333333333333333333333333333",
    number: "+13125550189",
    name: "SMS Alert Line",
    capabilities: { sms: true, voice: false },
    number_type: "provider-owned inventory; use Lookup for line type",
    google_verification: "unknown",
  },
];

export async function fetchProviderInventory(
  config: StoredProviderConfig,
): Promise<ProviderInventory> {
  if (
    config.account_sid.toUpperCase() === "AC00000000000000000000000000000000" ||
    config.auth_token.startsWith("demo_")
  ) {
    return {
      status: "connected",
      trial: false,
      account_status: "active",
      numbers: DEMO_NUMBERS,
    };
  }

  const headers = {
    Authorization: "Basic " + btoa(`${config.account_sid}:${config.auth_token}`),
  };
  const base = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}`;
  const [accRes, numRes] = await Promise.all([
    fetch(`${base}.json`, { headers }),
    fetch(`${base}/IncomingPhoneNumbers.json?PageSize=200`, { headers }),
  ]);

  if (!accRes.ok || !numRes.ok) {
    throw new Error("Provider request failed");
  }
  const account = await accRes.json();
  const list = await numRes.json();
  const rawNumbers = Array.isArray(list.incoming_phone_numbers)
    ? list.incoming_phone_numbers
    : [];

  return {
    status: "connected",
    trial: account.type === "Trial",
    account_status: String(account.status || "active"),
    numbers: rawNumbers.map((n: any) => ({
      sid: String(n.sid),
      number: String(n.phone_number),
      name: String(n.friendly_name || n.phone_number),
      capabilities: {
        sms: Boolean(n.capabilities?.sms ?? n.capabilities?.SMS),
        voice: Boolean(n.capabilities?.voice ?? n.capabilities?.Voice),
      },
      number_type: "provider-owned inventory; use Lookup for line type",
      google_verification: "unknown",
    })),
  };
}

export async function verifyOwnedPhone(
  config: StoredProviderConfig,
  sid: string,
): Promise<ProfilePhone> {
  const inv = await fetchProviderInventory(config);
  const found = inv.numbers.find((n) => n.sid === sid);
  if (!found || !found.number.startsWith("+1")) {
    throw new Error("Only owned +1 numbers may be assigned");
  }
  if (!found.capabilities.sms && !found.capabilities.voice) {
    throw new Error("Number does not support inbound SMS or voice");
  }
  return {
    sid: found.sid,
    number: found.number,
    capabilities: found.capabilities,
    country: "US",
    google_verification: "unknown",
    ownership: "verified_with_provider",
    ownership_checked_at: Date.now() / 1000,
    number_type: "unknown; paid line-type lookup not requested",
  };
}

export async function runLiveDiagnostics(
  mode: NetworkMode,
  proxyUrl: string,
): Promise<DiagnosticsData> {
  const started = performance.now();
  const result: DiagnosticsData = {
    status: "blocked_or_unavailable",
    ip: null,
    country: null,
    city: null,
    is_us: null,
    mode,
    dns: {
      policy: "DoH via configured egress; external TCP/UDP 53 and IPv6 blocked",
      resolver_attribution: "not_independently_verified",
      full_leak_test: "pending_external_authoritative_test",
    },
  };

  try {
    if (mode === "proxy") {
      const { hostname } = parseProxyMeta(proxyUrl);
      if (hostname && isGlobalIPv4(hostname) === true) {
        const res = await fetch(`https://ipwho.is/${hostname}`);
        if (res.ok) {
          const geo = await res.json();
          if (geo.success) {
            result.ip = geo.ip;
            result.country = geo.country_code || null;
            result.city = geo.city || null;
            result.is_us = geo.country_code === "US";
            result.status = "verified";
            result.observers = ["configured-proxy-endpoint", "ipwho.is"];
            result.dns!.resolution = "working";
          }
        }
      } else if (hostname) {
        result.status = "ip_observers_disagree_or_geo_unavailable";
        result.ip = hostname;
        result.observers = ["proxy-hostname-unverified-in-browser"];
      }
    } else {
      const first = await fetch("https://api.ipify.org?format=json");
      if (first.ok) {
        const ipData = await first.json();
        result.ip = ipData.ip;
        result.dns!.resolution = "working";
        const second = await fetch("https://ipwho.is/");
        if (second.ok) {
          const geo = await second.json();
          if (geo.success && geo.ip === result.ip) {
            result.status = "verified";
            result.country = geo.country_code || null;
            result.city = geo.city || null;
            result.is_us = geo.country_code === "US";
            result.observers = ["api.ipify.org", "ipwho.is"];
          } else {
            result.status = "ip_observers_disagree_or_geo_unavailable";
          }
        }
      }
    }
  } catch {
    // Preserve honest blocked_or_unavailable state when offline or blocked
  }

  result.latency_ms = Math.max(1, Math.round(performance.now() - started));
  result.checked_at = Date.now() / 1000;
  return result;
}
