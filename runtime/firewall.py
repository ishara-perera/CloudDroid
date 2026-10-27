"""Install a persistent namespace firewall before starting any emulator process."""
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

DENIED = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
          "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15",
          "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"]


def rules(config):
    result = []
    mode = config["mode"]
    if mode == "proxy":
        import ipaddress
        ip = config["proxy_ip"]
        if not ipaddress.ip_address(ip).is_global:
            raise ValueError("Nonpublic proxy endpoint")
        port = str(urlsplit(config["proxy_url"]).port)
        result.append(["-A", "OUTPUT", "-m", "owner", "--uid-owner", "1001", "-p", "tcp", "-d", ip, "--dport", port, "-j", "ACCEPT"])
        for net in DENIED:
            if net != "127.0.0.0/8":
                result.append(["-t", "nat", "-A", "OUTPUT", "-m", "owner", "--uid-owner", "1000", "-d", net, "-j", "RETURN"])
        result.append(["-t", "nat", "-A", "OUTPUT", "-m", "owner", "--uid-owner", "1000", "-p", "tcp", "!", "-d", "127.0.0.0/8", "-j", "REDIRECT", "--to-ports", "9000"])
    elif mode == "direct":
        # DNS connector can reach only Cloudflare DoH. Guest traffic gets public destinations only.
        result.append(["-A", "OUTPUT", "-m", "owner", "--uid-owner", "1001", "-p", "tcp", "-d", "1.1.1.1", "--dport", "443", "-j", "ACCEPT"])
        for net in DENIED:
            result.append(["-A", "OUTPUT", "-m", "owner", "--uid-owner", "1000", "-d", net, "-j", "REJECT"])
        for protocol in ("tcp", "udp"):
            # No cleartext DNS bypass; /etc/resolv.conf points to loopback DoH stub.
            result.append(["-A", "OUTPUT", "-m", "owner", "--uid-owner", "1000", "-p", protocol, "--dport", "53", "-j", "REJECT"])
            result.append(["-A", "OUTPUT", "-m", "owner", "--uid-owner", "1000", "-p", protocol, "-j", "ACCEPT"])
    else:
        raise ValueError("Unknown network mode")
    return result


if __name__ == "__main__":
    config = json.loads(Path("/run/network.json").read_text())
    for command in rules(config):
        subprocess.run(["iptables", *command], check=True, capture_output=True)
    if config["mode"] == "proxy":
        host = urlsplit(config["proxy_url"]).hostname
        # Pin hostname for HTTPS certificate SNI and DoH client without recursive DNS.
        with open("/etc/hosts", "a") as hosts:
            hosts.write(f"\n{config['proxy_ip']} {host}\n")
    Path("/run/mode").write_text(config["mode"])
    Path("/run/mode").chmod(0o444)
