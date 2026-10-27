import time

import pytest
from app.schemas import NetworkConfig
from app.store import LoginSession, Profile


def test_auth_required(client):
    for path in ("/api/profiles", "/api/dashboard", "/api/settings", "/api/stream/config"):
        assert client.get(path).status_code == 401
    assert client.get("/healthz").json()["status"] == "ok"


def test_login_origin_and_password(client):
    assert client.post("/api/auth/login", json={"username": "admin", "password": "bad"}).status_code == 403
    assert client.post("/api/auth/login", headers={"Origin": "http://localhost:8000"},
                       json={"username": "admin", "password": "bad"}).status_code == 401


def test_login_throttled(client):
    for _ in range(5):
        assert client.post("/api/auth/login", headers={"Origin": "http://localhost:8000"},
                           json={"username": "admin", "password": "bad"}).status_code == 401
    assert client.post("/api/auth/login", headers={"Origin": "http://localhost:8000"},
                       json={"username": "admin", "password": "bad"}).status_code == 429


def test_csrf_and_cross_origin(signed):
    assert signed.post("/api/profiles", headers={"X-CSRF-Token": "bad"}, json={"name": "Unsafe"}).status_code == 403
    assert signed.post("/api/profiles", headers={"Origin": "https://untrusted.example"}, json={"name": "Unsafe"}).status_code == 403


def test_logout_revokes(signed):
    token = signed.cookies.get("cd_session")
    assert signed.post("/api/auth/logout").status_code == 200
    signed.cookies.set("cd_session", token)
    assert signed.get("/api/auth/me").status_code == 401


def test_expired_sessions_rejected(signed, app):
    with app.state.store.session.begin() as db:
        session = db.query(LoginSession).first()
        session.expires = time.time() - 1
    assert signed.get("/api/profiles").status_code == 401


def test_three_real_profiles_and_unavailable_runtime(signed):
    profiles = signed.get("/api/profiles").json()
    assert len(profiles) == 3
    assert len({p["id"] for p in profiles}) == 3
    assert all(p["status"] == "unavailable" and p["account_status"] == "not_connected" for p in profiles)
    result = signed.post(f"/api/profiles/{profiles[0]['id']}/actions/start")
    assert result.status_code == 503
    assert "/dev/kvm" in result.json()["detail"]


def test_profile_metadata_is_encrypted_and_independent(signed, app, profile):
    result = signed.patch(f"/api/profiles/{profile['id']}", json={"name": "Edited", "label": "private-label", "recovery": "private-recovery"})
    assert result.status_code == 200
    assert result.json()["account_status"] == "user_label_only"
    others = [p for p in signed.get("/api/profiles").json() if p["id"] != profile["id"]]
    assert all(not p["label"] and not p["recovery"] for p in others)
    with app.state.store.session() as db:
        raw = db.get(Profile, profile["id"]).private
        assert "private-label" not in raw and "private-recovery" not in raw
        assert app.state.store.open(raw)["recovery"] == "private-recovery"


def test_clone_only_network(signed, profile):
    signed.patch(f"/api/profiles/{profile['id']}", json={"name": "Original", "label": "account", "recovery": "private"})
    network = {"mode": "proxy", "proxy_url": "socks5://alice:secret@8.8.8.8:1080"}
    assert signed.put(f"/api/profiles/{profile['id']}/network", json=network).status_code == 200
    clone = signed.post("/api/profiles", json={"name": "Cloned", "clone_from": profile["id"]}).json()
    assert clone["id"] != profile["id"]
    assert clone["network"]["mode"] == "proxy"
    assert clone["label"] == clone["recovery"] == ""
    assert clone["phone"] is None and clone["phone_sid"] is None


def test_proxy_credentials_never_returned(signed, profile, app):
    result = signed.put(f"/api/profiles/{profile['id']}/network", json={"mode": "proxy", "proxy_url": "https://alice:supersecret@8.8.8.8:443"})
    assert result.status_code == 200
    assert "supersecret" not in result.text and "alice" not in result.text
    assert result.json()["network"]["has_credentials"]
    with app.state.store.session() as db:
        assert "supersecret" not in db.get(Profile, profile["id"]).network
    assert signed.put(f"/api/profiles/{profile['id']}/network", json={"mode": "proxy", "proxy_url": ""}).status_code == 200


@pytest.mark.parametrize("url", ["http://127.0.0.1:80", "socks5://10.0.0.1:1080", "http://169.254.169.254:80", "ftp://8.8.8.8:80", "https://8.8.8.8", "http://8.8.8.8:80/path", "http://8.8.8.8:80\r\nX: bad"])
def test_proxy_validation(url):
    with pytest.raises(ValueError):
        NetworkConfig(mode="proxy", proxy_url=url)


def test_no_proxy_without_endpoint(signed, profile):
    assert signed.put(f"/api/profiles/{profile['id']}/network", json={"mode": "proxy"}).status_code == 422


def test_diagnostics_are_not_fabricated(signed, profile):
    path = f"/api/profiles/{profile['id']}/diagnostics"
    assert signed.get(path).json() == {"status": "not_checked", "stale": True}
    assert signed.post(path).status_code == 503


def test_archive_restore_and_delete(signed, profile):
    base = f"/api/profiles/{profile['id']}"
    assert signed.post(base + "/actions/archive").json()["archived"]
    assert signed.post(base + "/actions/start").status_code == 409
    assert not signed.post(base + "/actions/restore").json()["archived"]
    assert signed.delete(base + "?confirm=wrong").status_code == 400
    assert signed.delete(base + "?confirm=" + profile["id"]).status_code == 200
    assert len(signed.get("/api/profiles").json()) == 2


def test_profile_limit(signed, app):
    app.state.settings.max_profiles = 3
    assert signed.post("/api/profiles", json={"name": "Fourth"}).status_code == 409


def test_invalid_body_redacts_credentials(signed):
    result = signed.put("/api/provider", json={"account_sid": "super-secret-invalid", "auth_token": "private-token"})
    assert result.status_code == 422
    assert "super-secret-invalid" not in result.text and "private-token" not in result.text


def test_security_headers(signed):
    response = signed.get("/api/settings")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert "password_hash" not in response.text and "encryption_key" not in response.text


def test_body_size_limit(signed):
    response = signed.post("/api/profiles", content=b"x" * 200001)
    assert response.status_code == 413
