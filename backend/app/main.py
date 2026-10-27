import asyncio
import contextlib
import json
import logging
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

import psutil
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete
from sqlalchemy import text as sql_text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse

from . import telephony
from .config import Settings
from .runtime import DockerRuntime, RuntimeUnavailable
from .schemas import (
    InputEvent,
    Login,
    NetworkConfig,
    Offer,
    PhoneAssignment,
    ProfileCreate,
    ProfileUpdate,
    ProviderConfig,
)
from .security import RateLimiter, authorized, digest
from .store import LoginSession, PhoneEvent, Profile, Secret, Store
from .streaming import Streams, ice_servers

logger = logging.getLogger("clouddroid")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


def create_app(settings=None, runtime=None):
    settings = settings or Settings.from_env()
    if settings.database_url.startswith("sqlite:///./data/"):
        Path("data").mkdir(exist_ok=True)
    store = Store(settings)
    runtime = runtime or DockerRuntime(settings)
    streams = Streams(runtime, settings)
    limits = RateLimiter()
    operations = asyncio.Lock()
    diagnostic_lock = asyncio.Lock()

    async def check_route(profile_id):
        async with diagnostic_lock:
            result = await runtime.diagnostics(profile_id)
            result["checked_at"] = time.time()
            with store.session.begin() as db:
                if db.get(Profile, profile_id):
                    secret_put(db, "diagnostics:" + profile_id, result)
            return result

    async def monitor_routes():
        while True:
            await asyncio.sleep(15)
            if not settings.runtime_enabled:
                continue
            with store.session() as db:
                items = db.query(Profile).filter_by(archived=False).all()
            for p in items:
                try:
                    with store.session() as db:
                        cached = db.get(Secret, "diagnostics:" + p.id)
                        checked = store.open(cached.value).get("checked_at", 0) if cached else 0
                    if time.time() - checked >= 60 and await runtime.status(p.id) == "running":
                        await check_route(p.id)
                except Exception:
                    logger.info(json.dumps({"event": "route_monitor_unavailable", "profile_id": p.id}))

    @asynccontextmanager
    async def lifespan(app):
        store.initialize()
        monitor = asyncio.create_task(monitor_routes())
        yield
        monitor.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await monitor
        await streams.close()
        store.engine.dispose()

    app = FastAPI(title="CloudDroid", version="0.1.0", lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings, app.state.store = settings, store
    app.state.runtime, app.state.streams = runtime, streams

    @app.middleware("http")
    async def security_headers(request, call_next):
        request_id = str(uuid.uuid4())
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > 200000:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
        # Also enforce actual bytes for chunked or falsely advertised bodies.
        if request.method in ("POST", "PATCH", "PUT", "DELETE"):
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 200000:
                    return JSONResponse({"detail": "Request too large"}, status_code=413)
            request._body = bytes(body)
        ip = request.client.host if request.client else "unknown"
        if request.url.path.startswith("/api/"):
            limit = 1200 if request.url.path.endswith("/input") else 180
            if not limits.allow((ip, "input" if limit == 1200 else "api"), limit):
                return JSONResponse({"detail": "Too many requests"}, status_code=429)
        response = await call_next(request)
        response.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer", "Permissions-Policy": "geolocation=(), camera=(), microphone=(self)",
            "Content-Security-Policy": "default-src 'self'; script-src 'self' https://media.twiliocdn.com https://sdk.twilio.com; "
                                       "style-src 'self'; img-src 'self' data:; "
                                       "connect-src 'self' https://*.twilio.com wss://*.twilio.com https://media.twiliocdn.com; "
                                       "media-src 'self' blob: mediastream: https://media.twiliocdn.com https://sdk.twilio.com; "
                                       "worker-src 'self' blob:; "
                                       "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            "X-Request-ID": request_id, "Cache-Control": "no-store"})
        if settings.cookie_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        logger.info(json.dumps({"request_id": request_id, "method": request.method, "status": response.status_code}))
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Pydantic's default includes rejected values, possibly passwords/provider secrets.
        return JSONResponse({"detail": [{"field": ".".join(map(str, e["loc"])), "message": e["msg"]}
                                         for e in exc.errors()]}, status_code=422)

    @app.exception_handler(RuntimeUnavailable)
    async def unavailable(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=503)

    @app.exception_handler(TimeoutError)
    async def timed_out(request, exc):
        return JSONResponse({"detail": "Operation timed out; check runtime or provider connectivity"}, status_code=504)

    def get_profile(db, profile_id):
        profile = db.get(Profile, profile_id)
        if not profile:
            raise HTTPException(404, "Profile not found")
        return profile

    def get_provider():
        with store.session() as db:
            secret = db.get(Secret, "twilio")
            if not secret:
                raise HTTPException(409, "Configure an authenticated Twilio account first")
            return store.open(secret.value)

    def secret_put(db, key, value):
        record = db.get(Secret, key)
        if record:
            record.value = store.seal(value)
        else:
            db.add(Secret(key=key, value=store.seal(value)))

    async def describe(profile):
        network = store.open(profile.network)
        private = store.open(profile.private)
        parsed = urlsplit(network.get("proxy_url", ""))
        status = await runtime.status(profile.id)
        return {"id": profile.id, "name": profile.name, "archived": profile.archived,
                "status": status, "label": private.get("label", ""), "recovery": private.get("recovery", ""),
                "account_status": "user_label_only" if private.get("label") else "not_connected",
                "phone": private.get("phone"), "phone_sid": profile.phone_sid,
                "network": {"mode": network["mode"], "endpoint": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}" if parsed.hostname else "",
                            "has_credentials": bool(parsed.username or parsed.password),
                            "fail_closed": network["mode"] == "proxy", "location": "not_verified"}}

    @app.get("/healthz")
    def health():
        try:
            with store.engine.connect() as db:
                db.execute(sql_text("SELECT 1"))
        except SQLAlchemyError:
            return JSONResponse({"status": "unavailable", "service": "control-plane"}, status_code=503)
        return {"status": "ok", "service": "control-plane"}

    @app.post("/api/auth/login")
    def login(data: Login, request: Request, response: Response):
        if request.headers.get("origin") != settings.public_url:
            raise HTTPException(403, "Origin not allowed")
        ip = request.client.host if request.client else "unknown"
        if not limits.allow((ip, "login"), 5, 300):
            raise HTTPException(429, "Too many sign-in attempts; wait five minutes")
        try:
            valid = PasswordHasher().verify(settings.password_hash, data.password)
        except VerificationError:
            valid = False
        if not valid or not secrets.compare_digest(data.username.encode(), settings.username.encode()):
            raise HTTPException(401, "Incorrect username or password")
        token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
        with store.session.begin() as db:
            db.execute(delete(LoginSession).where(LoginSession.expires < time.time()))
            db.add(LoginSession(token_hash=digest(token), csrf=csrf, expires=time.time() + settings.session_hours * 3600))
        response.set_cookie("cd_session", token, httponly=True, secure=settings.cookie_secure,
                            samesite="strict", max_age=settings.session_hours * 3600, path="/")
        return {"username": settings.username, "csrf": csrf}

    @app.get("/api/auth/me")
    def me(session=Depends(authorized)):
        return {"username": settings.username, "csrf": session.csrf}

    @app.post("/api/auth/logout")
    async def logout(response: Response, session=Depends(authorized)):
        async with operations:
            await streams.close(session_hash=session.token_hash)
            with store.session.begin() as db:
                db.execute(delete(LoginSession).where(LoginSession.token_hash == session.token_hash))
        response.delete_cookie("cd_session", path="/")
        return {"status": "signed_out"}

    @app.get("/api/profiles", dependencies=[Depends(authorized)])
    async def profiles():
        with store.session() as db:
            items = db.query(Profile).order_by(Profile.name).all()
        return await asyncio.gather(*(describe(p) for p in items))

    @app.post("/api/profiles", dependencies=[Depends(authorized)], status_code=201)
    async def create_profile(data: ProfileCreate):
        async with operations:
            with store.session.begin() as db:
                if db.query(Profile).count() >= settings.max_profiles:
                    raise HTTPException(409, "Profile limit reached")
                net = {"mode": "direct", "proxy_url": ""}
                if data.clone_from:
                    net = store.open(get_profile(db, data.clone_from).network)
                p = Profile(name=data.name, private=store.seal({"label": "", "recovery": ""}), network=store.seal(net))
                db.add(p)
                db.flush()
            return await describe(p)

    @app.patch("/api/profiles/{profile_id}", dependencies=[Depends(authorized)])
    async def update_profile(profile_id: str, data: ProfileUpdate):
        async with operations:
            with store.session.begin() as db:
                p = get_profile(db, profile_id)
                private = store.open(p.private)
                p.name = data.name.strip() or p.name
                private.update(label=data.label, recovery=data.recovery)
                p.private = store.seal(private)
            return await describe(p)

    @app.delete("/api/profiles/{profile_id}", dependencies=[Depends(authorized)])
    async def delete_profile(profile_id: str, confirm: str):
        if confirm != profile_id:
            raise HTTPException(400, "Confirm the exact profile ID")
        async with operations:
            with store.session() as db:
                get_profile(db, profile_id)
            await streams.close(profile_id=profile_id)
            await runtime.delete(profile_id)
            with store.session.begin() as db:
                db.execute(delete(PhoneEvent).where(PhoneEvent.profile_id == profile_id))
                for prefix in ("diagnostics:",):
                    db.execute(delete(Secret).where(Secret.key == prefix + profile_id))
                db.delete(get_profile(db, profile_id))
        return {"status": "deleted", "provider_number_released": False}

    @app.post("/api/profiles/{profile_id}/actions/{action}", dependencies=[Depends(authorized)])
    async def action(profile_id: str, action: str):
        if action not in ("start", "stop", "restart", "suspend", "archive", "restore"):
            raise HTTPException(404, "Unknown action")
        async with operations:
            with store.session() as db:
                p = get_profile(db, profile_id)
                network = store.open(p.network)
            if p.archived and action not in ("restore", "stop"):
                raise HTTPException(409, "Restore the archived profile first")
            if action in ("stop", "restart", "suspend", "archive"):
                await streams.close(profile_id=profile_id)
            if action == "suspend":
                await runtime.suspend(profile_id)
            elif action in ("stop", "restart", "archive"):
                if settings.runtime_enabled:
                    await runtime.stop(profile_id)
            if action in ("start", "restart"):
                await runtime.start(profile_id, network)
            if action in ("archive", "restore"):
                with store.session.begin() as db:
                    p = get_profile(db, profile_id)
                    p.archived = action == "archive"
            return await describe(p)

    @app.put("/api/profiles/{profile_id}/network", dependencies=[Depends(authorized)])
    async def network_save(profile_id: str, data: NetworkConfig):
        async with operations:
            with store.session() as db:
                get_profile(db, profile_id)
            if await runtime.status(profile_id) in ("starting", "running", "suspended"):
                raise HTTPException(409, "Stop Android before changing its network route")
            with store.session.begin() as db:
                p = get_profile(db, profile_id)
                if data.mode == "proxy" and not data.proxy_url:
                    # Empty password field preserves the encrypted existing URL.
                    old = store.open(p.network)
                    if not old.get("proxy_url"):
                        raise HTTPException(422, "Import a proxy URL first")
                    data.proxy_url = old["proxy_url"]
                p.network = store.seal(data.model_dump())
                db.execute(delete(Secret).where(Secret.key == "diagnostics:" + profile_id))
            return await describe(p)

    @app.post("/api/profiles/{profile_id}/diagnostics", dependencies=[Depends(authorized)])
    async def diagnostics(profile_id: str):
        with store.session() as db:
            get_profile(db, profile_id)
        return await check_route(profile_id)

    @app.get("/api/profiles/{profile_id}/diagnostics", dependencies=[Depends(authorized)])
    async def last_diagnostics(profile_id: str):
        with store.session() as db:
            get_profile(db, profile_id)
            item = db.get(Secret, "diagnostics:" + profile_id)
            result = store.open(item.value) if item else {"status": "not_checked"}
        result["stale"] = time.time() - result.get("checked_at", 0) > 120 or await runtime.status(profile_id) != "running"
        return result

    @app.post("/api/profiles/{profile_id}/input", dependencies=[Depends(authorized)])
    async def input_event(profile_id: str, data: InputEvent):
        with store.session() as db:
            p = get_profile(db, profile_id)
            if p.archived:
                raise HTTPException(409, "Profile is archived")
        await runtime.input(profile_id, data)
        return {"status": "command_sent"}

    @app.get("/api/stream/config", dependencies=[Depends(authorized)])
    def stream_config():
        return {"iceServers": ice_servers(settings), "fps": settings.stream_fps, "audio": False}

    @app.post("/api/profiles/{profile_id}/stream")
    async def stream(profile_id: str, data: Offer, session=Depends(authorized)):
        async with operations:
            with store.session() as db:
                current = db.get(LoginSession, session.token_hash)
                if not current or current.expires <= time.time():
                    raise HTTPException(401, "Session expired or revoked")
                get_profile(db, profile_id)
            if await runtime.status(profile_id) != "running":
                raise RuntimeUnavailable("Launch Android and wait for boot before connecting")
            try:
                return await streams.offer(profile_id, session, data)
            except (ValueError, AssertionError):
                raise HTTPException(422, "Invalid WebRTC offer") from None

    @app.delete("/api/profiles/{profile_id}/stream", dependencies=[Depends(authorized)])
    async def close_stream(profile_id: str):
        await streams.close(profile_id=profile_id)
        return {"status": "disconnected"}

    @app.get("/api/dashboard", dependencies=[Depends(authorized)])
    async def dashboard():
        with store.session() as db:
            items = db.query(Profile).all()
            provider = db.get(Secret, "twilio") is not None
        states = await asyncio.gather(*(runtime.status(p.id) for p in items))
        checked, us = 0, 0
        with store.session() as db:
            for p, state in zip(items, states, strict=True):
                cached = db.get(Secret, "diagnostics:" + p.id)
                result = store.open(cached.value) if cached else {}
                if state == "running" and time.time() - result.get("checked_at", 0) < 120 and result.get("status") == "verified":
                    checked += 1
                    us += result.get("is_us") is True
        memory = psutil.virtual_memory()
        return {"profiles": len(items), "active": sum(s in ("running", "starting", "suspended") for s in states),
                "runtime_configured": settings.runtime_enabled,
                "phone_configured": provider, "phone_status": "configured_not_checked" if provider else "not_configured",
                "network_status": "verified_at_last_check" if checked else "not_verified",
                "network_checked": checked, "network_us": us, "max_active": settings.max_active,
                "max_profiles": settings.max_profiles,
                "resources": {"scope": "API host", "cpu_percent": psutil.cpu_percent(),
                              "memory_used_gb": round(memory.used / 1024**3, 2),
                              "memory_total_gb": round(memory.total / 1024**3, 2)}}

    @app.get("/api/settings", dependencies=[Depends(authorized)])
    def get_settings():
        with store.session() as db:
            configured = db.get(Secret, "twilio") is not None
        return {"public_url": settings.public_url, "runtime_enabled": settings.runtime_enabled,
                "android_image": settings.android_image, "max_active": settings.max_active,
                "max_profiles": settings.max_profiles, "session_hours": settings.session_hours,
                "database": "PostgreSQL" if settings.database_url.startswith("postgres") else "SQLite",
                "provider_configured": configured, "turn_configured": bool(settings.turn_url and settings.turn_secret),
                "secrets": "encrypted at rest; values are never returned", "version": "0.1.0"}

    @app.put("/api/provider", dependencies=[Depends(authorized)])
    async def provider_save(data: ProviderConfig):
        try:
            result = await asyncio.to_thread(telephony.inventory, data.model_dump())
        except Exception:
            raise HTTPException(502, "Twilio authentication or inventory check failed; credentials were not saved") from None
        with store.session.begin() as db:
            old = db.get(Secret, "twilio")
            if old and store.open(old.value)["account_sid"] != data.account_sid and db.query(Profile).filter(Profile.phone_sid.is_not(None)).count():
                raise HTTPException(409, "Unassign all telephone numbers before changing the provider account")
            secret_put(db, "twilio", data.model_dump())
        return result

    @app.post("/api/provider/check", dependencies=[Depends(authorized)])
    async def provider_check():
        config = get_provider()
        try:
            return await asyncio.to_thread(telephony.inventory, config)
        except Exception:
            raise HTTPException(502, "Provider check failed; verify credentials and connectivity") from None

    @app.put("/api/profiles/{profile_id}/phone", dependencies=[Depends(authorized)])
    async def assign_phone(profile_id: str, data: PhoneAssignment):
        async with operations:
            with store.session() as db:
                p = get_profile(db, profile_id)
                if db.query(PhoneEvent).filter_by(profile_id=profile_id).count() and p.phone_sid != (data.sid or None):
                    raise HTTPException(409, "Delete phone history before reassigning a number")
                if data.sid and db.query(Profile).filter(Profile.phone_sid == data.sid, Profile.id != profile_id).first():
                    raise HTTPException(409, "Number is already assigned to another profile")
            info = None
            if data.sid:
                try:
                    info = await asyncio.to_thread(telephony.owned_number, get_provider(), data.sid)
                except HTTPException:
                    raise
                except Exception:
                    raise HTTPException(422, "Could not verify US ownership and inbound capabilities with the provider") from None
            with store.session.begin() as db:
                p = get_profile(db, profile_id)
                private = store.open(p.private)
                private["phone"] = info
                p.private, p.phone_sid = store.seal(private), data.sid or None
            return await describe(p)

    @app.get("/api/profiles/{profile_id}/phone/events", dependencies=[Depends(authorized)])
    def phone_events(profile_id: str):
        with store.session() as db:
            get_profile(db, profile_id)
            items = db.query(PhoneEvent).filter_by(profile_id=profile_id).order_by(PhoneEvent.received.desc()).limit(200).all()
            return [{"sid": e.sid, "kind": e.kind, "received": e.received, **store.open(e.private)} for e in items]

    @app.delete("/api/profiles/{profile_id}/phone/events", dependencies=[Depends(authorized)])
    def clear_phone_events(profile_id: str):
        with store.session.begin() as db:
            get_profile(db, profile_id)
            db.execute(delete(PhoneEvent).where(PhoneEvent.profile_id == profile_id))
        return {"status": "deleted"}

    @app.post("/api/profiles/{profile_id}/phone/token", dependencies=[Depends(authorized)])
    def phone_token(profile_id: str):
        with store.session() as db:
            p = get_profile(db, profile_id)
            phone = store.open(p.private).get("phone")
            if not phone or not phone["capabilities"].get("voice"):
                raise HTTPException(409, "Assign a verified voice-capable number first")
        try:
            return telephony.voice_token(get_provider(), profile_id)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from None

    @app.post("/hooks/twilio/{kind}")
    async def webhook(kind: str, request: Request):
        if kind not in ("sms", "voice", "call-status"):
            raise HTTPException(404)
        config = get_provider()
        form = await request.form()
        # FormData preserves duplicate values for Twilio's official validator.
        url = settings.public_url + request.url.path
        if request.url.query:
            url += "?" + request.url.query
        if not RequestValidator(config["auth_token"]).validate(url, form, request.headers.get("x-twilio-signature", "")):
            raise HTTPException(403, "Invalid webhook signature")
        if form.get("AccountSid") != config["account_sid"]:
            raise HTTPException(403, "Webhook account mismatch")
        sid = str(form.get("MessageSid" if kind == "sms" else "CallSid", ""))
        if len(sid) != 34 or sid[:2] not in (("SM", "MM") if kind == "sms" else ("CA",)):
            raise HTTPException(422, "Provider event SID required")
        twiml = VoiceResponse()
        async with operations:
            with store.session.begin() as db:
                p = next((p for p in db.query(Profile).filter(Profile.phone_sid.is_not(None)).all()
                          if (store.open(p.private).get("phone") or {}).get("number") == form.get("To")), None)
                if not p:
                    raise HTTPException(404, "No assigned profile for this destination")
                private = store.open(p.private)
                capabilities = private["phone"]["capabilities"]
                if not capabilities.get("sms" if kind == "sms" else "voice"):
                    raise HTTPException(409, "Assigned number lacks this capability")
                item = db.get(PhoneEvent, sid)
                if item and item.profile_id != p.id:
                    raise HTTPException(409, "Event belongs to another profile")
                if kind == "sms":
                    if not item:
                        db.add(PhoneEvent(sid=sid, profile_id=p.id, kind="sms", received=time.time(),
                                         private=store.seal({"from": str(form.get("From", "")),
                                                             "to": str(form.get("To", "")),
                                                             "body": str(form.get("Body", ""))[:10000],
                                                             "status": "received"})))
                elif kind == "call-status":
                    if not item:
                        raise HTTPException(404, "Unknown call")
                    current = store.open(item.private)
                    raw_sequence = str(form.get("SequenceNumber", ""))
                    sequence = int(raw_sequence) if raw_sequence.isdigit() else item.sequence + 1
                    status = str(form.get("DialCallStatus", form.get("CallStatus", "unknown")))
                    terminal = ("completed", "busy", "failed", "no-answer", "canceled")
                    if sequence > item.sequence and current.get("status") not in terminal:
                        current.update(status=status, duration=str(form.get("DialCallDuration", form.get("CallDuration", ""))))
                        item.private, item.sequence = store.seal(current), sequence
                else:
                    if not item:
                        db.add(PhoneEvent(sid=sid, profile_id=p.id, kind="call", received=time.time(),
                                         private=store.seal({"from": str(form.get("From", "")), "to": str(form.get("To", "")),
                                                             "status": str(form.get("CallStatus", "ringing"))})))
                    if p.archived:
                        twiml.reject(reason="busy")
                    else:
                        dial = twiml.dial(action=settings.public_url + "/hooks/twilio/call-status", method="POST", timeout=25)
                        dial.client("profile-" + p.id)
        return Response("<Response/>" if kind == "sms" else str(twiml), media_type="application/xml")

    @app.exception_handler(IntegrityError)
    async def conflict(request, exc):
        return JSONResponse({"detail": "Conflicting update; refresh and retry"}, status_code=409)

    frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if frontend.exists():
        app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")

        @app.get("/")
        def index():
            return FileResponse(frontend / "index.html")
    return app
