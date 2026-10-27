"""Create local secrets without displaying them or overwriting an existing setup."""
import argparse
import getpass
import os
import secrets
import subprocess
from pathlib import Path

from argon2 import PasswordHasher
from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parents[1]


def restrict(path):
    path.chmod(0o600 if path.is_file() else 0o700)
    if os.name == "nt":
        account = subprocess.check_output(["whoami"], text=True).strip()
        subprocess.run(["icacls", str(path), "/inheritance:r", "/grant:r", account + ":F"],
                       check=True, capture_output=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate-password", action="store_true")
    args = parser.parse_args()
    env_file = ROOT / ".env"
    if env_file.exists():
        print("Existing .env preserved. Use the administrator runbook to rotate secrets.")
        return
    password = secrets.token_urlsafe(24) if args.generate_password else getpass.getpass("Choose administrator password (12+ characters): ")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters")
    template = (ROOT / ".env.example").read_text()
    template = template.replace("ADMIN_PASSWORD_HASH=GENERATE_WITH_BOOTSTRAP", "ADMIN_PASSWORD_HASH='" + PasswordHasher().hash(password) + "'")
    template = template.replace("ENCRYPTION_KEY=GENERATE_WITH_BOOTSTRAP", "ENCRYPTION_KEY=" + Fernet.generate_key().decode())
    template = template.replace("POSTGRES_PASSWORD=GENERATE_WITH_BOOTSTRAP", "POSTGRES_PASSWORD=" + secrets.token_hex(32))
    env_file.write_text(template, encoding="utf-8")
    restrict(env_file)
    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    restrict(data)
    if args.generate_password:
        password_file = data / "initial-admin-password.txt"
        password_file.write_text(password + "\n", encoding="utf-8")
        restrict(password_file)
        print("Generated password saved to data/initial-admin-password.txt. Store securely, then delete that file.")
    print("Created .env. Runtime is disabled until a Linux KVM host is configured.")


if __name__ == "__main__":
    main()
