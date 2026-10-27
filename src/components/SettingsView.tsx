import React from "react";
import { Activity, Cloud, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { SettingsData } from "../types";

export function SettingsView({
  settings,
  busy,
  run,
}: {
  settings: SettingsData | null;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
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
              {settings?.turn_configured ? "Configured" : "Not configured"}
            </dd>
            <dt>Sensitive data</dt>
            <dd>Authenticated encryption at rest</dd>
          </dl>
          <p className="muted tiny">
            Configure infrastructure through the server .env file. Consult
            README.md and docs/DEPLOYMENT.md. The runtime requires Linux/KVM;
            Docker Desktop alone is insufficient.
          </p>
        </section>
        <section className="panel">
          <h3>Connect Twilio</h3>
          <p className="muted">
            Credentials are checked with the provider before being encrypted and
            saved. Saved secrets are never displayed.
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
            Set your owned number's SMS webhook to {settings?.public_url}
            /hooks/twilio/sms and voice webhook to /hooks/twilio/voice (POST).
            Set voice status callbacks to /hooks/twilio/call-status.
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
              Use HTTPS, encrypted cloud disks and a restricted firewall. Never
              expose Docker, ADB, or the database.
            </p>
          </div>
          <div>
            <Cloud size={21} />
            <strong>Infrastructure is paid</strong>
            <p>
              Open-source software is free to run. KVM cloud hosts, bandwidth,
              number rental and telephone usage have ongoing costs.
            </p>
          </div>
          <div>
            <Activity size={21} />
            <strong>Logs & recovery</strong>
            <p>
              Structured server logs exclude request bodies. Follow the
              backup/restore runbook and keep the encryption key separately.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
