import hashlib
import secrets
import time
from collections import OrderedDict, deque

from fastapi import HTTPException, Request

from .store import LoginSession


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class RateLimiter:
    """Bounded single-process limiter. Deploy exactly one API worker."""
    def __init__(self):
        self.buckets = OrderedDict()

    def allow(self, key, limit, seconds=60):
        now = time.monotonic()
        bucket = self.buckets.setdefault(key, deque())
        self.buckets.move_to_end(key)
        while bucket and bucket[0] <= now - seconds:
            bucket.popleft()
        if len(self.buckets) > 10000:
            self.buckets.popitem(last=False)
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def authorized(request: Request):
    app = request.app
    token = request.cookies.get("cd_session", "")
    with app.state.store.session() as db:
        session = db.get(LoginSession, digest(token)) if token else None
        if not session or session.expires <= time.time():
            raise HTTPException(401, "Sign in to continue")
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("origin") != app.state.settings.public_url:
                raise HTTPException(403, "Origin not allowed")
            if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), session.csrf):
                raise HTTPException(403, "CSRF token required")
        return session
