import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass
class Settings:
    database_url: str
    encryption_key: str
    password_hash: str
    public_url: str = "http://localhost:8000"
    username: str = "admin"
    cookie_secure: bool = False
    runtime_enabled: bool = False
    android_image: str = "clouddroid-android:local"
    max_active: int = 1
    max_profiles: int = 12
    session_hours: int = 8
    stream_fps: int = 5
    turn_url: str = ""
    turn_secret: str = ""

    @classmethod
    def from_env(cls):
        load_dotenv(Path(__file__).resolve().parents[2] / ".env")
        key = os.getenv("ENCRYPTION_KEY", "")
        password_hash = os.getenv("ADMIN_PASSWORD_HASH", "")
        if not key or not password_hash or "GENERATE" in key + password_hash:
            raise RuntimeError("Run python scripts/bootstrap.py before starting CloudDroid")
        public = os.getenv("PUBLIC_URL", "http://localhost:8000").rstrip("/")
        secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
        if not public.startswith(("http://localhost:", "http://127.0.0.1:", "https://")):
            raise RuntimeError("Remote deployments require an HTTPS PUBLIC_URL")
        if public.startswith("https://") and not secure:
            raise RuntimeError("HTTPS deployments require COOKIE_SECURE=true")
        return cls(
            database_url=os.getenv("DATABASE_URL", "sqlite:///./data/clouddroid.db"),
            encryption_key=key, password_hash=password_hash,
            public_url=public, username=os.getenv("ADMIN_USERNAME", "admin"),
            cookie_secure=secure,
            runtime_enabled=os.getenv("RUNTIME_ENABLED", "false").lower() == "true",
            android_image=os.getenv("ANDROID_IMAGE", "clouddroid-android:local"),
            max_active=max(1, int(os.getenv("MAX_ACTIVE_SESSIONS", "1"))),
            max_profiles=max(3, int(os.getenv("MAX_PROFILES", "12"))),
            session_hours=max(1, min(24, int(os.getenv("SESSION_HOURS", "8")))),
            stream_fps=max(1, min(10, int(os.getenv("STREAM_FPS", "5")))),
            turn_url=os.getenv("TURN_URL", ""), turn_secret=os.getenv("TURN_SECRET", ""),
        )
