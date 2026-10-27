import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Download,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { downloadAndroidProjectZip } from "../services/androidProjectBuilder";

function getDefaultSharedUrl(): string {
  const origin = window.location.origin;
  if (origin.includes("localhost") || origin.includes("0.0.0.0")) {
    return "https://ais-pre-up77e7pxmieylokurdhvx6-785559868173.asia-northeast1.run.app";
  }
  // Always convert the private editor URL (ais-dev-) to the shared preview URL (ais-pre-)
  return origin.replace("://ais-dev-", "://ais-pre-");
}

export function PhoneDeployModal({
  isOpen,
  onClose,
  isInstallable,
  isInstalled,
  onNativeInstall,
  initialTab = "pwa",
}: {
  isOpen: boolean;
  onClose: () => void;
  isInstallable?: boolean;
  isInstalled?: boolean;
  onNativeInstall?: () => Promise<boolean>;
  initialTab?: "pwa" | "apk";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [tab, setTab] = useState<"pwa" | "apk">(initialTab);
  const [phoneUrl, setPhoneUrl] = useState<string>(getDefaultSharedUrl);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setPhoneUrl(getDefaultSharedUrl());
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && tab === "pwa" && canvasRef.current && phoneUrl.trim()) {
      void QRCode.toCanvas(canvasRef.current, phoneUrl.trim(), {
        width: 176,
        margin: 2,
        color: {
          dark: "#17131f",
          light: "#f0ebf8",
        },
      });
    }
  }, [isOpen, tab, phoneUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(phoneUrl.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadApkProject = () => {
    downloadAndroidProjectZip(phoneUrl.trim());
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal panel install-hub-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Install CloudDroid on Android"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-heading">
          <div className="install-modal-title">
            <span className="install-modal-badge">
              <Smartphone size={18} />
            </span>
            <div>
              <h2>Install CloudDroid on Android</h2>
              <span className="muted tiny">
                Shared App QR (`ais-pre`) &amp; Android Studio APK Project
              </span>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="install-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "pwa"}
            className={tab === "pwa" ? "active" : ""}
            onClick={() => setTab("pwa")}
          >
            <QrCode size={15} />
            Instant Phone Install (PWA)
          </button>
          <button
            role="tab"
            aria-selected={tab === "apk"}
            className={tab === "apk" ? "active" : ""}
            onClick={() => setTab("apk")}
          >
            <Code2 size={15} />
            Android APK Project (.zip)
          </button>
        </div>

        {tab === "pwa" ? (
          <div className="install-tab-body">
            {isInstallable && onNativeInstall && (
              <div className="native-prompt-banner">
                <div>
                  <strong>Ready for 1-Tap Native Install</strong>
                  <p>
                    Your browser supports direct Android app drawer installation.
                  </p>
                </div>
                <button
                  className="install-cta-btn"
                  onClick={() => void onNativeInstall()}
                >
                  <Download size={15} />
                  Install Now
                </button>
              </div>
            )}

            {isInstalled && (
              <div className="native-prompt-banner installed">
                <div>
                  <strong>CloudDroid is Installed</strong>
                  <p>Running in standalone Android app mode.</p>
                </div>
              </div>
            )}

            <div className="qr-stage">
              <div className="qr-card">
                <canvas ref={canvasRef} />
              </div>
              <span className="qr-caption">
                Shared App URL (updated from private <code>ais-dev</code> to{" "}
                <code>ais-pre</code>)
              </span>

              <div className="url-copy-box">
                <input
                  type="url"
                  aria-label="Target Android App URL"
                  className="url-input-field"
                  value={phoneUrl}
                  onChange={(e) => setPhoneUrl(e.target.value)}
                />
                <button
                  onClick={handleCopy}
                  className={copied ? "primary soft" : ""}
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy URL
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="install-steps-box warning-troubleshoot">
              <strong>
                <AlertTriangle size={13} /> SEEING &ldquo;403 DO NOT HAVE
                ACCESS&rdquo; ON YOUR PHONE?
              </strong>
              <ol>
                <li>
                  <strong>Enable Link Sharing in AI Studio:</strong> Click{" "}
                  <strong>Share</strong> (top-right bar of Google AI Studio) to
                  allow access, or click <strong>Publish</strong> to get a
                  public Cloud Run URL without a Google login wall.
                </li>
                <li>
                  <strong>Same Google Account:</strong> Ensure your mobile
                  browser is signed into Google with{" "}
                  <strong>isharapererabcrox@gmail.com</strong>.
                </li>
                <li>
                  <strong>Using Brave Browser?</strong> Tap the{" "}
                  <strong>Brave Lion icon</strong> in the address bar and turn{" "}
                  <strong>Shields OFF</strong> (Brave blocks the authentication
                  redirect between <code>aistudio.google.com</code> and{" "}
                  <code>run.app</code>), or open the link in{" "}
                  <strong>Google Chrome</strong>.
                </li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="install-tab-body">
            <div className="apk-package-card">
              <div className="apk-package-top">
                <span className="apk-icon-box">
                  <Sparkles size={19} />
                </span>
                <div>
                  <strong>CloudDroid-Android-Project.zip</strong>
                  <span>
                    Package: <code>com.clouddroid.workspace</code> · SDK 34 ·
                    Kotlin
                  </span>
                </div>
              </div>
              <p>
                Downloads a complete, ready-to-build Android Studio / Gradle
                project pre-configured with your CloudDroid URL (
                <code>{phoneUrl}</code>), full-screen dark status bar, WebRTC
                streaming permissions, and hardware back-button navigation.
              </p>
              <div className="apk-specs">
                <span>
                  <ShieldCheck size={13} /> CookieManager &amp; DOM storage
                  enabled
                </span>
                <span>
                  <Smartphone size={13} /> Pre-linked to Shared App URL
                </span>
              </div>
              <button
                className="install-cta-btn wide"
                onClick={handleDownloadApkProject}
              >
                {downloaded ? (
                  <>
                    <Check size={16} />
                    Downloaded CloudDroid-Android-Project.zip
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download Android APK Project (.zip)
                  </>
                )}
              </button>
            </div>

            <div className="install-steps-box">
              <strong>BUILD YOUR .APK IN 3 STEPS:</strong>
              <ol>
                <li>
                  Click <strong>Download Android APK Project (.zip)</strong>{" "}
                  above and extract the folder on your computer.
                </li>
                <li>
                  Open the folder in <strong>Android Studio</strong> (or run{" "}
                  <code>./build-apk.sh</code> / <code>build-apk.bat</code>).
                </li>
                <li>
                  Select{" "}
                  <strong>
                    Build &rarr; Build Bundle(s) / APK(s) &rarr; Build APK(s)
                  </strong>{" "}
                  to generate <code>app-debug.apk</code> for any Android device.
                </li>
              </ol>
            </div>
          </div>
        )}

        <div className="install-modal-footer">
          <button
            className="subtle"
            onClick={handleDownloadApkProject}
            title="Download Android Studio Gradle project (.zip)"
          >
            <Download size={14} />
            {downloaded ? "ZIP Downloaded" : "Download APK Project (.zip)"}
          </button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
