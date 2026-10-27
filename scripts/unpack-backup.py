"""Validate outer backup layout before extracting. Never extract links or paths outside destination."""
import re
import sys
import tarfile
from pathlib import Path, PurePosixPath


def unpack(archive, destination):
    allowed = re.compile(r"(?:database\.dump|clouddroid-[0-9a-f-]{36}-data\.tgz)")
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        for member in members:
            path = PurePosixPath(member.name)
            if member.name in (".", "./") and member.isdir():
                continue
            if path.is_absolute() or ".." in path.parts or len(path.parts) != 1 or not member.isfile() or not allowed.fullmatch(path.name):
                raise ValueError("Unexpected backup archive member")
        tar.extractall(Path(destination).resolve(), members=members, filter="data")


if __name__ == "__main__":
    unpack(sys.argv[1], sys.argv[2])
