import ipaddress
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator


class Login(BaseModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=1024)


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    clone_from: str | None = None

    @field_validator("name")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    label: str = Field(default="", max_length=120)
    recovery: str = Field(default="", max_length=2000)


class NetworkConfig(BaseModel):
    mode: Literal["direct", "proxy"] = "direct"
    proxy_url: str = Field(default="", max_length=2048)

    @field_validator("proxy_url")
    @classmethod
    def valid_proxy(cls, value):
        if not value:
            return value
        try:
            parsed = urlsplit(value)
            if parsed.scheme not in ("http", "https", "socks5") or not parsed.hostname or not parsed.port:
                raise ValueError()
            if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
                raise ValueError()
            if any(c in value for c in "\r\n\x00"):
                raise ValueError()
            # Validate numeric endpoints now; hostname results are checked before launch.
            try:
                address = ipaddress.ip_address(parsed.hostname)
            except ValueError:
                address = None
            if address and (address.version != 4 or not address.is_global):
                raise ValueError()
        except ValueError:
            raise ValueError("Use a public IPv4 HTTP/HTTPS/SOCKS5 endpoint with an explicit port") from None
        return value


class InputEvent(BaseModel):
    kind: Literal["tap", "swipe", "key", "text", "google", "dns-test", "location"]
    x: int = Field(default=0, ge=0, le=719)
    y: int = Field(default=0, ge=0, le=1279)
    x2: int = Field(default=0, ge=0, le=719)
    y2: int = Field(default=0, ge=0, le=1279)
    duration: int = Field(default=250, ge=80, le=1500)
    key: Literal["HOME", "BACK", "APP_SWITCH", "ENTER", "DEL", "POWER", "VOLUME_UP", "VOLUME_DOWN"] = "HOME"
    text: str = Field(default="", max_length=1000)
    enabled: bool = False


class Offer(BaseModel):
    sdp: str = Field(min_length=1, max_length=100000)
    type: Literal["offer"]


class ProviderConfig(BaseModel):
    account_sid: str = Field(pattern=r"^AC[0-9a-fA-F]{32}$")
    auth_token: str = Field(min_length=20, max_length=128)
    api_key: str = Field(default="", pattern=r"^(SK[0-9a-fA-F]{32})?$")
    api_secret: str = Field(default="", max_length=128)
    twiml_app_sid: str = Field(default="", pattern=r"^(AP[0-9a-fA-F]{32})?$")


class PhoneAssignment(BaseModel):
    sid: str = Field(default="", pattern=r"^(PN[0-9a-fA-F]{32})?$")
