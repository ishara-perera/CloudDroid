import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Cloud,
  Copy,
  Cpu,
  Expand,
  Globe2,
  Home,
  Info,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  MonitorSmartphone,
  MoreHorizontal,
  Network,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { api, Profile, setCsrf } from "./api";
import "./styles.css";

type Page =
  | "Dashboard"
  | "Profiles"
  | "Android viewer"
  | "Network"
  | "Phone center"
  | "Settings";
const nav: [Page, typeof Cloud][] = [
  ["Dashboard", LayoutDashboard],
  ["Profiles", Users],
  ["Android viewer", MonitorSmartphone],
  ["Network", Globe2],
  ["Phone center", Phone],
  ["Settings", Settings],
];
const stamp = (seconds: number) => new Date(seconds * 1000).toLocaleString();
function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (value === "running" || value === "verified"
          ? "good"
          : value === "starting" || value === "suspended"
            ? "warm"
            : "")
      }
    >
      <i />
      {value.replaceAll("_", " ")}
    </span>
  );
}
function Empty({
  icon: Icon = Cloud,
  title,
  children,
}: {
  icon?: typeof Cloud;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={29} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="login-art">
        <div className="brand">
          <span className="brand-icon">
            <Cloud />
          </span>
          CloudDroid<span className="beta">PRIVATE WORKSPACE</span>
        </div>
        <div>
          <span className="eyebrow">YOUR ANDROID. YOUR SPACE.</span>
          <h1>
            A separate space
            <br />
            for every part
            <br />
            of your world<span>.</span>
          </h1>
          <p>
            Manage isolated Android profiles, choose your network route, and
            keep your conversations together.
          </p>
          <div className="login-pills">
            <span>
              <ShieldCheck size={16} /> Protected access
            </span>
            <span>
              <Smartphone size={16} /> Anywhere you work
            </span>
          </div>
        </div>
        <small>CloudDroid / v0.1 · Private control plane</small>
      </div>
      <div className="login-form">
        <div className="lock">
          <LockKeyhole size={28} />
        </div>
        <h2>Welcome to your workspace</h2>
        <p>Sign in with your administrator account.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const user = await api("/auth/login", "POST", {
                username: f.get("username"),
                password: f.get("password"),
              });
              setCsrf(user.csrf);
              onLogin();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              defaultValue="admin"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to CloudDroid"}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <p className="muted tiny">
          Your credentials are configured on your server. Follow the
          administrator runbook if you need to reset your password.
        </p>
      </div>
    </main>
  );
}

function Viewer({
  profile,
  run,
}: {
  profile?: Profile;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null),
    peer = useRef<RTCPeerConnection | null>(null),
    box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("disconnected"),
    [text, setText] = useState("");
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    setState("disconnected");
    return () => {
      mounted.current = false;
      peer.current?.close();
      peer.current = null;
      if (profile)
        void api("/profiles/" + profile!.id + "/stream", "DELETE").catch(
          () => {},
        );
    };
  }, [profile?.id]);
  const input = (body: unknown) =>
    api("/profiles/" + profile?.id + "/input", "POST", body);
  const point = (e: React.PointerEvent<HTMLVideoElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(719, Math.round(((e.clientX - r.left) / r.width) * 720)),
      ),
      y: Math.max(
        0,
        Math.min(1279, Math.round(((e.clientY - r.top) / r.height) * 1280)),
      ),
    };
  };
  return (
    <div className="viewer-layout">
      <section className="panel viewer-panel">
        <div className="panel-heading">
          <div>
            <h3>{profile?.name || "Android viewer"}</h3>
            <span className="muted tiny">
              Encrypted WebRTC · 720 × 1280 · baseline video
            </span>
          </div>
          <button
            className="icon-button"
            title="Full screen"
            onClick={() => void box.current?.requestFullscreen()}
          >
            <Expand size={17} />
          </button>
        </div>
        <div className="device-stage" ref={box}>
          <div className="device">
            <div className="camera" />
            {state === "connected" ? (
              <video
                ref={video}
                autoPlay
                playsInline
                muted
                tabIndex={0}
                aria-label="Live Android screen"
                onKeyDown={(e) => {
                  if (e.key.length === 1 && /^[ -~]$/.test(e.key)) {
                    e.preventDefault();
                    void run(() => input({ kind: "text", text: e.key }));
                  } else {
                    const key = (
                      {
                        Enter: "ENTER",
                        Backspace: "DEL",
                        Escape: "BACK",
                      } as Record<string, string>
                    )[e.key];
                    if (key) {
                      e.preventDefault();
                      void run(() => input({ kind: "key", key }));
                    }
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.focus();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  start.current = { ...point(e), time: Date.now() };
                }}
                onPointerUp={(e) => {
                  if (!start.current) return;
                  const end = point(e),
                    from = start.current;
                  start.current = null;
                  void run(() =>
                    input(
                      Math.hypot(end.x - from.x, end.y - from.y) < 15
                        ? { kind: "tap", ...end }
                        : {
                            kind: "swipe",
                            x: from.x,
                            y: from.y,
                            x2: end.x,
                            y2: end.y,
                            duration: Math.max(
                              80,
                              Math.min(1500, Date.now() - from.time),
                            ),
                          },
                    ),
                  );
                }}
              />
            ) : (
              <div className="device-idle">
                <div className="android-mark">
                  <Smartphone size={48} />
                </div>
                <strong>Your Android workspace</strong>
                <span>
                  {profile?.status === "unavailable"
                    ? "Connect a Linux KVM host to begin"
                    : "Start your profile, then connect the viewer"}
                </span>
                <span className="mini-code">{state.toUpperCase()}</span>
              </div>
            )}
            <div className="android-nav">
              <button
                title="Back"
                onClick={() =>
                  void run(() => input({ kind: "key", key: "BACK" }))
                }
              >
                <ArrowLeft size={17} />
              </button>
              <button
                title="Home"
                onClick={() =>
                  void run(() => input({ kind: "key", key: "HOME" }))
                }
              >
                <Circle size={17} />
              </button>
              <button
                title="Recent apps"
                onClick={() =>
                  void run(() => input({ kind: "key", key: "APP_SWITCH" }))
                }
              >
                <Square size={15} />
              </button>
            </div>
          </div>
        </div>
        <div className="viewer-actions">
          <button
            className="primary"
            disabled={!profile || profile.status !== "running"}
            onClick={() =>
              void run(async () => {
                peer.current?.close();
                setState("connecting");
                try {
                  const config = await api("/stream/config");
                  if (!mounted.current) return;
                  const pc = new RTCPeerConnection({
                    iceServers: config.iceServers,
                  });
                  peer.current = pc;
                  pc.addTransceiver("video", { direction: "recvonly" });
                  pc.ontrack = (e) => {
                    setState("connected");
                    setTimeout(() => {
                      if (video.current)
                        video.current.srcObject = new MediaStream([e.track]);
                    }, 0);
                  };
                  pc.onconnectionstatechange = () => {
                    if (
                      ["failed", "closed", "disconnected"].includes(
                        pc.connectionState,
                      )
                    )
                      setState(pc.connectionState);
                  };
                  await pc.setLocalDescription(await pc.createOffer());
                  await new Promise<void>((resolve, reject) => {
                    if (pc.iceGatheringState === "complete") return resolve();
                    const timeout = setTimeout(
                      () =>
                        reject(
                          new Error(
                            "ICE gathering timed out; check TURN configuration",
                          ),
                        ),
                      15000,
                    );
                    pc.onicegatheringstatechange = () => {
                      if (pc.iceGatheringState === "complete") {
                        clearTimeout(timeout);
                        resolve();
                      }
                    };
                  });
                  const answer = await api(
                    "/profiles/" + profile!.id + "/stream",
                    "POST",
                    pc.localDescription,
                  );
                  if (!mounted.current) {
                    pc.close();
                    return;
                  }
                  await pc.setRemoteDescription(answer);
                } catch (err) {
                  setState("disconnected");
                  throw err;
                }
              })
            }
          >
            <Play size={15} />
            Connect viewer
          </button>
          <button
            disabled={!profile}
            onClick={() =>
              void run(async () => {
                peer.current?.close();
                await api("/profiles/" + profile?.id + "/stream", "DELETE");
                setState("disconnected");
              })
            }
          >
            Disconnect
          </button>
        </div>
      </section>
      <div className="viewer-sidebar">
        <section className="panel">
          <h3>Session controls</h3>
          <div className="stack">
            {(["start", "stop", "restart", "suspend"] as const).map(
              (action) => (
                <button
                  key={action}
                  disabled={!profile}
                  onClick={() =>
                    void run(() =>
                      api(
                        "/profiles/" + profile?.id + "/actions/" + action,
                        "POST",
                      ),
                    )
                  }
                >
                  {action === "start" ? (
                    <Play size={16} />
                  ) : action === "suspend" ? (
                    <Pause size={16} />
                  ) : (
                    <RefreshCw size={16} />
                  )}{" "}
                  {action[0].toUpperCase() + action.slice(1)} Android
                </button>
              ),
            )}
          </div>
        </section>
        <section className="panel">
          <h3>Manual account access</h3>
          <p className="muted">
            Use Google's official flow within this profile. Complete any
            required checks yourself.
          </p>
          <button
            className="wide"
            disabled={!profile}
            onClick={() => void run(() => input({ kind: "google" }))}
          >
            <Globe2 size={16} /> Open Google registration
          </button>
          <p className="tiny muted">
            Labels do not confirm account creation or connection.
          </p>
        </section>
        <section className="panel">
          <h3>Paste text to Android</h3>
          <textarea
            aria-label="Text to paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Printable ASCII text"
            maxLength={1000}
          />
          <button
            className="wide"
            disabled={!text || !profile}
            onClick={() =>
              void run(async () => {
                await input({ kind: "text", text });
                setText("");
              })
            }
          >
            <Copy size={15} /> Send text
          </button>
          <p className="tiny muted">
            One-way text input. Unicode, Android clipboard reading, pinch
            gestures and Android audio are not supported by this adapter.
          </p>
        </section>
        <section className="notice">
          <ShieldCheck size={20} />
          <div>
            <strong>Location access</strong>
            <p>
              Android location starts disabled. Review each app's permissions in
              Android Settings.
            </p>
            <button
              disabled={!profile}
              onClick={() =>
                void run(() => input({ kind: "location", enabled: false }))
              }
            >
              Disable Android location
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PhoneCenter({
  profile,
  run,
}: {
  profile?: Profile;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [events, setEvents] = useState<any[]>([]),
    [inventory, setInventory] = useState<any>(null),
    [number, setNumber] = useState("");
  const [voiceState, setVoiceState] = useState("offline"),
    [incoming, setIncoming] = useState<any>(null);
  const device = useRef<any>(null),
    call = useRef<any>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    setEvents([]);
    setIncoming(null);
    setNumber(profile?.phone_sid || "");
    setVoiceState("offline");
    const load = () => {
      if (profile)
        void api<any[]>("/profiles/" + profile.id + "/phone/events")
          .then((e) => {
            if (alive) setEvents(e);
          })
          .catch(() => {});
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      mounted.current = false;
      alive = false;
      clearInterval(timer);
      call.current?.disconnect();
      device.current?.destroy();
      device.current = null;
      call.current = null;
    };
  }, [profile?.id]);
  return (
    <>
      <div className="two-col">
        <section className="panel">
          <div className="panel-heading">
            <h3>Profile telephone number</h3>
            <Phone size={18} />
          </div>
          <div className="phone-number">
            {profile?.phone?.number || "No number assigned"}
          </div>
          <p className="muted">
            Assign a US number you already own in your connected Twilio account.
          </p>
          <div className="inline">
            <button
              onClick={() =>
                void run(async () =>
                  setInventory(await api("/provider/check", "POST")),
                )
              }
            >
              <RefreshCw size={15} /> Check provider & numbers
            </button>
            {inventory && <Status value={inventory.status} />}
          </div>
          {inventory && (
            <>
              <p className="tiny muted">
                {inventory.trial
                  ? "Trial account: provider restrictions apply."
                  : "Paid account: rental and usage charges apply."}{" "}
                Inventory limited to the first 200 owned numbers.
              </p>
              <label>
                Owned number
                <select
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                >
                  <option value="">Unassign number</option>
                  {inventory.numbers.map((n: any) => (
                    <option key={n.sid} value={n.sid}>
                      {n.number} · SMS {n.capabilities.sms ? "✓" : "—"} · Voice{" "}
                      {n.capabilities.voice ? "✓" : "—"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={!profile}
                onClick={() =>
                  void run(() =>
                    api("/profiles/" + profile?.id + "/phone", "PUT", {
                      sid: number,
                    }),
                  )
                }
              >
                Verify ownership & assign
              </button>
            </>
          )}
          <div className="small-note">
            <Info size={16} />
            <span>
              Google verification eligibility: unknown. A voice or SMS
              capability does not establish acceptance by Google.
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>Incoming voice</h3>
            <Status value={voiceState} />
          </div>
          <p className="muted">
            Enable the browser receiver to take calls for this profile. Keep
            this page open and allow microphone access.
          </p>
          <div className="inline">
            <button
              className="primary"
              disabled={
                !profile?.phone?.capabilities.voice || voiceState !== "offline"
              }
              onClick={() =>
                void run(async () => {
                  const { Device } = await import("@twilio/voice-sdk");
                  const token = await api(
                    "/profiles/" + profile?.id + "/phone/token",
                    "POST",
                  );
                  if (!mounted.current) return;
                  const d = new Device(token.token, { tokenRefreshMs: 60000 });
                  device.current = d;
                  d.on("registered", () => setVoiceState("listening"));
                  d.on("unregistered", () => setVoiceState("offline"));
                  d.on("error", () => setVoiceState("offline"));
                  d.on("tokenWillExpire", () => {
                    void api(
                      "/profiles/" + profile?.id + "/phone/token",
                      "POST",
                    )
                      .then((t) => d.updateToken(t.token))
                      .catch(() => {
                        d.destroy();
                        setVoiceState("offline");
                      });
                  });
                  d.on("incoming", (c) => {
                    call.current = c;
                    setIncoming(c);
                    setVoiceState("ringing");
                    const ended = () => {
                      setIncoming(null);
                      call.current = null;
                      setVoiceState("listening");
                    };
                    c.on("disconnect", ended);
                    c.on("cancel", ended);
                    c.on("reject", ended);
                  });
                  await d.register();
                  if (!mounted.current) d.destroy();
                })
              }
            >
              <Phone size={15} /> Enable receiver
            </button>
            <button
              onClick={() => {
                call.current?.disconnect();
                device.current?.destroy();
                setIncoming(null);
                setVoiceState("offline");
              }}
            >
              Turn off
            </button>
          </div>
          {incoming && (
            <div className="incoming">
              <strong>Incoming call: {incoming.parameters.From}</strong>
              <div className="inline">
                <button
                  className="primary"
                  onClick={() => {
                    incoming.accept();
                    setVoiceState("in_call");
                  }}
                >
                  Answer
                </button>
                <button
                  onClick={() => {
                    if (voiceState === "in_call") incoming.disconnect();
                    else incoming.reject();
                  }}
                >
                  End / decline
                </button>
              </div>
            </div>
          )}
          <p className="tiny muted">
            Browser audio uses Twilio's supported Voice SDK. Android browsers
            may require a user gesture; background calls are not guaranteed.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Private inbox & call history</h3>
            <p className="muted tiny">
              {profile?.name || "Select a profile"} · latest 200 events ·
              refreshes every 8 seconds
            </p>
          </div>
          <button
            className="danger subtle"
            disabled={!profile}
            onClick={() => {
              if (
                confirm(
                  "Permanently delete this profile’s SMS and call history?",
                )
              )
                void run(async () => {
                  await api(
                    "/profiles/" + profile?.id + "/phone/events",
                    "DELETE",
                  );
                  setEvents([]);
                });
            }}
          >
            <Trash2 size={15} />
            Clear history
          </button>
        </div>
        {events.length === 0 ? (
          <Empty icon={MessageSquare} title="Your inbox is clear">
            Messages and calls appear here after your provider delivers an
            authenticated webhook.
          </Empty>
        ) : (
          <div className="events">
            {events.map((e) => (
              <article className="event" key={e.sid}>
                <div className="event-icon">
                  {e.kind === "sms" ? (
                    <MessageSquare size={19} />
                  ) : (
                    <ArrowDownLeft size={19} />
                  )}
                </div>
                <div>
                  <strong>{e.from}</strong>
                  <small>
                    {stamp(e.received)} · {e.status}
                    {e.duration ? ` · ${e.duration}s` : ""}
                  </small>
                  {e.body && <p className="sms-body">{e.body}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function App() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [page, setPage] = useState<Page>("Dashboard"),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [selected, setSelected] = useState("");
  const [dashboard, setDashboard] = useState<any>(null),
    [settings, setSettings] = useState<any>(null),
    [diagnostics, setDiagnostics] = useState<any>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<"create" | "edit" | null>(null),
    [mobileNav, setMobileNav] = useState(false);
  const [mode, setMode] = useState<"direct" | "proxy">("direct"),
    [proxyUrl, setProxyUrl] = useState("");
  const profile = profiles.find((p) => p.id === selected);
  const refresh = useCallback(async () => {
    const [p, d, s] = await Promise.all([
      api<Profile[]>("/profiles"),
      api("/dashboard"),
      api("/settings"),
    ]);
    setProfiles(p);
    setDashboard(d);
    setSettings(s);
    setSelected((old) =>
      p.some((item) => item.id === old)
        ? old
        : p.find((item) => !item.archived)?.id || p[0]?.id || "",
    );
  }, []);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError("");
      setBusy(true);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  useEffect(() => {
    const signedOut = () => {
      setAuth(false);
      setProfiles([]);
      setCsrf("");
    };
    window.addEventListener("clouddroid-signed-out", signedOut);
    void api("/auth/me")
      .then((me) => {
        setCsrf(me.csrf);
        setAuth(true);
      })
      .catch(() => setAuth(false));
    return () => window.removeEventListener("clouddroid-signed-out", signedOut);
  }, []);
  useEffect(() => {
    if (!auth) return;
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      10000,
    );
    return () => clearInterval(timer);
  }, [auth, refresh]);
  useEffect(() => {
    setDiagnostics(null);
    setMode(profile?.network.mode || "direct");
    setProxyUrl("");
    if (!selected) return;
    let active = true;
    const load = () =>
      void api("/profiles/" + selected + "/diagnostics")
        .then((d) => {
          if (active) setDiagnostics(d);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected, profile?.network.mode]);
  if (auth === null)
    return (
      <div className="loading">
        <Cloud size={32} />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!auth) return <Login onLogin={() => setAuth(true)} />;
  const go = (p: Page) => {
    setPage(p);
    setMobileNav(false);
    setError("");
  };
  const action = (p: Profile, a: string) =>
    run(() => api(`/profiles/${p.id}/actions/${a}`, "POST"));
  const profileCard = (p: Profile) => (
    <article
      className={"profile-card " + (selected === p.id ? "selected" : "")}
      key={p.id}
    >
      <div className="profile-top">
        <button
          className="profile-avatar"
          title={"Select " + p.name}
          onClick={() => setSelected(p.id)}
        >
          {p.name.slice(0, 1).toUpperCase()}
        </button>
        <Status value={p.archived ? "archived" : p.status} />
      </div>
      <h3>{p.name}</h3>
      <div className="profile-label">{p.label || "No account label"}</div>
      <div className="profile-facts">
        <span>
          <Globe2 size={14} />
          {p.network.mode === "direct"
            ? "Cloud host egress"
            : p.network.endpoint}
        </span>
        <span>
          <Phone size={14} />
          {p.phone?.number || "No number assigned"}
        </span>
      </div>
      <div className="profile-footer">
        <button
          className={selected === p.id ? "primary soft" : ""}
          onClick={() => {
            setSelected(p.id);
            go("Android viewer");
          }}
        >
          <MonitorSmartphone size={15} /> Open workspace
          <ChevronRight size={14} />
        </button>
        <button
          className="icon-button"
          title={"Edit " + p.name}
          onClick={() => {
            setSelected(p.id);
            setModal("edit");
          }}
        >
          <MoreHorizontal size={19} />
        </button>
      </div>
    </article>
  );
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobileNav ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("Dashboard");
          }}
        >
          <span className="brand-icon">
            <Cloud size={22} />
          </span>
          CloudDroid
        </a>
        <span className="workspace-tag">
          <span />
          PRIVATE WORKSPACE
        </span>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => go(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Profiles" && (
                <span className="nav-count">{profiles.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-card">
            <ShieldCheck size={21} />
            <strong>Isolated by design</strong>
            <p>Separate app data and storage for every Android profile.</p>
            <span>Administrator access required</span>
          </div>
          <button
            className="admin"
            onClick={() =>
              void run(async () => {
                await api("/auth/logout", "POST");
                setAuth(false);
                setCsrf("");
              })
            }
          >
            <span className="admin-avatar">A</span>
            <span>
              <strong>Administrator</strong>
              <small>Private workspace</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="private-pill">
              <LockKeyhole size={13} /> Private
            </span>
            <button
              className="icon-button"
              title="Refresh workspace"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} />
            </button>
            <span className="small-avatar">A</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Dashboard"
                  ? "YOUR PRIVATE ANDROID CLOUD"
                  : "CLOUDDROID WORKSPACE"}
              </div>
              <h1>{page === "Dashboard" ? "Workspace overview" : page}</h1>
              <p>
                {
                  {
                    Dashboard:
                      "Your Android profiles, connections, and conversations. All in one place.",
                    Profiles:
                      "Independent spaces for your apps, accounts, and everyday work.",
                    "Android viewer":
                      "Open your profile and interact with Android securely from your browser.",
                    Network:
                      "Choose a route and inspect what the internet can actually observe.",
                    "Phone center":
                      "Your owned numbers and private conversations, organized by profile.",
                    Settings:
                      "Manage your infrastructure, provider connection, and security.",
                  }[page]
                }
              </p>
            </div>
            {page === "Dashboard" || page === "Profiles" ? (
              <button className="primary" onClick={() => setModal("create")}>
                <Plus size={17} />
                Create profile
              </button>
            ) : (
              <label className="profile-select">
                <span>Active profile</span>
                <select
                  aria-label="Active profile"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.archived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {error && (
            <div className="error toast" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              Saving / checking…
            </div>
          )}
          {page === "Dashboard" && (
            <>
              <div className="stats">
                <div className="stat">
                  <span className="stat-icon purple">
                    <Smartphone size={21} />
                  </span>
                  <span>Total profiles</span>
                  <strong>
                    {dashboard?.profiles ?? "—"}
                    <small> / {dashboard?.max_profiles ?? "—"} capacity</small>
                  </strong>
                  <p>Independent Android storage</p>
                </div>
                <div className="stat">
                  <span className="stat-icon green">
                    <Activity size={21} />
                  </span>
                  <span>Active sessions</span>
                  <strong>
                    {dashboard?.active ?? "—"}
                    <small> / {dashboard?.max_active ?? "—"} available</small>
                  </strong>
                  <p>Includes starting & suspended</p>
                </div>
                <div className="stat">
                  <span className="stat-icon blue">
                    <Network size={21} />
                  </span>
                  <span>Network routing</span>
                  <strong className="text-stat">
                    {dashboard?.network_checked
                      ? `${dashboard.network_us} US route${dashboard.network_us === 1 ? "" : "s"}`
                      : "Awaiting check"}
                  </strong>
                  <p>
                    {dashboard?.network_checked
                      ? `${dashboard.network_checked} recent verified check(s)`
                      : "Verify egress inside a running profile"}
                  </p>
                </div>
                <div className="stat">
                  <span className="stat-icon orange">
                    <Phone size={21} />
                  </span>
                  <span>Phone service</span>
                  <strong className="text-stat">
                    {dashboard?.phone_configured
                      ? "Configured"
                      : "Not connected"}
                  </strong>
                  <p>
                    {dashboard?.phone_configured
                      ? "Run a provider check for live status"
                      : "Connect an owned Twilio number"}
                  </p>
                </div>
              </div>
              {!dashboard?.runtime_configured && (
                <div className="setup-banner">
                  <div className="setup-icon">
                    <Cloud size={26} />
                  </div>
                  <div>
                    <strong>
                      Your control plane is ready. Connect your Android host.
                    </strong>
                    <p>
                      Local mode is active. A Linux server with KVM is required
                      to launch Android sessions.
                    </p>
                  </div>
                  <button onClick={() => go("Settings")}>
                    View setup
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              )}
              <div className="section-title">
                <div>
                  <h2>
                    Your profiles <span>{profiles.length}</span>
                  </h2>
                  <p>
                    A dedicated Android environment for each part of your work.
                  </p>
                </div>
                <button className="text-button" onClick={() => go("Profiles")}>
                  Manage profiles
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="profile-grid">
                {profiles.slice(0, 3).map(profileCard)}
              </div>
              <div className="dashboard-bottom">
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Resource overview</h3>
                    <span className="muted tiny">
                      {dashboard?.resources.scope || "API host"} · live
                      measurements
                    </span>
                  </div>
                  <div className="resource">
                    <span>
                      <Cpu size={16} />
                      CPU usage
                    </span>
                    <strong>{dashboard?.resources.cpu_percent ?? 0}%</strong>
                  </div>
                  <progress
                    value={dashboard?.resources.cpu_percent || 0}
                    max="100"
                  />
                  <div className="resource">
                    <span>
                      <Square size={15} />
                      Memory
                    </span>
                    <strong>
                      {dashboard?.resources.memory_used_gb ?? "—"} /{" "}
                      {dashboard?.resources.memory_total_gb ?? "—"} GB
                    </strong>
                  </div>
                  <progress
                    value={dashboard?.resources.memory_used_gb || 0}
                    max={dashboard?.resources.memory_total_gb || 1}
                  />
                  <p className="tiny muted">
                    Runtime containers are limited to 2 CPUs and 4 GB each.
                    Cloud charges depend on your host and usage.
                  </p>
                </section>
                <section className="panel quick-start">
                  <div className="panel-heading">
                    <h3>Make it your workspace</h3>
                    <span className="step-label">GET STARTED</span>
                  </div>
                  {[
                    [
                      "Choose a profile",
                      "Open an isolated Android workspace",
                      "Profiles",
                    ],
                    [
                      "Verify your connection",
                      "Check public IP and geographic classification",
                      "Network",
                    ],
                    [
                      "Connect your phone service",
                      "Assign a number you legitimately own",
                      "Phone center",
                    ],
                  ].map(([title, copy, target], i) => (
                    <button
                      className="quick-row"
                      key={title}
                      onClick={() => go(target as Page)}
                    >
                      <span className="step">{i + 1}</span>
                      <span>
                        <strong>{title}</strong>
                        <small>{copy}</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </section>
              </div>
            </>
          )}
          {page === "Profiles" && (
            <>
              <div className="profile-grid">{profiles.map(profileCard)}</div>
              <div className="notice">
                <ShieldCheck size={21} />
                <div>
                  <strong>Configuration cloning preserves independence</strong>
                  <p>
                    Create a profile from permitted network configuration.
                    Android disks, account labels, recovery notes, phone
                    assignments and inboxes start fresh.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "Android viewer" && (
            <Viewer key={selected} profile={profile} run={run} />
          )}
          {page === "Network" && (
            <>
              <div className="two-col">
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Egress configuration</h3>
                    <ShieldCheck size={18} />
                  </div>
                  <label>
                    Network route
                    <select
                      value={mode}
                      onChange={(e) =>
                        setMode(e.target.value as "direct" | "proxy")
                      }
                    >
                      <option value="direct">
                        Cloud host public egress (recommended US host)
                      </option>
                      <option value="proxy">
                        User-supplied proxy · fail closed
                      </option>
                    </select>
                  </label>
                  {mode === "proxy" && (
                    <>
                      <label>
                        Proxy URL
                        <input
                          aria-label="Proxy URL"
                          type="password"
                          autoComplete="off"
                          placeholder="socks5://user:password@host:port"
                          value={proxyUrl}
                          onChange={(e) => setProxyUrl(e.target.value)}
                        />
                      </label>
                      <label className="file-input">
                        Import URL from text file
                        <input
                          type="file"
                          accept=".txt,.conf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              void run(async () => {
                                if (file.size > 2048)
                                  throw new Error(
                                    "Use a text file with one proxy URL, maximum 2 KB",
                                  );
                                setProxyUrl((await file.text()).trim());
                              });
                          }}
                        />
                      </label>
                      <p className="tiny muted">
                        HTTP, HTTPS CONNECT, SOCKS5. Blank URL retains the saved
                        encrypted endpoint. Current:{" "}
                        {profile?.network.endpoint || "none"}.
                      </p>
                    </>
                  )}
                  <button
                    className="primary"
                    disabled={!profile}
                    onClick={() =>
                      void run(() =>
                        api("/profiles/" + profile?.id + "/network", "PUT", {
                          mode,
                          proxy_url: proxyUrl,
                        }),
                      )
                    }
                  >
                    Save network route
                  </button>
                  <p className="tiny muted">
                    Stop the session before changing routes. Proxy mode supports
                    TCP; external UDP, cleartext DNS and IPv6 are blocked. A
                    broken proxy cannot select direct egress automatically.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Connection diagnostics</h3>
                    <button
                      className="icon-button"
                      title="Run network diagnostics"
                      disabled={!profile}
                      onClick={() =>
                        void run(async () =>
                          setDiagnostics(
                            await api(
                              "/profiles/" + profile?.id + "/diagnostics",
                              "POST",
                            ),
                          ),
                        )
                      }
                    >
                      <RefreshCw size={17} />
                    </button>
                  </div>
                  {!diagnostics?.checked_at ? (
                    <Empty icon={Wifi} title="No verified connection yet">
                      Start Android, then run a check from inside its own
                      network namespace.
                    </Empty>
                  ) : (
                    <>
                      <Status
                        value={
                          diagnostics.stale ? "stale_check" : diagnostics.status
                        }
                      />
                      <div className="ip-address">
                        {diagnostics.ip || "Unavailable"}
                      </div>
                      <dl className="details">
                        <dt>Country classification</dt>
                        <dd>
                          {diagnostics.country || "Unknown"}{" "}
                          {diagnostics.city || ""}
                        </dd>
                        <dt>US egress observed</dt>
                        <dd>
                          {diagnostics.is_us === true
                            ? "Yes, at last check"
                            : diagnostics.is_us === false
                              ? "No"
                              : "Not established"}
                        </dd>
                        <dt>Round-trip check time</dt>
                        <dd>{diagnostics.latency_ms} ms</dd>
                        <dt>Last checked</dt>
                        <dd>{stamp(diagnostics.checked_at)}</dd>
                        <dt>IP observers</dt>
                        <dd>
                          {diagnostics.observers?.join(" + ") || "Not verified"}
                        </dd>
                      </dl>
                    </>
                  )}
                  <button
                    className="wide"
                    disabled={!profile}
                    onClick={() =>
                      void run(async () =>
                        setDiagnostics(
                          await api(
                            "/profiles/" + profile?.id + "/diagnostics",
                            "POST",
                          ),
                        ),
                      )
                    }
                  >
                    <Activity size={15} /> Run route diagnostics
                  </button>
                </section>
              </div>
              <div className="two-col">
                <section className="panel">
                  <h3>DNS privacy</h3>
                  <p className="muted">
                    DNS is forwarded through encrypted DNS over HTTPS using the
                    selected route. An independent authoritative DNS leak test
                    is a separate check.
                  </p>
                  <div className="small-note">
                    <Info size={17} />
                    <span>
                      {diagnostics?.dns?.full_leak_test ||
                        "External resolver attribution has not been verified."}
                    </span>
                  </div>
                  <button
                    disabled={!profile}
                    onClick={() =>
                      void run(() =>
                        api("/profiles/" + profile?.id + "/input", "POST", {
                          kind: "dns-test",
                        }),
                      )
                    }
                  >
                    Open independent DNS test in Android
                    <ArrowUpRight size={15} />
                  </button>
                </section>
                <section className="notice">
                  <ShieldCheck size={23} />
                  <div>
                    <strong>Privacy has practical boundaries</strong>
                    <p>
                      A US IP does not conceal all device identifiers, establish
                      eligibility, or guarantee how another service classifies
                      your location. Use services through their official
                      authentication and verification flows.
                    </p>
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "Phone center" && (
            <PhoneCenter key={selected} profile={profile} run={run} />
          )}
          {page === "Settings" && (
            <>
              <div className="two-col">
                <section className="panel">
                  <h3>Infrastructure & security</h3>
                  <dl className="details">
                    <dt>Public origin</dt>
                    <dd>{settings?.public_url}</dd>
                    <dt>Android runtime</dt>
                    <dd>
                      {settings?.runtime_enabled
                        ? "Configured; host validation required"
                        : "Local mode · not configured"}
                    </dd>
                    <dt>Android image</dt>
                    <dd>{settings?.android_image}</dd>
                    <dt>Database</dt>
                    <dd>{settings?.database}</dd>
                    <dt>Profile / active limits</dt>
                    <dd>
                      {settings?.max_profiles} / {settings?.max_active}
                    </dd>
                    <dt>Session expiry</dt>
                    <dd>{settings?.session_hours} hours</dd>
                    <dt>TURN relay</dt>
                    <dd>
                      {settings?.turn_configured
                        ? "Configured"
                        : "Not configured"}
                    </dd>
                    <dt>Sensitive data</dt>
                    <dd>Authenticated encryption at rest</dd>
                  </dl>
                  <p className="muted tiny">
                    Configure infrastructure through the server .env file.
                    Consult README.md and docs/DEPLOYMENT.md. The runtime
                    requires Linux/KVM; Docker Desktop alone is insufficient.
                  </p>
                </section>
                <section className="panel">
                  <h3>Connect Twilio</h3>
                  <p className="muted">
                    Credentials are checked with the provider before being
                    encrypted and saved. Saved secrets are never displayed.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const values = Object.fromEntries(new FormData(form));
                      void run(async () => {
                        await api("/provider", "PUT", values);
                        form.reset();
                      });
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        Account SID
                        <input
                          name="account_sid"
                          placeholder="AC…"
                          required
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        Auth token
                        <input
                          name="auth_token"
                          type="password"
                          required
                          autoComplete="new-password"
                        />
                      </label>
                      <label>
                        API key SID (voice)
                        <input
                          name="api_key"
                          placeholder="SK…"
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        API secret (voice)
                        <input
                          name="api_secret"
                          type="password"
                          autoComplete="new-password"
                        />
                      </label>
                    </div>
                    <label>
                      TwiML App SID (voice)
                      <input
                        name="twiml_app_sid"
                        placeholder="AP…"
                        autoComplete="off"
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Verify & save credentials
                    </button>
                  </form>
                  <p className="tiny muted">
                    Set your owned number's SMS webhook to{" "}
                    {settings?.public_url}/hooks/twilio/sms and voice webhook to
                    /hooks/twilio/voice (POST). Set voice status callbacks to
                    /hooks/twilio/call-status.
                  </p>
                </section>
              </div>
              <section className="panel">
                <h3>Operating notes</h3>
                <div className="three-notes">
                  <div>
                    <ShieldCheck size={21} />
                    <strong>Protect the server</strong>
                    <p>
                      Use HTTPS, encrypted cloud disks and a restricted
                      firewall. Never expose Docker, ADB, or the database.
                    </p>
                  </div>
                  <div>
                    <Cloud size={21} />
                    <strong>Infrastructure is paid</strong>
                    <p>
                      Open-source software is free to run. KVM cloud hosts,
                      bandwidth, number rental and telephone usage have ongoing
                      costs.
                    </p>
                  </div>
                  <div>
                    <Activity size={21} />
                    <strong>Logs & recovery</strong>
                    <p>
                      Structured server logs exclude request bodies. Follow the
                      backup/restore runbook and keep the encryption key
                      separately.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} /> CloudDroid private workspace
            </span>
            <span>v0.1.0 · Manual account management</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-label={modal === "create" ? "Create profile" : "Edit profile"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h2>
                {modal === "create" ? "Create a profile" : "Profile settings"}
              </h2>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <X size={19} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(async () => {
                  if (modal === "create") {
                    const p = await api("/profiles", "POST", {
                      name: data.get("name"),
                      clone_from: data.get("clone_from") || null,
                    });
                    setSelected(p.id);
                  } else {
                    await api("/profiles/" + selected, "PATCH", {
                      name: data.get("name"),
                      label: data.get("label"),
                      recovery: data.get("recovery"),
                    });
                  }
                  setModal(null);
                });
              }}
            >
              <label>
                Display name
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={modal === "edit" ? profile?.name : ""}
                  autoFocus
                />
              </label>
              {modal === "create" ? (
                <label>
                  Copy permitted network configuration
                  <select name="clone_from">
                    <option value="">Start with cloud host egress</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · configuration only
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    Account label (user supplied)
                    <input
                      name="label"
                      maxLength={120}
                      defaultValue={profile?.label}
                    />
                  </label>
                  <label>
                    Recovery notes
                    <textarea
                      name="recovery"
                      maxLength={2000}
                      defaultValue={profile?.recovery}
                    />
                  </label>
                  <p className="tiny muted">
                    Encrypted in the database. This label does not verify Google
                    account creation. Avoid storing account passwords here.
                  </p>
                </>
              )}
              <button className="primary wide" disabled={busy}>
                {modal === "create"
                  ? "Create independent profile"
                  : "Save profile"}
              </button>
            </form>
            {modal === "edit" && profile && (
              <div className="modal-danger">
                <button
                  onClick={() => {
                    void action(
                      profile,
                      profile.archived ? "restore" : "archive",
                    );
                    setModal(null);
                  }}
                >
                  {profile.archived ? "Restore profile" : "Archive profile"}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      confirm(
                        `Permanently delete “${profile.name}”, its Android disk, inbox and notes? Your provider number will not be released.`,
                      )
                    )
                      void run(async () => {
                        await api(
                          "/profiles/" + selected + "?confirm=" + selected,
                          "DELETE",
                        );
                        setModal(null);
                      });
                  }}
                >
                  <Trash2 size={15} />
                  Delete profile
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
