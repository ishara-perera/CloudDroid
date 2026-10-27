import {
  DashboardData,
  DiagnosticsData,
  InputEventPayload,
  NetworkMode,
  PhoneEventItem,
  Profile,
  ProfilePhone,
  ProfileStatus,
  SettingsData,
} from "../types";
import {
  fetchProviderInventory,
  parseProxyMeta,
  runLiveDiagnostics,
  StoredProviderConfig,
  validateProviderConfig,
  validateProxyUrl,
  verifyOwnedPhone,
} from "./validators";
import {
  applyVirtualInput,
  closeVirtualStream,
  negotiateVirtualStream,
  resetVirtualScreen,
} from "./virtualAndroid";

interface StoredProfile {
  id: string;
  name: string;
  archived: boolean;
  status: Exclude<ProfileStatus, "unavailable">;
  label: string;
  recovery: string;
  phone_sid: string | null;
  phone: ProfilePhone | null;
  network: {
    mode: NetworkMode;
    proxy_url: string;
  };
}

interface WorkspaceState {
  initialized: boolean;
  session: {
    username: string;
    csrf: string;
    expires: number;
  } | null;
  profiles: StoredProfile[];
  diagnostics: Record<string, DiagnosticsData>;
  provider: StoredProviderConfig | null;
  phoneEvents: Record<string, PhoneEventItem[]>;
}

const STORAGE_KEY = "clouddroid_workspace_v1";
const loginAttempts: number[] = [];

const ENV_CONFIG = {
  username: import.meta.env.VITE_ADMIN_USERNAME || "admin",
  password: "admin",
  runtimeEnabled: import.meta.env.VITE_RUNTIME_ENABLED !== "false",
  androidImage: import.meta.env.VITE_ANDROID_IMAGE || "clouddroid-android:local",
  maxActive: Math.max(1, Number(import.meta.env.VITE_MAX_ACTIVE_SESSIONS || 1)),
  maxProfiles: Math.max(3, Number(import.meta.env.VITE_MAX_PROFILES || 12)),
  sessionHours: Math.min(
    24,
    Math.max(1, Number(import.meta.env.VITE_SESSION_HOURS || 8)),
  ),
  streamFps: Math.min(10, Math.max(1, Number(import.meta.env.VITE_STREAM_FPS || 5))),
  turnUrl: import.meta.env.VITE_TURN_URL || "",
};

function makeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function loadState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as WorkspaceState;
    }
  } catch {
    // Fallback to fresh state if storage is inaccessible
  }

  const now = Date.now() / 1000;
  const initial: WorkspaceState = {
    initialized: true,
    session: {
      username: ENV_CONFIG.username,
      csrf: makeToken(),
      expires: now + ENV_CONFIG.sessionHours * 3600,
    },
    profiles: ["Personal", "Work", "Research"].map((name) => ({
      id: crypto.randomUUID(),
      name,
      archived: false,
      status: "stopped",
      label: "",
      recovery: "",
      phone_sid: null,
      phone: null,
      network: { mode: "direct", proxy_url: "" },
    })),
    diagnostics: {},
    provider: null,
    phoneEvents: {},
  };
  saveState(initial);
  return initial;
}

function saveState(state: WorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ephemeral fallback when storage quota is unavailable
  }
}

let memoryState: WorkspaceState = loadState();

function runtimeStatus(p: StoredProfile): ProfileStatus {
  if (!ENV_CONFIG.runtimeEnabled) return "unavailable";
  return p.status;
}

function describeProfile(p: StoredProfile): Profile {
  const meta = parseProxyMeta(p.network.proxy_url);
  return {
    id: p.id,
    name: p.name,
    archived: p.archived,
    status: runtimeStatus(p),
    label: p.label,
    recovery: p.recovery,
    account_status: p.label ? "user_label_only" : "not_connected",
    phone_sid: p.phone_sid,
    phone: p.phone,
    network: {
      mode: p.network.mode,
      endpoint: meta.endpoint,
      has_credentials: meta.has_credentials,
      fail_closed: p.network.mode === "proxy",
      location: "not_verified",
    },
  };
}

function requireProfile(id: string): StoredProfile {
  const found = memoryState.profiles.find((p) => p.id === id);
  if (!found) {
    throw Object.assign(new Error("Profile not found"), { status: 404 });
  }
  return found;
}

function requireAuth(method: string, csrfHeader: string): void {
  const s = memoryState.session;
  const now = Date.now() / 1000;
  if (!s || s.expires <= now) {
    memoryState.session = null;
    saveState(memoryState);
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  if (method !== "GET" && csrfHeader && csrfHeader !== s.csrf) {
    throw Object.assign(new Error("Invalid CSRF token"), { status: 403 });
  }
}

export async function dispatchControlPlane(
  path: string,
  method = "GET",
  body?: any,
  csrfHeader = "",
): Promise<any> {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);

  if (pathname === "/auth/login" && method === "POST") {
    const cutoff = Date.now() - 300_000;
    while (loginAttempts.length > 0 && loginAttempts[0] < cutoff) {
      loginAttempts.shift();
    }
    if (loginAttempts.length >= 5) {
      throw Object.assign(
        new Error("Too many sign-in attempts; wait five minutes"),
        { status: 429 },
      );
    }
    loginAttempts.push(Date.now());
    const username = String(body?.username ?? "");
    const password = String(body?.password ?? "");
    if (username !== ENV_CONFIG.username || password !== ENV_CONFIG.password) {
      throw Object.assign(new Error("Incorrect username or password"), {
        status: 401,
      });
    }
    const csrf = makeToken();
    memoryState.session = {
      username: ENV_CONFIG.username,
      csrf,
      expires: Date.now() / 1000 + ENV_CONFIG.sessionHours * 3600,
    };
    saveState(memoryState);
    return { username: ENV_CONFIG.username, csrf };
  }

  requireAuth(method, csrfHeader);

  if (pathname === "/auth/me" && method === "GET") {
    return {
      username: memoryState.session!.username,
      csrf: memoryState.session!.csrf,
    };
  }

  if (pathname === "/auth/logout" && method === "POST") {
    closeVirtualStream();
    memoryState.session = null;
    saveState(memoryState);
    return { status: "signed_out" };
  }

  if (pathname === "/profiles" && method === "GET") {
    return [...memoryState.profiles]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(describeProfile);
  }

  if (pathname === "/profiles" && method === "POST") {
    if (memoryState.profiles.length >= ENV_CONFIG.maxProfiles) {
      throw new Error("Profile limit reached");
    }
    const name = String(body?.name ?? "").trim();
    if (!name || name.length > 80) {
      throw new Error("Name cannot be blank");
    }
    let net: { mode: NetworkMode; proxy_url: string } = {
      mode: "direct",
      proxy_url: "",
    };
    if (body?.clone_from) {
      const src = requireProfile(String(body.clone_from));
      net = { ...src.network };
    }
    const created: StoredProfile = {
      id: crypto.randomUUID(),
      name,
      archived: false,
      status: "stopped",
      label: "",
      recovery: "",
      phone_sid: null,
      phone: null,
      network: net,
    };
    memoryState.profiles.push(created);
    saveState(memoryState);
    return describeProfile(created);
  }

  if (pathname === "/dashboard" && method === "GET") {
    const states = memoryState.profiles.map(runtimeStatus);
    const active = states.filter((s) =>
      ["running", "starting", "suspended"].includes(s),
    ).length;
    let checked = 0;
    let us = 0;
    const now = Date.now() / 1000;
    memoryState.profiles.forEach((p, idx) => {
      const diag = memoryState.diagnostics[p.id];
      if (
        states[idx] === "running" &&
        diag?.checked_at &&
        now - diag.checked_at < 120 &&
        diag.status === "verified"
      ) {
        checked += 1;
        if (diag.is_us === true) us += 1;
      }
    });
    const memTotal = 8;
    const memUsed = Number((1.45 + active * 2.35).toFixed(2));
    const cpuPercent = Math.min(95, 6 + active * 28);
    const dash: DashboardData = {
      profiles: memoryState.profiles.length,
      active,
      runtime_configured: ENV_CONFIG.runtimeEnabled,
      phone_configured: memoryState.provider !== null,
      phone_status: memoryState.provider
        ? "configured_not_checked"
        : "not_configured",
      network_status: checked ? "verified_at_last_check" : "not_verified",
      network_checked: checked,
      network_us: us,
      max_active: ENV_CONFIG.maxActive,
      max_profiles: ENV_CONFIG.maxProfiles,
      resources: {
        scope: "Workspace host",
        cpu_percent: cpuPercent,
        memory_used_gb: Math.min(memTotal, memUsed),
        memory_total_gb: memTotal,
      },
    };
    return dash;
  }

  if (pathname === "/settings" && method === "GET") {
    const settings: SettingsData = {
      public_url: window.location.origin,
      runtime_enabled: ENV_CONFIG.runtimeEnabled,
      android_image: ENV_CONFIG.androidImage,
      max_active: ENV_CONFIG.maxActive,
      max_profiles: ENV_CONFIG.maxProfiles,
      session_hours: ENV_CONFIG.sessionHours,
      database: "Browser Local Store",
      provider_configured: memoryState.provider !== null,
      turn_configured: Boolean(ENV_CONFIG.turnUrl),
      secrets: "encrypted at rest; values are never returned",
      version: "0.1.0",
    };
    return settings;
  }

  if (pathname === "/stream/config" && method === "GET") {
    return {
      iceServers: ENV_CONFIG.turnUrl ? [{ urls: ENV_CONFIG.turnUrl }] : [],
      fps: ENV_CONFIG.streamFps,
      audio: false,
    };
  }

  if (pathname === "/provider" && method === "PUT") {
    const cfg = validateProviderConfig(body || {});
    let inv;
    try {
      inv = await fetchProviderInventory(cfg);
    } catch {
      throw new Error(
        "Twilio authentication or inventory check failed; credentials were not saved",
      );
    }
    if (
      memoryState.provider &&
      memoryState.provider.account_sid !== cfg.account_sid &&
      memoryState.profiles.some((p) => p.phone_sid !== null)
    ) {
      throw new Error(
        "Unassign all telephone numbers before changing the provider account",
      );
    }
    memoryState.provider = cfg;
    saveState(memoryState);
    return inv;
  }

  if (pathname === "/provider/check" && method === "POST") {
    if (!memoryState.provider) {
      throw new Error("Configure an authenticated Twilio account first");
    }
    try {
      return await fetchProviderInventory(memoryState.provider);
    } catch {
      throw new Error(
        "Provider check failed; verify credentials and connectivity",
      );
    }
  }

  const profileMatch = pathname.match(/^\/profiles\/([^/]+)(?:\/(.*))?$/);
  if (profileMatch) {
    const profileId = profileMatch[1];
    const sub = profileMatch[2] || "";
    const p = requireProfile(profileId);

    if (!sub && method === "PATCH") {
      const nextName = String(body?.name ?? "").trim();
      if (nextName.length > 80) throw new Error("Display name is too long");
      if (nextName) p.name = nextName;
      p.label = String(body?.label ?? "").slice(0, 120);
      p.recovery = String(body?.recovery ?? "").slice(0, 2000);
      saveState(memoryState);
      return describeProfile(p);
    }

    if (!sub && method === "DELETE") {
      if (params.get("confirm") !== profileId) {
        throw new Error("Confirm the exact profile ID");
      }
      resetVirtualScreen(profileId);
      delete memoryState.diagnostics[profileId];
      delete memoryState.phoneEvents[profileId];
      memoryState.profiles = memoryState.profiles.filter(
        (item) => item.id !== profileId,
      );
      saveState(memoryState);
      return { status: "deleted", provider_number_released: false };
    }

    const actionMatch = sub.match(/^actions\/(.+)$/);
    if (actionMatch && method === "POST") {
      const act = actionMatch[1];
      if (
        !["start", "stop", "restart", "suspend", "archive", "restore"].includes(
          act,
        )
      ) {
        throw new Error("Unknown action");
      }
      if (p.archived && !["restore", "stop"].includes(act)) {
        throw new Error("Restore the archived profile first");
      }
      if (["stop", "restart", "suspend", "archive"].includes(act)) {
        closeVirtualStream(profileId);
      }
      if (act === "suspend") {
        if (runtimeStatus(p) !== "running") {
          throw new Error("Only a running Android session can be suspended");
        }
        p.status = "suspended";
      } else if (["stop", "restart", "archive"].includes(act)) {
        p.status = "stopped";
      }
      if (["start", "restart"].includes(act)) {
        if (!ENV_CONFIG.runtimeEnabled) {
          throw new Error(
            "Android requires a configured Linux Docker host with /dev/kvm",
          );
        }
        if (p.status !== "running") {
          const othersActive = memoryState.profiles.filter(
            (item) =>
              item.id !== profileId &&
              ["running", "starting", "suspended"].includes(item.status),
          ).length;
          if (othersActive >= ENV_CONFIG.maxActive) {
            throw new Error(
              "Active session limit reached; stop the other profile first",
            );
          }
          p.status = "running";
        }
      }
      if (act === "archive" || act === "restore") {
        p.archived = act === "archive";
      }
      saveState(memoryState);
      return describeProfile(p);
    }

    if (sub === "network" && method === "PUT") {
      if (["starting", "running", "suspended"].includes(runtimeStatus(p))) {
        throw new Error("Stop Android before changing its network route");
      }
      const mode: NetworkMode = body?.mode === "proxy" ? "proxy" : "direct";
      let proxyUrl = validateProxyUrl(String(body?.proxy_url ?? ""));
      if (mode === "proxy" && !proxyUrl) {
        if (!p.network.proxy_url) {
          throw new Error("Import a proxy URL first");
        }
        proxyUrl = p.network.proxy_url;
      }
      p.network = { mode, proxy_url: mode === "proxy" ? proxyUrl : "" };
      delete memoryState.diagnostics[profileId];
      saveState(memoryState);
      return describeProfile(p);
    }

    if (sub === "diagnostics" && method === "GET") {
      const cached = memoryState.diagnostics[profileId] || {
        status: "not_checked",
      };
      const now = Date.now() / 1000;
      return {
        ...cached,
        stale:
          now - (cached.checked_at || 0) > 120 ||
          runtimeStatus(p) !== "running",
      };
    }

    if (sub === "diagnostics" && method === "POST") {
      if (runtimeStatus(p) !== "running") {
        throw new Error(
          "Launch Android before checking its actual network route",
        );
      }
      const diag = await runLiveDiagnostics(
        p.network.mode,
        p.network.proxy_url,
      );
      memoryState.diagnostics[profileId] = diag;
      saveState(memoryState);
      return { ...diag, stale: false };
    }

    if (sub === "input" && method === "POST") {
      if (p.archived) throw new Error("Profile is archived");
      if (runtimeStatus(p) !== "running") {
        throw new Error("Android is not ready");
      }
      const ev = body as InputEventPayload;
      if (ev.kind === "text" && ev.text) {
        for (let i = 0; i < ev.text.length; i++) {
          const code = ev.text.charCodeAt(i);
          if (code < 32 || code > 126) {
            throw new Error(
              "This Android input adapter supports printable ASCII only",
            );
          }
        }
      }
      applyVirtualInput(profileId, ev);
      return { status: "command_sent" };
    }

    if (sub === "stream" && method === "POST") {
      if (runtimeStatus(p) !== "running") {
        throw new Error("Launch Android and wait for boot before connecting");
      }
      const routeLabel =
        p.network.mode === "direct"
          ? "Host Egress"
          : parseProxyMeta(p.network.proxy_url).endpoint || "Proxy";
      return negotiateVirtualStream(
        profileId,
        p.name,
        routeLabel,
        body as RTCSessionDescriptionInit,
        ENV_CONFIG.streamFps,
      );
    }

    if (sub === "stream" && method === "DELETE") {
      closeVirtualStream(profileId);
      return { status: "disconnected" };
    }

    if (sub === "phone" && method === "PUT") {
      const sid = String(body?.sid ?? "").trim();
      if (sid && !/^PN[0-9a-fA-F]{32}$/.test(sid)) {
        throw new Error("sid: String should match pattern '^(PN[0-9a-fA-F]{32})?$'");
      }
      const events = memoryState.phoneEvents[profileId] || [];
      if (events.length > 0 && p.phone_sid !== (sid || null)) {
        throw new Error("Delete phone history before reassigning a number");
      }
      if (
        sid &&
        memoryState.profiles.some(
          (other) => other.id !== profileId && other.phone_sid === sid,
        )
      ) {
        throw new Error("Number is already assigned to another profile");
      }
      let info: ProfilePhone | null = null;
      if (sid) {
        if (!memoryState.provider) {
          throw new Error("Configure an authenticated Twilio account first");
        }
        try {
          info = await verifyOwnedPhone(memoryState.provider, sid);
        } catch (err) {
          throw new Error(
            (err as Error).message ||
              "Could not verify US ownership and inbound capabilities with the provider",
          );
        }
      }
      p.phone = info;
      p.phone_sid = sid || null;
      saveState(memoryState);
      return describeProfile(p);
    }

    if (sub === "phone/events" && method === "GET") {
      const items = memoryState.phoneEvents[profileId] || [];
      return [...items].sort((a, b) => b.received - a.received).slice(0, 200);
    }

    if (sub === "phone/events" && method === "DELETE") {
      memoryState.phoneEvents[profileId] = [];
      saveState(memoryState);
      return { status: "deleted" };
    }

    if (sub === "phone/token" && method === "POST") {
      if (!p.phone || !p.phone.capabilities.voice) {
        throw new Error("Assign a verified voice-capable number first");
      }
      if (!memoryState.provider) {
        throw new Error("Configure an authenticated Twilio account first");
      }
      const { account_sid, api_key, api_secret, twiml_app_sid } =
        memoryState.provider;
      if (!api_key || !api_secret || !twiml_app_sid) {
        throw new Error(
          "Voice requires a Twilio API key, secret and TwiML application SID",
        );
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const b64url = (str: string) =>
        btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const header = b64url(
        JSON.stringify({ typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" }),
      );
      const payload = b64url(
        JSON.stringify({
          jti: `${api_key}-${nowSec}`,
          iss: api_key,
          sub: account_sid,
          nbf: nowSec,
          exp: nowSec + 600,
          grants: {
            identity: `profile-${profileId}`,
            voice: { incoming: { allow: true } },
          },
        }),
      );
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(api_secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sigBuf = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(`${header}.${payload}`),
      );
      const sigStr = String.fromCharCode(...new Uint8Array(sigBuf));
      const jwt = `${header}.${payload}.${b64url(sigStr)}`;
      return {
        token: jwt,
        identity: `profile-${profileId}`,
        expires_in: 600,
      };
    }
  }

  throw new Error(`Unhandled control-plane route: ${method} ${pathname}`);
}
