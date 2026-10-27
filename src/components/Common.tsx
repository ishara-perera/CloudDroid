import React from "react";
import { Cloud, X } from "lucide-react";

export const stamp = (seconds: number): string =>
  new Date(seconds * 1000).toLocaleString();

export function Status({ value }: { value: string }) {
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

export function Empty({
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

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onCancel}
          >
            <X size={19} />
          </button>
        </div>
        <p>{message}</p>
        <div className="modal-danger">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
