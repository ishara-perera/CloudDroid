import asyncio
import base64
import hashlib
import hmac
import io
import time
from fractions import Fraction

from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from av import VideoFrame
from PIL import Image


def ice_servers(settings):
    if not settings.turn_url or not settings.turn_secret:
        return []
    username = f"{int(time.time()) + 600}:clouddroid"
    credential = base64.b64encode(hmac.new(settings.turn_secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
    return [{"urls": settings.turn_url, "username": username, "credential": credential}]


class AndroidTrack(VideoStreamTrack):
    def __init__(self, runtime, profile_id, fps):
        super().__init__()
        self.runtime = runtime
        self.profile_id = profile_id
        self.fps = fps
        self.started = time.monotonic()
        self.previous = 0

    async def recv(self):
        await asyncio.sleep(max(0, 1 / self.fps - (time.monotonic() - self.previous)))
        self.previous = time.monotonic()
        png = await self.runtime.adb(self.profile_id, "exec-out", "screencap", "-p")
        frame = VideoFrame.from_image(Image.open(io.BytesIO(png)).convert("RGB"))
        frame.pts = int((time.monotonic() - self.started) * 90000)
        frame.time_base = Fraction(1, 90000)
        return frame


class Streams:
    def __init__(self, runtime, settings):
        self.runtime, self.settings = runtime, settings
        self.peers = {}  # pc -> (profile ID, session hash, timer)

    async def close(self, profile_id=None, session_hash=None):
        for peer, (pid, sid, timer) in list(self.peers.items()):
            if (profile_id is None or pid == profile_id) and (session_hash is None or sid == session_hash):
                timer.cancel()
                await peer.close()
                self.peers.pop(peer, None)

    async def offer(self, profile_id, session, offer):
        # Bound memory/CPU, prevent a single admin tab spawning unlimited encoders.
        await self.close(profile_id=profile_id)
        servers = [RTCIceServer(**server) for server in ice_servers(self.settings)]
        pc = RTCPeerConnection(RTCConfiguration(iceServers=servers))

        async def expire():
            await asyncio.sleep(max(0, min(600, session.expires - time.time())))
            await pc.close()
            self.peers.pop(pc, None)

        timer = asyncio.create_task(expire())
        self.peers[pc] = (profile_id, session.token_hash, timer)

        @pc.on("connectionstatechange")
        async def changed():
            if pc.connectionState in ("failed", "closed", "disconnected"):
                timer.cancel()
                self.peers.pop(pc, None)
                await pc.close()

        try:
            pc.addTrack(AndroidTrack(self.runtime, profile_id, self.settings.stream_fps))
            await pc.setRemoteDescription(RTCSessionDescription(sdp=offer.sdp, type=offer.type))
            await pc.setLocalDescription(await pc.createAnswer())
            return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type, "expires_in": 600}
        except Exception:
            timer.cancel()
            self.peers.pop(pc, None)
            await pc.close()
            raise
