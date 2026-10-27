"""Real Docker/ADB adapter. An unavailable host never returns a fake session."""
import asyncio
import ipaddress
import json
import shutil
import socket
import uuid
from urllib.parse import urlsplit


class RuntimeUnavailable(Exception):
    pass


def profile_name(profile_id):
    return "clouddroid-" + str(uuid.UUID(profile_id))


async def public_proxy_address(url):
    parsed = urlsplit(url)
    if not parsed.hostname or not parsed.port:
        raise RuntimeUnavailable("A proxy endpoint is required")
    loop = asyncio.get_running_loop()
    try:
        answers = await loop.getaddrinfo(parsed.hostname, parsed.port, family=socket.AF_INET,
                                         type=socket.SOCK_STREAM)
    except OSError:
        raise RuntimeUnavailable("Proxy hostname could not be resolved") from None
    ips = sorted({answer[4][0] for answer in answers})
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise RuntimeUnavailable("Proxy must resolve only to public IPv4 addresses")
    return ips[0]


class DockerRuntime:
    def __init__(self, settings):
        self.settings = settings
        self.lock = asyncio.Lock()

    async def command(self, *args, timeout=30, stdin=None):
        if not self.settings.runtime_enabled or not shutil.which("docker"):
            raise RuntimeUnavailable("Android requires a configured Linux Docker host with /dev/kvm")
        proc = await asyncio.create_subprocess_exec(
            "docker", *args, stdin=asyncio.subprocess.PIPE if stdin else None,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            out, _ = await asyncio.wait_for(proc.communicate(stdin), timeout)
        except (TimeoutError, asyncio.CancelledError):
            proc.kill()
            await proc.communicate()
            raise
        if proc.returncode:
            # Docker errors can contain environment/credentials. Never propagate stderr.
            raise RuntimeUnavailable("Docker operation failed; check host, image, KVM and resource limits")
        return out

    async def status(self, profile_id):
        if not self.settings.runtime_enabled or not shutil.which("docker"):
            return "unavailable"
        try:
            found = await self.command("ps", "--all", "--filter", "name=^/" + profile_name(profile_id) + "$",
                                       "--format", "{{.ID}}")
            if not found.strip():
                return "stopped"
            out = await self.command("inspect", "--format", "{{json .State}}", profile_name(profile_id))
            state = json.loads(out)
            if state.get("Paused"):
                return "suspended"
            if not state.get("Running"):
                return "stopped"
            # Process running is not proof that Android has completed booting.
            booted = await self.adb(profile_id, "shell", "getprop", "sys.boot_completed", timeout=4)
            return "running" if booted.strip() == b"1" else "starting"
        except RuntimeUnavailable:
            return "unavailable"
        except TimeoutError:
            return "starting"

    async def active_count(self):
        out = await self.command("ps", "-q", "--filter", "label=clouddroid.managed=true")
        return len(out.decode().split())

    async def start(self, profile_id, network):
        async with self.lock:
            state = await self.status(profile_id)
            if state in ("running", "starting"):
                return state
            if state == "suspended":
                await self.command("unpause", profile_name(profile_id))
                return "starting"
            if await self.active_count() >= self.settings.max_active:
                raise RuntimeUnavailable("Active session limit reached; stop the other profile first")
            pinned = await public_proxy_address(network["proxy_url"]) if network["mode"] == "proxy" else ""
            # Recreate config with a newly resolved endpoint; retain only this profile's disk.
            await self.remove_container(profile_id)
            name = profile_name(profile_id)
            await self.command("volume", "create", name + "-data")
            args = ["create", "--name", name, "--label", "clouddroid.managed=true",
                    "--device", "/dev/kvm", "--cap-add", "NET_ADMIN",
                    "--sysctl", "net.ipv6.conf.all.disable_ipv6=1",
                    "--sysctl", "net.ipv4.ip_unprivileged_port_start=0",
                    "--memory", "4g", "--cpus", "2", "--pids-limit", "512",
                    "--security-opt", "no-new-privileges", "--dns", "127.0.0.1",
                    "--mount", f"type=volume,source={name}-data,target=/data",
                    "--tmpfs", "/run:rw,nosuid,size=16m", self.settings.android_image]
            await self.command(*args)
            config = json.dumps({**network, "proxy_ip": pinned}).encode()
            # Credentials go through stdin into tmpfs, never Docker environment or CLI args.
            # Container must run before tmpfs exists, so entrypoint waits for configuration.
            await self.command("start", name)
            await self.command("exec", "-i", name, "python3", "-c",
                               "import os,sys; p='/run/network.json'; "
                               "f=os.open(p,os.O_WRONLY|os.O_CREAT,0o600); "
                               "os.write(f,sys.stdin.buffer.read()); os.close(f)", stdin=config)
            return "starting"

    async def stop(self, profile_id):
        state = await self.status(profile_id)
        if state == "suspended":
            await self.command("unpause", profile_name(profile_id))
        if state in ("running", "starting", "suspended"):
            await self.command("stop", "--time", "30", profile_name(profile_id), timeout=40)

    async def suspend(self, profile_id):
        if await self.status(profile_id) != "running":
            raise RuntimeUnavailable("Only a running Android session can be suspended")
        await self.command("pause", profile_name(profile_id))

    async def remove_container(self, profile_id):
        try:
            await self.command("inspect", profile_name(profile_id))
        except RuntimeUnavailable:
            return
        await self.command("rm", "--force", profile_name(profile_id))

    async def delete(self, profile_id):
        if not self.settings.runtime_enabled:
            return
        async with self.lock:
            await self.stop(profile_id)
            await self.remove_container(profile_id)
            # An absent volume is fine; other failures must not silently orphan private data.
            volumes = (await self.command("volume", "ls", "--format", "{{.Name}}")).decode().splitlines()
            name = profile_name(profile_id) + "-data"
            if name in volumes:
                await self.command("volume", "rm", name)

    async def adb(self, profile_id, *args, timeout=15):
        return await self.command("exec", "--user", "1000:1000", profile_name(profile_id),
                                  "adb", "-s", "emulator-5554", *args, timeout=timeout)

    async def input(self, profile_id, event):
        if await self.status(profile_id) != "running":
            raise RuntimeUnavailable("Android is not ready")
        kind = event.kind
        if kind == "tap":
            args = ["input", "tap", str(event.x), str(event.y)]
        elif kind == "swipe":
            args = ["input", "swipe", str(event.x), str(event.y), str(event.x2), str(event.y2), str(event.duration)]
        elif kind == "key":
            args = ["input", "keyevent", "KEYCODE_" + event.key]
        elif kind == "text":
            # adb shell internally interprets a shell command. Quote the complete argument.
            import shlex
            if any(ord(c) < 32 or ord(c) > 126 for c in event.text):
                raise RuntimeUnavailable("This Android input adapter supports printable ASCII only")
            args = ["input", "text", shlex.quote(event.text.replace(" ", "%s"))]
        elif kind == "location":
            args = ["cmd", "location", "set-location-enabled", "true" if event.enabled else "false"]
        else:
            url = "https://accounts.google.com/signup" if kind == "google" else "https://www.dnsleaktest.com/"
            args = ["am", "start", "-a", "android.intent.action.VIEW", "-d", url]
        await self.adb(profile_id, "shell", *args)

    async def diagnostics(self, profile_id):
        if await self.status(profile_id) != "running":
            raise RuntimeUnavailable("Launch Android before checking its actual network route")
        out = await self.command("exec", "--user", "1000:1000", profile_name(profile_id),
                                  "python3", "/opt/clouddroid/diagnostics.py", timeout=45)
        return json.loads(out)
