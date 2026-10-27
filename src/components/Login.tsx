import React, { useState } from "react";
import {
  ArrowUpRight,
  Cloud,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { api, setCsrf } from "../api";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
              defaultValue="admin"
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
          Local workspace administrator credentials default to username admin and
          password admin.
        </p>
      </div>
    </main>
  );
}
