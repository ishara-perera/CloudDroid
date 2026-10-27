"""Executed as emulator uid 1000, so diagnostics traverse the same firewall."""
import json
import socket
import time
from pathlib import Path

import httpx


def main():
    started = time.monotonic()
    result = {"status": "blocked_or_unavailable", "ip": None, "country": None, "is_us": None,
              "dns": {"policy": "DoH via configured egress; external TCP/UDP 53 and IPv6 blocked",
                      "resolver_attribution": "not_independently_verified",
                      "full_leak_test": "pending_external_authoritative_test"},
              "mode": Path("/run/mode").read_text().strip()}
    try:
        socket.getaddrinfo("api.ipify.org", 443, family=socket.AF_INET)
        result["dns"]["resolution"] = "working"
        with httpx.Client(timeout=12, trust_env=False) as client:
            first = client.get("https://api.ipify.org?format=json")
            first.raise_for_status()
            result["ip"] = first.json()["ip"]
            # Independent IP observer plus geolocation source. A database can disagree with a service.
            second = client.get("https://ipwho.is/")
            second.raise_for_status()
            geo = second.json()
            if geo.get("success") and geo.get("ip") == result["ip"]:
                result.update(status="verified", country=geo.get("country_code"),
                              is_us=geo.get("country_code") == "US", city=geo.get("city"),
                              observers=["api.ipify.org", "ipwho.is"])
            else:
                result["status"] = "ip_observers_disagree_or_geo_unavailable"
    except Exception:
        pass
    result["latency_ms"] = round((time.monotonic() - started) * 1000)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
