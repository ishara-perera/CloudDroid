"""Package source/docs with an allowlist, excluding all runtime data and real secrets."""
import zipfile
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = ["backend", "frontend", "runtime", "scripts", "deploy", "docs", ".github"]
ROOT_FILES = [".env.example", ".gitignore", ".dockerignore", "README.md", "compose.yaml", "pyproject.toml"]
EXCLUDED = {"__pycache__", "node_modules", "dist", "test-results", "playwright-report", ".pytest_cache"}


def main():
    files = [ROOT / name for name in ROOT_FILES]
    for folder in FOLDERS:
        files.extend(p for p in (ROOT / folder).rglob("*") if p.is_file()
                     and not any(part in EXCLUDED for part in p.relative_to(ROOT).parts)
                     and not p.name.endswith((".pyc", ".tsbuildinfo")))
    config = dotenv_values(ROOT / ".env") if (ROOT / ".env").exists() else {}
    private = [config.get(key, "") for key in ("ENCRYPTION_KEY", "ADMIN_PASSWORD_HASH", "POSTGRES_PASSWORD")]
    initial = ROOT / "data" / "initial-admin-password.txt"
    if initial.exists():
        private.append(initial.read_text().strip())
    for file in files:
        body = file.read_bytes()
        if any(secret and secret.encode() in body for secret in private):
            raise RuntimeError("A private value was detected in a candidate source file; archive not written")
    destination = ROOT / "dist"
    destination.mkdir(exist_ok=True)
    archive = destination / "CloudDroid-source.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        for file in sorted(set(files)):
            output.write(file, "CloudDroid/" + file.relative_to(ROOT).as_posix())
    print(f"Packaged {len(set(files))} source/document files. Runtime data and real secrets excluded.")


if __name__ == "__main__":
    main()
