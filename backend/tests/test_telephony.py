import base64
import json

import pytest
from app import telephony
from app.store import Profile, Secret
from twilio.request_validator import RequestValidator

ACCOUNT = "AC" + "a" * 32
AUTH = "test-auth-token-" + "z" * 32
NUMBER_SID = "PN" + "b" * 32
NUMBER = "+12025550123"


@pytest.fixture
def connected(signed, app, profile):
    config = {"account_sid": ACCOUNT, "auth_token": AUTH, "api_key": "SK" + "e" * 32,
              "api_secret": "testing-secret-" + "s" * 32, "twiml_app_sid": "AP" + "f" * 32}
    with app.state.store.session.begin() as db:
        db.add(Secret(key="twilio", value=app.state.store.seal(config)))
        p = db.get(Profile, profile["id"])
        private = app.state.store.open(p.private)
        private["phone"] = {"number": NUMBER, "sid": NUMBER_SID, "capabilities": {"sms": True, "voice": True}}
        p.private, p.phone_sid = app.state.store.seal(private), NUMBER_SID
    return signed, config


def hook(client, kind, data, valid=True):
    url = "http://localhost:8000/hooks/twilio/" + kind
    signature = RequestValidator(AUTH).compute_signature(url, data) if valid else "forged"
    return client.post("/hooks/twilio/" + kind, data=data, headers={"X-Twilio-Signature": signature})


def test_forged_webhook_rejected(connected):
    client, _ = connected
    assert hook(client, "sms", {"AccountSid": ACCOUNT, "To": NUMBER}, valid=False).status_code == 403


def test_signed_sms_correct_inbox_encrypted_idempotent(connected, app, profile):
    client, _ = connected
    data = {"AccountSid": ACCOUNT, "MessageSid": "SM" + "1" * 32, "From": "+12025550000", "To": NUMBER, "Body": "private verification payload"}
    assert hook(client, "sms", data).status_code == 200
    assert hook(client, "sms", data).status_code == 200
    inbox = client.get(f"/api/profiles/{profile['id']}/phone/events").json()
    assert len(inbox) == 1 and inbox[0]["body"] == data["Body"]
    other = next(p for p in client.get("/api/profiles").json() if p["id"] != profile["id"])
    assert client.get(f"/api/profiles/{other['id']}/phone/events").json() == []
    with app.state.store.engine.connect() as db:
        rows = db.exec_driver_sql("select private from phone_events").all()
        assert all("private verification payload" not in row[0] for row in rows)


def test_webhook_payload_tamper_rejected(connected):
    client, _ = connected
    original = {"AccountSid": ACCOUNT, "MessageSid": "SM" + "2" * 32, "To": NUMBER, "Body": "original"}
    signature = RequestValidator(AUTH).compute_signature("http://localhost:8000/hooks/twilio/sms", original)
    assert client.post("/hooks/twilio/sms", data={**original, "Body": "tampered"}, headers={"X-Twilio-Signature": signature}).status_code == 403


def test_wrong_account_rejected(connected):
    client, _ = connected
    assert hook(client, "sms", {"AccountSid": "AC" + "c" * 32, "To": NUMBER, "MessageSid": "SM" + "3" * 32}).status_code == 403


def test_unassigned_number_rejected(connected):
    client, _ = connected
    assert hook(client, "sms", {"AccountSid": ACCOUNT, "To": "+12025559999", "MessageSid": "SM" + "3" * 32}).status_code == 404


def test_voice_routes_correct_profile_and_status_is_monotonic(connected, profile):
    client, _ = connected
    data = {"AccountSid": ACCOUNT, "CallSid": "CA" + "4" * 32, "To": NUMBER, "From": "+12025550000", "CallStatus": "ringing"}
    result = hook(client, "voice", data)
    assert result.status_code == 200
    assert "<Client>profile-" + profile["id"] + "</Client>" in result.text
    assert hook(client, "call-status", {**data, "CallStatus": "completed", "SequenceNumber": "3", "CallDuration": "17"}).status_code == 200
    hook(client, "call-status", {**data, "CallStatus": "ringing", "SequenceNumber": "1"})
    events = client.get(f"/api/profiles/{profile['id']}/phone/events").json()
    assert events[0]["status"] == "completed" and events[0]["duration"] == "17"


def test_token_is_receive_only(connected, profile):
    client, _ = connected
    result = client.post(f"/api/profiles/{profile['id']}/phone/token")
    assert result.status_code == 200
    payload = result.json()["token"].split(".")[1]
    decoded = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    assert decoded["grants"]["voice"]["incoming"]["allow"] is True
    assert "outgoing" not in decoded["grants"]["voice"]


def test_unconfigured_provider_is_explicit(signed):
    assert signed.post("/api/provider/check").status_code == 409


def test_failed_provider_credentials_not_saved(signed, app, monkeypatch):
    def fail(config):
        raise RuntimeError("sensitive provider details")
    monkeypatch.setattr(telephony, "inventory", fail)
    result = signed.put("/api/provider", json={"account_sid": ACCOUNT, "auth_token": AUTH})
    assert result.status_code == 502 and "sensitive provider details" not in result.text
    with app.state.store.session() as db:
        assert db.get(Secret, "twilio") is None


def test_number_cannot_be_shared(connected, profile):
    client, _ = connected
    other = next(p for p in client.get("/api/profiles").json() if p["id"] != profile["id"])
    result = client.put(f"/api/profiles/{other['id']}/phone", json={"sid": NUMBER_SID})
    assert result.status_code == 409
