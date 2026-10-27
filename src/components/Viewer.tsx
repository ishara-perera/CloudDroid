import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Circle,
  Copy,
  Expand,
  Globe2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Square,
} from "lucide-react";
import { api, Profile } from "../api";

export function Viewer({
  profile,
  run,
}: {
  profile?: Profile;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("disconnected");
  const [text, setText] = useState("");
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setState("disconnected");
    return () => {
      mounted.current = false;
      peer.current?.close();
      peer.current = null;
      if (profile) {
        void api("/profiles/" + profile.id + "/stream", "DELETE").catch(
          () => {},
        );
      }
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
            onClick={() => void box.current?.requestFullscreen?.()}
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
                  const end = point(e);
                  const from = start.current;
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
                      if (video.current) {
                        video.current.srcObject = new MediaStream([e.track]);
                      }
                    }, 0);
                  };
                  pc.onconnectionstatechange = () => {
                    if (
                      ["failed", "closed", "disconnected"].includes(
                        pc.connectionState,
                      )
                    ) {
                      setState(pc.connectionState);
                    }
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
                    void run(async () => {
                      if (action !== "start") {
                        peer.current?.close();
                        setState("disconnected");
                      }
                      await api(
                        "/profiles/" + profile?.id + "/actions/" + action,
                        "POST",
                      );
                    })
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
