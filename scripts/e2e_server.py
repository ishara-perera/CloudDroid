"""Isolated real API for browser tests. Explicit test-only credentials and database."""
import sys
import tempfile
from pathlib import Path

import uvicorn
from argon2 import PasswordHasher
from cryptography.fernet import Fernet

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="clouddroid-e2e-") as folder:
        settings = Settings(database_url="sqlite:///" + (Path(folder) / "browser.db").as_posix(),
                            encryption_key=Fernet.generate_key().decode(),
                            password_hash=PasswordHasher().hash("testing-only-password"),
                            public_url="http://127.0.0.1:8011")
        uvicorn.run(create_app(settings), host="127.0.0.1", port=8011, access_log=False)
