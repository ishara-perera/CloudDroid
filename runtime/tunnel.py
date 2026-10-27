"""TCP-only transparent proxy + DNS-over-HTTPS. Runs as uid 1001, not root.

The firewall permits this process to reach ONLY the pinned proxy (or DoH server in
direct mode). There is deliberately no fallback, retry via a direct route, or UDP relay.
"""
import asyncio
import base64
import contextlib
import ipaddress
import json
import socket
import ssl
import struct
from pathlib import Path
from urllib.parse import unquote, urlsplit

import httpx
from dnslib import RCODE, DNSRecord


async def upstream(config, host, port):
    parsed = urlsplit(config["proxy_url"])
    secure = ssl.create_default_context() if parsed.scheme == "https" else None
    reader, writer = await asyncio.open_connection(config["proxy_ip"], parsed.port,
        ssl=secure, server_hostname=parsed.hostname if secure else None)
    try:
        username, password = unquote(parsed.username or ""), unquote(parsed.password or "")
        if parsed.scheme in ("http", "https"):
            auth = ""
            if parsed.username is not None:
                encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
                auth = f"Proxy-Authorization: Basic {encoded}\r\n"
            writer.write(f"CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n{auth}\r\n".encode())
            await writer.drain()
            response = await reader.readuntil(b"\r\n\r\n")
            if response.split(b" ", 2)[1] != b"200":
                raise ConnectionError("CONNECT rejected")
        else:
            writer.write(b"\x05\x01" + (b"\x02" if parsed.username is not None else b"\x00"))
            await writer.drain()
            answer = await reader.readexactly(2)
            expected = b"\x05\x02" if parsed.username is not None else b"\x05\x00"
            if answer != expected:
                raise ConnectionError("SOCKS method rejected")
            if parsed.username is not None:
                user, secret = username.encode(), password.encode()
                if len(user) > 255 or len(secret) > 255:
                    raise ValueError("SOCKS credentials too long")
                writer.write(b"\x01" + bytes([len(user)]) + user + bytes([len(secret)]) + secret)
                await writer.drain()
                if await reader.readexactly(2) != b"\x01\x00":
                    raise ConnectionError("SOCKS authentication rejected")
            writer.write(b"\x05\x01\x00\x01" + socket.inet_aton(host) + struct.pack("!H", port))
            await writer.drain()
            head = await reader.readexactly(4)
            if head[:2] != b"\x05\x00":
                raise ConnectionError("SOCKS connect rejected")
            size = {1: 4, 4: 16}.get(head[3])
            if head[3] == 3:
                size = (await reader.readexactly(1))[0]
            if size is None:
                raise ConnectionError("Invalid SOCKS address")
            await reader.readexactly(size + 2)
        return reader, writer
    except BaseException:
        writer.close()
        raise


async def copy_stream(reader, writer):
    while block := await reader.read(65536):
        writer.write(block)
        await writer.drain()


async def relay(client_reader, client_writer, config):
    remote_writer = None
    try:
        sock = client_writer.get_extra_info("socket")
        original = sock.getsockopt(socket.SOL_IP, 80, 16)  # Linux SO_ORIGINAL_DST
        port = struct.unpack("!H", original[2:4])[0]
        host = socket.inet_ntoa(original[4:8])
        if not ipaddress.ip_address(host).is_global:
            raise ConnectionError("Nonpublic destination denied")
        remote_reader, remote_writer = await asyncio.wait_for(upstream(config, host, port), 15)
        tasks = [asyncio.create_task(copy_stream(client_reader, remote_writer)),
                 asyncio.create_task(copy_stream(remote_reader, client_writer))]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED, timeout=180)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
    except (Exception, asyncio.CancelledError):
        pass  # Deliberately no URL, credentials, payload or DNS logging.
    finally:
        client_writer.close()
        if remote_writer:
            remote_writer.close()


class DNS(asyncio.DatagramProtocol):
    def __init__(self, client):
        self.client, self.transport = client, None
        self.tasks = set()

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        if len(self.tasks) < 128:
            task = asyncio.create_task(self.respond(data, addr))
            self.tasks.add(task)
            task.add_done_callback(self.tasks.discard)

    async def answer(self, data):
        try:
            query = DNSRecord.parse(data)
            # This platform has no IPv6 egress. Do not advertise AAAA routes.
            if any(q.qtype == 28 for q in query.questions):
                return query.reply().pack()
            response = await self.client.post("https://1.1.1.1/dns-query", content=data,
                headers={"Content-Type": "application/dns-message", "Accept": "application/dns-message"})
            response.raise_for_status()
            return response.content
        except Exception:
            with contextlib.suppress(Exception):
                reply = DNSRecord.parse(data).reply()
                reply.header.rcode = RCODE.SERVFAIL
                return reply.pack()
        return b""

    async def respond(self, data, addr):
        answer = await self.answer(data)
        if answer:
            self.transport.sendto(answer, addr)

    async def tcp(self, reader, writer):
        try:
            length = struct.unpack("!H", await reader.readexactly(2))[0]
            answer = await self.answer(await reader.readexactly(length))
            writer.write(struct.pack("!H", len(answer)) + answer)
            await writer.drain()
        except Exception:
            pass
        finally:
            writer.close()


async def main():
    config = json.loads(Path("/run/network.json").read_text())
    proxy = config["proxy_url"] if config["mode"] == "proxy" else None
    async with httpx.AsyncClient(proxy=proxy, timeout=10, trust_env=False, follow_redirects=False) as client:
        dns = DNS(client)
        await asyncio.get_running_loop().create_datagram_endpoint(lambda: dns, local_addr=("127.0.0.1", 53))
        dns_server = await asyncio.start_server(dns.tcp, "127.0.0.1", 53)
        tcp = await asyncio.start_server(lambda r, w: relay(r, w, config), "127.0.0.1", 9000)
        async with dns_server, tcp:
            await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
