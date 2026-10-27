import asyncio

import pytest
from dnslib import RCODE, DNSRecord

from runtime.tunnel import DNS, upstream


async def test_http_connect_authentication_and_bidirectional_data():
    seen = []

    async def proxy(reader, writer):
        try:
            seen.append(await reader.readuntil(b"\r\n\r\n"))
            writer.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
            await writer.drain()
            writer.write(await reader.readexactly(4))
            await writer.drain()
        finally:
            writer.close()

    server = await asyncio.start_server(proxy, "127.0.0.1", 0)
    async with server:
        port = server.sockets[0].getsockname()[1]
        config = {"proxy_ip": "127.0.0.1", "proxy_url": f"http://alice:secret@localhost:{port}"}
        reader, writer = await upstream(config, "8.8.8.8", 443)
        try:
            writer.write(b"ping")
            await writer.drain()
            assert await asyncio.wait_for(reader.readexactly(4), 2) == b"ping"
            assert b"CONNECT 8.8.8.8:443 HTTP/1.1" in seen[0]
            assert b"Proxy-Authorization: Basic YWxpY2U6c2VjcmV0" in seen[0]
        finally:
            writer.close()
            await writer.wait_closed()


async def test_socks_authentication_failure_does_not_fallback():
    connections = []

    async def proxy(reader, writer):
        connections.append(True)
        try:
            assert await reader.readexactly(3) == b"\x05\x01\x02"
            writer.write(b"\x05\x02")
            await writer.drain()
            assert await reader.readexactly(1) == b"\x01"
            size = (await reader.readexactly(1))[0]
            await reader.readexactly(size)
            size = (await reader.readexactly(1))[0]
            await reader.readexactly(size)
            writer.write(b"\x01\x01")
            await writer.drain()
        finally:
            writer.close()

    server = await asyncio.start_server(proxy, "127.0.0.1", 0)
    async with server:
        port = server.sockets[0].getsockname()[1]
        config = {"proxy_ip": "127.0.0.1", "proxy_url": f"socks5://alice:wrong@localhost:{port}"}
        with pytest.raises(ConnectionError, match="authentication rejected"):
            await upstream(config, "8.8.8.8", 443)
    assert len(connections) == 1


async def test_dns_upstream_outage_returns_servfail_without_host_fallback():
    class FailedDoH:
        async def post(self, *args, **kwargs):
            raise ConnectionError("explicit test DoH outage")

    query = DNSRecord.question("example.com", "A")
    response = await DNS(FailedDoH()).answer(query.pack())
    assert DNSRecord.parse(response).header.rcode == RCODE.SERVFAIL


async def test_ipv6_queries_have_no_advertised_route():
    class NoExternalRequest:
        async def post(self, *args, **kwargs):
            raise AssertionError("AAAA should not be sent upstream")

    response = await DNS(NoExternalRequest()).answer(DNSRecord.question("example.com", "AAAA").pack())
    result = DNSRecord.parse(response)
    assert result.header.rcode == 0 and not result.rr
