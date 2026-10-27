import React from "react";
import { Check, Download } from "lucide-react";

export function PWAInstallButton({
  isInstallable,
  isInstalled,
  onInstallClick,
}: {
  isInstallable: boolean;
  isInstalled: boolean;
  onInstallClick: () => void;
}) {
  return (
    <button
      className={
        "header-install-btn " + (isInstalled ? "installed" : "active-install")
      }
      onClick={onInstallClick}
      title={
        isInstalled
          ? "CloudDroid is installed — view Android APK options"
          : isInstallable
            ? "Install CloudDroid directly to your device"
            : "Install CloudDroid as an Android mobile app"
      }
    >
      {isInstalled ? (
        <>
          <Check size={14} />
          <span>Installed</span>
        </>
      ) : (
        <>
          <Download size={14} />
          <span>Install</span>
        </>
      )}
    </button>
  );
}
