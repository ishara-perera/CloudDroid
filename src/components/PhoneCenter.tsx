import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  Info,
  MessageSquare,
  Phone,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api, Profile } from "../api";
import { PhoneEventItem, ProviderInventory } from "../types";
import { ConfirmModal, Empty, stamp, Status } from "./Common";

export function PhoneCenter({
  profile,
  run,
}: {
  profile?: Profile;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [events, setEvents] = useState<PhoneEventItem[]>([]);
  const [inventory, setInventory] = useState<ProviderInventory | null>(null);
  const [number, setNumber] = useState("");
  const [voiceState, setVoiceState] = useState("offline");
  const [incoming, setIncoming] = useState<any>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const device = useRef<any>(null);
  const call = useRef<any>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    setEvents([]);
    setIncoming(null);
    setNumber(profile?.phone_sid || "");
    setVoiceState("offline");
    const load = () => {
      if (profile) {
        void api<PhoneEventItem[]>("/profiles/" + profile.id + "/phone/events")
          .then((e) => {
            if (alive) setEvents(e);
          })
          .catch(() => {});
      }
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      mounted.current = false;
      alive = false;
      clearInterval(timer);
      call.current?.disconnect?.();
      device.current?.destroy?.();
      device.current = null;
      call.current = null;
    };
  }, [profile?.id, profile?.phone_sid]);

  return (
    <>
      <div className="two-col">
        <section className="panel">
          <div className="panel-heading">
            <h3>Profile telephone number</h3>
            <Phone size={18} />
          </div>
          <div className="phone-number">
            {profile?.phone?.number || "No number assigned"}
          </div>
          <p className="muted">
            Assign a US number you already own in your connected Twilio account.
          </p>
          <div className="inline">
            <button
              onClick={() =>
                void run(async () =>
                  setInventory(
                    await api<ProviderInventory>("/provider/check", "POST"),
                  ),
                )
              }
            >
              <RefreshCw size={15} /> Check provider & numbers
            </button>
            {inventory && <Status value={inventory.status} />}
          </div>
          {inventory && (
            <>
              <p className="tiny muted">
                {inventory.trial
                  ? "Trial account: provider restrictions apply."
                  : "Paid account: rental and usage charges apply."}{" "}
                Inventory limited to the first 200 owned numbers.
              </p>
              <label>
                Owned number
                <select
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                >
                  <option value="">Unassign number</option>
                  {inventory.numbers.map((n) => (
                    <option key={n.sid} value={n.sid}>
                      {n.number} · SMS {n.capabilities.sms ? "✓" : "—"} · Voice{" "}
                      {n.capabilities.voice ? "✓" : "—"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={!profile}
                onClick={() =>
                  void run(() =>
                    api("/profiles/" + profile?.id + "/phone", "PUT", {
                      sid: number,
                    }),
                  )
                }
              >
                Verify ownership & assign
              </button>
            </>
          )}
          <div className="small-note">
            <Info size={16} />
            <span>
              Google verification eligibility: unknown. A voice or SMS
              capability does not establish acceptance by Google.
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>Incoming voice</h3>
            <Status value={voiceState} />
          </div>
          <p className="muted">
            Enable the browser receiver to take calls for this profile. Keep
            this page open and allow microphone access.
          </p>
          <div className="inline">
            <button
              className="primary"
              disabled={
                !profile?.phone?.capabilities.voice || voiceState !== "offline"
              }
              onClick={() =>
                void run(async () => {
                  const { Device } = await import("@twilio/voice-sdk");
                  const token = await api(
                    "/profiles/" + profile?.id + "/phone/token",
                    "POST",
                  );
                  if (!mounted.current) return;
                  const d = new Device(token.token, { tokenRefreshMs: 60000 });
                  device.current = d;
                  d.on("registered", () => setVoiceState("listening"));
                  d.on("unregistered", () => setVoiceState("offline"));
                  d.on("error", () => setVoiceState("offline"));
                  d.on("tokenWillExpire", () => {
                    void api(
                      "/profiles/" + profile?.id + "/phone/token",
                      "POST",
                    )
                      .then((t) => d.updateToken(t.token))
                      .catch(() => {
                        d.destroy();
                        setVoiceState("offline");
                      });
                  });
                  d.on("incoming", (c: any) => {
                    call.current = c;
                    setIncoming(c);
                    setVoiceState("ringing");
                    const ended = () => {
                      setIncoming(null);
                      call.current = null;
                      setVoiceState("listening");
                    };
                    c.on("disconnect", ended);
                    c.on("cancel", ended);
                    c.on("reject", ended);
                  });
                  await d.register();
                  if (!mounted.current) d.destroy();
                })
              }
            >
              <Phone size={15} /> Enable receiver
            </button>
            <button
              onClick={() => {
                call.current?.disconnect?.();
                device.current?.destroy?.();
                setIncoming(null);
                setVoiceState("offline");
              }}
            >
              Turn off
            </button>
          </div>
          {incoming && (
            <div className="incoming">
              <strong>Incoming call: {incoming.parameters?.From}</strong>
              <div className="inline">
                <button
                  className="primary"
                  onClick={() => {
                    incoming.accept();
                    setVoiceState("in_call");
                  }}
                >
                  Answer
                </button>
                <button
                  onClick={() => {
                    if (voiceState === "in_call") incoming.disconnect();
                    else incoming.reject();
                  }}
                >
                  End / decline
                </button>
              </div>
            </div>
          )}
          <p className="tiny muted">
            Browser audio uses Twilio's supported Voice SDK. Android browsers
            may require a user gesture; background calls are not guaranteed.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Private inbox & call history</h3>
            <p className="muted tiny">
              {profile?.name || "Select a profile"} · latest 200 events ·
              refreshes every 8 seconds
            </p>
          </div>
          <button
            className="danger subtle"
            disabled={!profile}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 size={15} />
            Clear history
          </button>
        </div>
        {events.length === 0 ? (
          <Empty icon={MessageSquare} title="Your inbox is clear">
            Messages and calls appear here after your provider delivers an
            authenticated webhook.
          </Empty>
        ) : (
          <div className="events">
            {events.map((e) => (
              <article className="event" key={e.sid}>
                <div className="event-icon">
                  {e.kind === "sms" ? (
                    <MessageSquare size={19} />
                  ) : (
                    <ArrowDownLeft size={19} />
                  )}
                </div>
                <div>
                  <strong>{e.from}</strong>
                  <small>
                    {stamp(e.received)} · {e.status}
                    {e.duration ? ` · ${e.duration}s` : ""}
                  </small>
                  {e.body && <p className="sms-body">{e.body}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {confirmClear && (
        <ConfirmModal
          title="Clear phone history"
          message="Permanently delete this profile’s SMS and call history?"
          confirmLabel="Clear history"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            void run(async () => {
              await api("/profiles/" + profile?.id + "/phone/events", "DELETE");
              setEvents([]);
            });
          }}
        />
      )}
    </>
  );
}
