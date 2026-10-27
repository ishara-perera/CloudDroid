import React, { useState } from "react";
import { Trash2, X } from "lucide-react";
import { api, Profile } from "../api";
import { ConfirmModal } from "./Common";

export function ProfileModal({
  modal,
  profile,
  profiles,
  selected,
  busy,
  onClose,
  onSelect,
  onAction,
  run,
}: {
  modal: "create" | "edit";
  profile?: Profile;
  profiles: Profile[];
  selected: string;
  busy: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAction: (p: Profile, action: string) => Promise<void>;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (confirmDelete && profile) {
    return (
      <ConfirmModal
        title="Delete profile"
        message={`Permanently delete “${profile.name}”, its Android disk, inbox and notes? Your provider number will not be released.`}
        confirmLabel="Delete profile"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void run(async () => {
            await api(
              "/profiles/" + selected + "?confirm=" + selected,
              "DELETE",
            );
            onClose();
          });
        }}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
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
            onClick={onClose}
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
                const p = await api<Profile>("/profiles", "POST", {
                  name: data.get("name"),
                  clone_from: data.get("clone_from") || null,
                });
                onSelect(p.id);
              } else {
                await api("/profiles/" + selected, "PATCH", {
                  name: data.get("name"),
                  label: data.get("label"),
                  recovery: data.get("recovery"),
                });
              }
              onClose();
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
            {modal === "create" ? "Create independent profile" : "Save profile"}
          </button>
        </form>
        {modal === "edit" && profile && (
          <div className="modal-danger">
            <button
              onClick={() => {
                void onAction(
                  profile,
                  profile.archived ? "restore" : "archive",
                );
                onClose();
              }}
            >
              {profile.archived ? "Restore profile" : "Archive profile"}
            </button>
            <button className="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
              Delete profile
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
