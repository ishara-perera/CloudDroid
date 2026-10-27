import { InputEventPayload } from "../types";

interface ScreenState {
  screen: "home" | "browser" | "settings" | "recents" | "notes";
  browserUrl: string;
  typedText: string;
  locationEnabled: boolean;
  lastTouch: { x: number; y: number; label: string; time: number } | null;
}

interface ActivePeer {
  pc: RTCPeerConnection;
  timer: number;
  expiryTimer: number;
  stream: MediaStream;
}

const screens = new Map<string, ScreenState>();
const peers = new Map<string, ActivePeer>();

function getScreen(id: string): ScreenState {
  let s = screens.get(id);
  if (!s) {
    s = {
      screen: "home",
      browserUrl: "https://www.dnsleaktest.com/",
      typedText: "",
      locationEnabled: false,
      lastTouch: null,
    };
    screens.set(id, s);
  }
  return s;
}

export function resetVirtualScreen(id: string): void {
  closeVirtualStream(id);
  screens.delete(id);
}

export function closeVirtualStream(id?: string): void {
  if (id) {
    const item = peers.get(id);
    if (item) {
      window.clearInterval(item.timer);
      window.clearTimeout(item.expiryTimer);
      item.stream.getTracks().forEach((t) => t.stop());
      item.pc.close();
      peers.delete(id);
    }
    return;
  }
  Array.from(peers.keys()).forEach((k) => closeVirtualStream(k));
}

export function applyVirtualInput(id: string, ev: InputEventPayload): void {
  const s = getScreen(id);
  const now = Date.now();
  if (ev.kind === "google") {
    s.screen = "browser";
    s.browserUrl = "https://accounts.google.com/signup";
    s.lastTouch = { x: 360, y: 200, label: "Google signup", time: now };
  } else if (ev.kind === "dns-test") {
    s.screen = "browser";
    s.browserUrl = "https://www.dnsleaktest.com/";
    s.lastTouch = { x: 360, y: 200, label: "DNS leak test", time: now };
  } else if (ev.kind === "location") {
    s.locationEnabled = Boolean(ev.enabled);
    s.screen = "settings";
    s.lastTouch = { x: 360, y: 320, label: "Location updated", time: now };
  } else if (ev.kind === "text") {
    s.typedText = (s.typedText + (ev.text || "")).slice(-500);
    if (s.screen === "home") s.screen = "notes";
    s.lastTouch = { x: 360, y: 640, label: "Text input", time: now };
  } else if (ev.kind === "key") {
    if (ev.key === "HOME" || ev.key === "BACK") s.screen = "home";
    else if (ev.key === "APP_SWITCH")
      s.screen = s.screen === "recents" ? "home" : "recents";
    else if (ev.key === "DEL") s.typedText = s.typedText.slice(0, -1);
    else if (ev.key === "ENTER") s.typedText = (s.typedText + "\n").slice(-500);
    s.lastTouch = { x: 360, y: 1200, label: `Key ${ev.key}`, time: now };
  } else if (ev.kind === "swipe") {
    s.lastTouch = { x: ev.x2 ?? 360, y: ev.y2 ?? 640, label: "Swipe", time: now };
  } else if (ev.kind === "tap") {
    const x = ev.x ?? 360;
    const y = ev.y ?? 640;
    s.lastTouch = { x, y, label: `Tap (${x},${y})`, time: now };
    if (s.screen === "home" && y >= 820 && y <= 1020) {
      if (x < 260) s.screen = "browser";
      else if (x < 460) s.screen = "notes";
      else s.screen = "settings";
    } else if (s.screen === "recents") {
      s.screen = "home";
    }
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  name: string,
  route: string,
  s: ScreenState,
) {
  ctx.fillStyle = "#13101d";
  ctx.fillRect(0, 0, 720, 1280);
  ctx.fillStyle = "#0b0912";
  ctx.fillRect(0, 0, 720, 54);

  const clock = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.fillStyle = "#ebe5f7";
  ctx.font = "600 21px Inter, sans-serif";
  ctx.fillText(clock, 28, 35);
  ctx.textAlign = "right";
  ctx.fillStyle = "#aa96d1";
  ctx.fillText(route, 692, 35);
  ctx.textAlign = "left";

  if (s.screen === "home") {
    ctx.fillStyle = "#f2edf9";
    ctx.font = "300 84px Inter, sans-serif";
    ctx.fillText(clock, 60, 205);
    ctx.fillStyle = "#b59ee0";
    ctx.font = "500 24px Inter, sans-serif";
    ctx.fillText(`${name} · Isolated Android 14`, 64, 255);

    ctx.fillStyle = "#221b33";
    ctx.fillRect(56, 315, 608, 165);
    ctx.fillStyle = "#ded3f4";
    ctx.font = "600 24px Inter, sans-serif";
    ctx.fillText("Workspace Isolation Active", 86, 368);
    ctx.fillStyle = "#9d8fb5";
    ctx.font = "400 20px Inter, sans-serif";
    ctx.fillText(`Egress: ${route}`, 86, 408);
    ctx.fillText(
      `Location: ${s.locationEnabled ? "Enabled" : "Disabled"}`,
      86,
      446,
    );

    const apps = [
      { label: "Browser", x: 90, bg: "#3d2c5e", fg: "#c2abff" },
      { label: "Scratchpad", x: 300, bg: "#233c35", fg: "#82dcac" },
      { label: "Settings", x: 510, bg: "#3b2f45", fg: "#e6c68e" },
    ];
    apps.forEach((a) => {
      ctx.fillStyle = a.bg;
      ctx.fillRect(a.x, 850, 120, 120);
      ctx.fillStyle = a.fg;
      ctx.font = "700 38px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(a.label[0], a.x + 60, 924);
      ctx.fillStyle = "#dcd3eb";
      ctx.font = "500 19px Inter, sans-serif";
      ctx.fillText(a.label, a.x + 60, 1008);
      ctx.textAlign = "left";
    });
  } else if (s.screen === "browser") {
    ctx.fillStyle = "#261f36";
    ctx.fillRect(28, 80, 664, 64);
    ctx.fillStyle = "#dfd6f2";
    ctx.font = "500 20px Inter, sans-serif";
    ctx.fillText(s.browserUrl.slice(0, 48), 52, 120);

    ctx.fillStyle = "#191524";
    ctx.fillRect(28, 170, 664, 980);
    const isGoogle = s.browserUrl.includes("accounts.google.com");
    ctx.fillStyle = "#f0eaf9";
    ctx.font = "600 30px Inter, sans-serif";
    ctx.fillText(
      isGoogle ? "Google Account Registration" : "Independent DNS Leak Test",
      58,
      245,
    );
    ctx.fillStyle = "#9f93b5";
    ctx.font = "400 21px Inter, sans-serif";
    ctx.fillText(
      isGoogle
        ? `Manual verification flow · Profile: ${name}`
        : `Encrypted DoH active via ${route}`,
      58,
      295,
    );
    if (s.typedText) {
      ctx.fillStyle = "#e6dff5";
      ctx.font = "400 22px monospace";
      ctx.fillText(s.typedText.slice(-36), 58, 375);
    }
  } else if (s.screen === "notes") {
    ctx.fillStyle = "#f0eaf9";
    ctx.font = "600 28px Inter, sans-serif";
    ctx.fillText("ASCII Input Scratchpad", 48, 124);
    ctx.fillStyle = "#e6dff5";
    ctx.font = "400 23px monospace";
    (s.typedText || "Type or paste ASCII text...").split("\n").slice(-16).forEach((ln, i) => {
      ctx.fillText(ln.slice(0, 38), 48, 190 + i * 36);
    });
  } else if (s.screen === "settings") {
    ctx.fillStyle = "#f0eaf9";
    ctx.font = "600 30px Inter, sans-serif";
    ctx.fillText("Privacy & Location", 48, 126);
    ctx.fillStyle = s.locationEnabled ? "#e6c68e" : "#82dcac";
    ctx.font = "500 22px Inter, sans-serif";
    ctx.fillText(
      s.locationEnabled ? "Location: Enabled" : "Location: Disabled",
      48,
      190,
    );
  } else {
    ctx.fillStyle = "#261f36";
    ctx.fillRect(110, 220, 500, 740);
    ctx.fillStyle = "#ebe4f7";
    ctx.font = "600 26px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${name} · Recent Apps`, 360, 575);
    ctx.textAlign = "left";
  }

  if (s.lastTouch && Date.now() - s.lastTouch.time < 1500) {
    ctx.strokeStyle = "#b29aff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.lastTouch.x, s.lastTouch.y, 28, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export async function negotiateVirtualStream(
  id: string,
  name: string,
  route: string,
  offer: RTCSessionDescriptionInit,
  fps: number,
): Promise<RTCSessionDescriptionInit> {
  closeVirtualStream(id);
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  drawFrame(ctx, name, route, getScreen(id));
  const timer = window.setInterval(
    () => drawFrame(ctx, name, route, getScreen(id)),
    Math.max(100, Math.round(1000 / Math.max(1, fps))),
  );
  const stream = canvas.captureStream(fps);
  const pc = new RTCPeerConnection();
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  const expiryTimer = window.setTimeout(() => closeVirtualStream(id), 600_000);
  pc.onconnectionstatechange = () => {
    if (["closed", "failed", "disconnected"].includes(pc.connectionState))
      closeVirtualStream(id);
  };
  peers.set(id, { pc, timer, expiryTimer, stream });

  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const to = window.setTimeout(resolve, 2500);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(to);
        resolve();
      }
    };
  });
  if (!pc.localDescription) throw new Error("Invalid WebRTC offer");
  return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
}
