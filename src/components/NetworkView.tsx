import React from "react";
import {
  Activity,
  ArrowUpRight,
  Info,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { api, Profile } from "../api";
import { DiagnosticsData, NetworkMode } from "../types";
import { Empty, stamp, Status } from "./Common";

export function NetworkView({
  profile,
  mode,
  setMode,
  proxyUrl,
  setProxyUrl,
  diagnostics,
  setDiagnostics,
  run,
}: {
  profile?: Profile;
  mode: NetworkMode;
  setMode: (m: NetworkMode) => void;
  proxyUrl: string;
  setProxyUrl: (v: string) => void;
  diagnostics: DiagnosticsData | null;
  setDiagnostics: (d: DiagnosticsData) => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
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
              onChange={(e) => setMode(e.target.value as NetworkMode)}
            >
              <option value="direct">
                Cloud host public egress (recommended US host)
              </option>
              <option value="proxy">User-supplied proxy · fail closed</option>
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
                    if (file) {
                      void run(async () => {
                        if (file.size > 2048) {
                          throw new Error(
                            "Use a text file with one proxy URL, maximum 2 KB",
                          );
                        }
                        setProxyUrl((await file.text()).trim());
                      });
                    }
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
            Stop the session before changing routes. Proxy mode supports TCP;
            external UDP, cleartext DNS and IPv6 are blocked. A broken proxy
            cannot select direct egress automatically.
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
                    await api<DiagnosticsData>(
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
              Start Android, then run a check from inside its own network
              namespace.
            </Empty>
          ) : (
            <>
              <Status
                value={diagnostics.stale ? "stale_check" : diagnostics.status}
              />
              <div className="ip-address">
                {diagnostics.ip || "Unavailable"}
              </div>
              <dl className="details">
                <dt>Country classification</dt>
                <dd>
                  {diagnostics.country || "Unknown"} {diagnostics.city || ""}
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
                <dd>{diagnostics.observers?.join(" + ") || "Not verified"}</dd>
              </dl>
            </>
          )}
          <button
            className="wide"
            disabled={!profile}
            onClick={() =>
              void run(async () =>
                setDiagnostics(
                  await api<DiagnosticsData>(
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
            DNS is forwarded through encrypted DNS over HTTPS using the selected
            route. An independent authoritative DNS leak test is a separate
            check.
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
              eligibility, or guarantee how another service classifies your
              location. Use services through their official authentication and
              verification flows.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
