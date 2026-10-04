import asyncio
import math
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request

from db import connect, current_band, ensure_default_band, ensure_schema
from rules import DEFAULT_INNER_DEG, DEFAULT_OUTER_DEG, judge

SECRET = os.environ.get("JWT_SECRET", "yaw-align-dev-secret")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = {
    "technician": {
        "role": "writer",
        "password_hash": pwd.hash("tech123456"),
    },
    "observer": {
        "role": "reader",
        "password_hash": pwd.hash("obs123456"),
    },
}

app = Quart(__name__)


def _run_db(fn, *args, **kwargs):
    return fn(*args, **kwargs)


async def run_db(fn, *args, **kwargs):
    return await asyncio.to_thread(_run_db, fn, *args, **kwargs)


def seed_if_empty(conn):
    ensure_schema(conn)
    ensure_default_band(conn, DEFAULT_INNER_DEG, DEFAULT_OUTER_DEG)
    count = conn.execute("SELECT COUNT(*) AS n FROM yaw_logs").fetchone()["n"]
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    samples = [
        ("W01", 0.4, "合格"),
        ("W07", 3.2, "偏航超差"),
    ]
    for code, err, expected_verdict in samples:
        verdict, reason = judge(err, DEFAULT_INNER_DEG, DEFAULT_OUTER_DEG)
        assert verdict == expected_verdict
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, status, verdict, reason,
                band_inner_deg, band_outer_deg,
                created_by, created_at, processed_at)
               VALUES (%s, %s, 'done', %s, %s, %s, %s, %s, %s, %s)""",
            (
                code,
                err,
                verdict,
                reason,
                DEFAULT_INNER_DEG,
                DEFAULT_OUTER_DEG,
                "technician",
                now,
                now,
            ),
        )


@app.before_serving
async def startup():
    def init():
        with connect() as conn:
            seed_if_empty(conn)
            conn.commit()

    await run_db(init)


def parse_bearer():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


async def current_user():
    token = parse_bearer()
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except JWTError:
        return None
    sub = payload.get("sub")
    if sub not in USERS:
        return None
    return {"username": sub, "role": payload.get("role")}


def require_login(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        return await handler(user, *args, **kwargs)

    return wrapper


def require_writer(handler=None, *, forbidden="仅现场技师可提交偏航记录"):
    """写权限装饰器：@require_writer 或 @require_writer(forbidden="...") 两种用法。"""

    def deco(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            user = await current_user()
            if user is None:
                return jsonify({"detail": "未登录"}), 401
            if user["role"] != "writer":
                return jsonify({"detail": forbidden}), 403
            return await fn(user, *args, **kwargs)

        return wrapper

    return deco(handler) if handler is not None else deco


@app.get("/api/health")
async def health():
    return jsonify({"status": "ok", "service": "yaw-align-log"})


@app.post("/api/auth/login")
async def login():
    body = await request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    user = USERS.get(username)
    if not user or not pwd.verify(password, user["password_hash"]):
        return jsonify({"detail": "用户名或密码错误"}), 401
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode(
        {"sub": username, "role": user["role"], "exp": exp},
        SECRET,
        algorithm="HS256",
    )
    return jsonify(
        {
            "access_token": token,
            "username": username,
            "role": user["role"],
        }
    )


@app.get("/api/logs")
@require_login
async def list_logs(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, turbine_code, yaw_err_deg, status, verdict, reason,
                          band_inner_deg, band_outer_deg,
                          created_by, created_at, processed_at
                   FROM yaw_logs ORDER BY id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/logs")
@require_writer
async def create_log(user):
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    try:
        yaw_err_deg = float(body.get("yaw_err_deg"))
    except (TypeError, ValueError):
        return jsonify({"detail": "偏航误差必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            row = conn.execute(
                """INSERT INTO yaw_logs
                   (turbine_code, yaw_err_deg, status, verdict, reason,
                    created_by, created_at)
                   VALUES (%s, %s, 'pending', NULL, NULL, %s, %s)
                   RETURNING id, turbine_code, yaw_err_deg, status, verdict, reason,
                             band_inner_deg, band_outer_deg,
                             created_by, created_at, processed_at""",
                (turbine_code, yaw_err_deg, user["username"], now),
            ).fetchone()
            conn.commit()
            return row

    row = await run_db(insert)
    return jsonify(row), 201


def _band_payload(conn):
    band = current_band(conn)
    history = conn.execute(
        """SELECT id, inner_deg, outer_deg, changed_by, changed_at
           FROM band_settings ORDER BY id DESC"""
    ).fetchall()
    return {"current": band, "history": history}


@app.get("/api/band")
@require_login
async def get_band(user):
    def query():
        with connect() as conn:
            return _band_payload(conn)

    return jsonify(await run_db(query))


@app.put("/api/band")
@require_writer(forbidden="观察账号只读，不可改带")
async def update_band(user):
    body = await request.get_json(force=True, silent=True) or {}
    try:
        inner_deg = float(body.get("inner_deg"))
        outer_deg = float(body.get("outer_deg"))
    except (TypeError, ValueError):
        return jsonify({"detail": "内界、外界必须是数字"}), 400
    if not (math.isfinite(inner_deg) and math.isfinite(outer_deg)):
        return jsonify({"detail": "内界、外界必须是有限数字"}), 400
    if inner_deg <= 0:
        return jsonify({"detail": "内界必须大于 0"}), 400
    if outer_deg <= inner_deg:
        return jsonify({"detail": "外界必须大于内界"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            conn.execute(
                """INSERT INTO band_settings (inner_deg, outer_deg, changed_by, changed_at)
                   VALUES (%s, %s, %s, %s)""",
                (inner_deg, outer_deg, user["username"], now),
            )
            payload = _band_payload(conn)
            conn.commit()
            return payload

    # 改带仅作用于之后被认领的新单；已被领记录仍按领时快照判定
    return jsonify(await run_db(insert))
