import asyncio
import importlib.util
import socket
from pathlib import Path

import pytest
from app.runtime import DockerRuntime, RuntimeUnavailable, profile_name, public_proxy_address


def test_profile_path_rejects_command_injection():
    with pytest.raises(ValueError):
        profile_name("../../other;rm -rf")


def test_firewall_no_proxy_fallback():
    file = Path(__file__).resolve().parents[2] / "runtime" / "firewall.py"
    spec = importlib.util.spec_from_file_location("firewall", file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    commands = module.rules({"mode": "proxy", "proxy_url": "https://8.8.8.8:443", "proxy_ip": "8.8.8.8"})
    accepts = [rule for rule in commands if rule[-1] == "ACCEPT"]
    assert len(accepts) == 1
    assert accepts[0][accepts[0].index("--uid-owner") + 1] == "1001"
    assert "8.8.8.8" in accepts[0] and "443" in accepts[0]
    assert any("REDIRECT" in rule and "9000" in rule for rule in commands)
    # The guest never gets a direct accept rule, including when the connector exits.
    assert not any("1000" in rule for rule in accepts)


async def test_dns_rebinding_to_private_address_rejected(monkeypatch):
    async def answers(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 80))]
    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", answers)
    with pytest.raises(RuntimeUnavailable, match="public IPv4"):
        await public_proxy_address("http://proxy.example:80")


async def test_runtime_disabled_never_fabricates_session(config):
    runtime = DockerRuntime(config)
    assert await runtime.status("00000000-0000-0000-0000-000000000001") == "unavailable"
    with pytest.raises(RuntimeUnavailable):
        await runtime.command("ps")


async def test_adb_input_escapes_shell_metacharacters(config, monkeypatch):
    runtime = DockerRuntime(config)
    calls = []

    async def ready(pid):
        return "running"

    async def record(*args, **kwargs):
        calls.append(args)
        return b""

    monkeypatch.setattr(runtime, "status", ready)
    monkeypatch.setattr(runtime, "adb", record)
    from app.schemas import InputEvent
    await runtime.input("00000000-0000-0000-0000-000000000001", InputEvent(kind="text", text="hello;$(id)"))
    assert calls[0][-1] == "'hello;$(id)'"


async def test_network_change_rejected_for_running_profile(config):
    from app.main import create_app
    from fastapi.testclient import TestClient

    class ExplicitTestRuntime:
        async def status(self, pid):
            return "running"

    app = create_app(config, ExplicitTestRuntime())
    with TestClient(app) as client:
        login = client.post("/api/auth/login", headers={"Origin": config.public_url},
                            json={"username": "admin", "password": "testing-only-long-password"})
        client.headers.update({"Origin": config.public_url, "X-CSRF-Token": login.json()["csrf"]})
        pid = client.get("/api/profiles").json()[0]["id"]
        assert client.put(f"/api/profiles/{pid}/network", json={"mode": "direct"}).status_code == 409
