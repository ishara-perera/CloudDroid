import pytest
from app.config import Settings
from app.main import create_app
from argon2 import PasswordHasher
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

TEST_PASSWORD = "testing-only-long-password"
ORIGIN = "http://localhost:8000"


@pytest.fixture
def config(tmp_path):
    return Settings(database_url="sqlite:///" + (tmp_path / "test.db").as_posix(),
                    encryption_key=Fernet.generate_key().decode(),
                    password_hash=PasswordHasher().hash(TEST_PASSWORD))


@pytest.fixture
def app(config):
    return create_app(config)


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def signed(client):
    result = client.post("/api/auth/login", headers={"Origin": ORIGIN},
                         json={"username": "admin", "password": TEST_PASSWORD})
    assert result.status_code == 200
    client.headers.update({"Origin": ORIGIN, "X-CSRF-Token": result.json()["csrf"]})
    return client


@pytest.fixture
def profile(signed):
    return signed.get("/api/profiles").json()[0]
