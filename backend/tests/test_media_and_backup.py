import asyncio
import importlib.util
import io
import tarfile
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from aiortc import RTCPeerConnection, RTCSessionDescription
from app.streaming import Streams
from PIL import Image


async def test_real_webrtc_encodes_adb_fixture_frame_and_revokes(config):
    """Real local WebRTC peers; image fixture explicitly replaces Android capture."""
    encoded = io.BytesIO()
    Image.new("RGB", (64, 96), "purple").save(encoded, format="PNG")

    class CaptureFixture:
        async def adb(self, *args):
            assert args[1:] == ("exec-out", "screencap", "-p")
            return encoded.getvalue()

    bridge = Streams(CaptureFixture(), config)
    browser = RTCPeerConnection()
    received = asyncio.get_running_loop().create_future()

    @browser.on("track")
    def track(track):
        received.set_result(track)

    try:
        browser.addTransceiver("video", direction="recvonly")
        await browser.setLocalDescription(await browser.createOffer())
        answer = await bridge.offer("profile-fixture", SimpleNamespace(token_hash="session-fixture", expires=time.time() + 60),
                                    browser.localDescription)
        await browser.setRemoteDescription(RTCSessionDescription(sdp=answer["sdp"], type=answer["type"]))
        track = await asyncio.wait_for(received, 8)
        frame = await asyncio.wait_for(track.recv(), 8)
        assert (frame.width, frame.height) == (64, 96)
        await bridge.close(session_hash="session-fixture")
        assert not bridge.peers
    finally:
        await bridge.close()
        await browser.close()


def backup_module():
    file = Path(__file__).resolve().parents[2] / "scripts" / "unpack-backup.py"
    spec = importlib.util.spec_from_file_location("unpack_backup", file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_backup_archive_rejects_traversal(tmp_path):
    archive = tmp_path / "bad.tar"
    with tarfile.open(archive, "w") as tar:
        item = tarfile.TarInfo("../../database.dump")
        item.size = 3
        tar.addfile(item, io.BytesIO(b"bad"))
    with pytest.raises(ValueError, match="Unexpected"):
        backup_module().unpack(archive, tmp_path)


def test_backup_archive_extracts_expected_layout(tmp_path):
    archive = tmp_path / "good.tar"
    with tarfile.open(archive, "w") as tar:
        item = tarfile.TarInfo("./database.dump")
        item.size = 4
        tar.addfile(item, io.BytesIO(b"data"))
    destination = tmp_path / "restore"
    destination.mkdir()
    backup_module().unpack(archive, destination)
    assert (destination / "database.dump").read_bytes() == b"data"
