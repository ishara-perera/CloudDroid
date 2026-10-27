import json
import uuid

from cryptography.fernet import Fernet
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def new_id():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    private: Mapped[str] = mapped_column(Text)
    network: Mapped[str] = mapped_column(Text)
    phone_sid: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)


class LoginSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    csrf: Mapped[str] = mapped_column(String(80))
    expires: Mapped[float] = mapped_column(Float)


class Secret(Base):
    __tablename__ = "secrets"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class PhoneEvent(Base):
    __tablename__ = "phone_events"
    sid: Mapped[str] = mapped_column(String(40), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    received: Mapped[float] = mapped_column(Float)
    private: Mapped[str] = mapped_column(Text)
    sequence: Mapped[int] = mapped_column(Integer, default=-1)


class Store:
    def __init__(self, settings):
        args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
        self.engine = create_engine(settings.database_url, connect_args=args, pool_pre_ping=True)
        self.session = sessionmaker(self.engine, expire_on_commit=False)
        self.cipher = Fernet(settings.encryption_key.encode())

    def seal(self, obj):
        return self.cipher.encrypt(json.dumps(obj).encode()).decode()

    def open(self, value):
        return json.loads(self.cipher.decrypt(value.encode()))

    def initialize(self):
        Base.metadata.create_all(self.engine)
        with self.session.begin() as db:
            if db.get(Secret, "initialized") is None:
                if db.query(Profile).count() == 0:
                    for name in ("Personal", "Work", "Research"):
                        db.add(Profile(name=name, private=self.seal({"label": "", "recovery": ""}),
                                       network=self.seal({"mode": "direct", "proxy_url": ""})))
                db.add(Secret(key="initialized", value=self.seal({"schema": 1})))
