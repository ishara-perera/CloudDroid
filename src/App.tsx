import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Cloud,
  Cpu,
  Globe2,
  Info,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MonitorSmartphone,
  MoreHorizontal,
  Network,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Square,
  Users,
  X,
} from "lucide-react";
import { api, Profile, setCsrf } from "./api";
import {
  DashboardData,
  DiagnosticsData,
  NetworkMode,
  Page,
  SettingsData,
} from "./types";
import { Status } from "./components/Common";
import { Login } from "./components/Login";
import { Viewer } from "./components/Viewer";
import { PhoneCenter } from "./components/PhoneCenter";
import { NetworkView } from "./components/NetworkView";
import { SettingsView } from "./components/SettingsView";
import { ProfileModal } from "./components/ProfileModal";

const nav: [Page, typeof Cloud][] = [
  ["Dashboard", LayoutDashboard],
  ["Profiles", Users],
  ["Android viewer", MonitorSmartphone],
  ["Network", Globe2],
  ["Phone center", Phone],
  ["Settings", Settings],
];

export function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>("Dashboard");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [mode, setMode] = useState<NetworkMode>("direct");
  const [proxyUrl, setProxyUrl] = useState("");

  const profile = profiles.find((p) => p.id === selected);

  const refresh = useCallback(async () => {
    const [p, d, s] = await Promise.all([
      api<Profile[]>("/profiles"),
      api<DashboardData>("/dashboard"),
      api<SettingsData>("/settings"),
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
    void refresh().catch((e) => setError((e as Error).message));
    const timer = setInterval(
      () => void refresh().catch((e) => setError((e as Error).message)),
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
      void api<DiagnosticsData>("/profiles/" + selected + "/diagnostics")
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

  if (auth === null) {
    return (
      <div className="loading">
        <Cloud size={32} />
        <p>Opening your workspace…</p>
      </div>
    );
  }

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
            <NetworkView
              profile={profile}
              mode={mode}
              setMode={setMode}
              proxyUrl={proxyUrl}
              setProxyUrl={setProxyUrl}
              diagnostics={diagnostics}
              setDiagnostics={setDiagnostics}
              run={run}
            />
          )}
          {page === "Phone center" && (
            <PhoneCenter key={selected} profile={profile} run={run} />
          )}
          {page === "Settings" && (
            <SettingsView settings={settings} busy={busy} run={run} />
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
        <ProfileModal
          modal={modal}
          profile={profile}
          profiles={profiles}
          selected={selected}
          busy={busy}
          onClose={() => setModal(null)}
          onSelect={setSelected}
          onAction={action}
          run={run}
        />
      )}
    </div>
  );
}
