import asyncio
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request

from db import (
    connect,
    current_band,
    ensure_schema,
    insert_band,
    list_bands,
)
from rules import judge, validate_band

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


# 列表/详情统一返回的单据列（含领单时快照的琥珀界）。
LOG_COLUMNS = """id, turbine_code, yaw_err_deg, status, verdict, reason,
                 near_threshold, band_id, inner_threshold_deg,
                 outer_threshold_deg, created_by, created_at, processed_at"""


def seed_if_empty(conn):
    ensure_schema(conn)
    count = conn.execute("SELECT COUNT(*) AS n FROM yaw_logs").fetchone()["n"]
    if count > 0:
        return
    band = current_band(conn)
    now = datetime.now(timezone.utc)
    # (机组, 误差, 期望结论, 期望近阈)
    samples = [
        ("W01", 0.4, "合格", False),
        ("W04", -1.6, "合格", True),
        ("W07", 3.2, "偏航超差", False),
    ]
    for code, err, expected_verdict, expected_near in samples:
        verdict, near, reason = judge(
            err, band["inner_deg"], band["outer_deg"]
        )
        assert verdict == expected_verdict and near == expected_near
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, status, verdict, reason,
                near_threshold, band_id, inner_threshold_deg,
                outer_threshold_deg, created_by, created_at, processed_at)
               VALUES (%s, %s, 'done', %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                code, err, verdict, reason, near,
                band["id"], band["inner_deg"], band["outer_deg"],
                "technician", now, now,
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


def require_writer(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        if user["role"] != "writer":
            return jsonify({"detail": "仅现场技师可修改琥珀带或提交记录"}), 403
        return await handler(user, *args, **kwargs)

    return wrapper


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
                f"SELECT {LOG_COLUMNS} FROM yaw_logs ORDER BY id DESC"
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
                   RETURNING {cols}""".format(cols=LOG_COLUMNS),
                (turbine_code, yaw_err_deg, user["username"], now),
            ).fetchone()
            conn.commit()
            return row

    row = await run_db(insert)
    return jsonify(row), 201


@app.get("/api/band")
@require_login
async def get_band(user):
    """当前生效的琥珀带（观察账号只读也可查看）。"""
    def fetch():
        with connect() as conn:
            return current_band(conn)

    band = await run_db(fetch)
    return jsonify(band)


@app.get("/api/band/history")
@require_login
async def band_history(user):
    """改带历史（append-only），新到旧。"""
    def fetch():
        with connect() as conn:
            return list_bands(conn)

    rows = await run_db(fetch)
    return jsonify(rows)


@app.post("/api/band")
@require_writer
async def set_band(user):
    """改带：追加新版本。只作用于之后新认领的单据，已领单据按快照界不变。"""
    body = await request.get_json(force=True, silent=True) or {}
    try:
        inner, outer = validate_band(body.get("inner_deg"), body.get("outer_deg"))
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400

    note = (body.get("note") or "").strip() or None

    def append():
        with connect() as conn:
            row = insert_band(conn, inner, outer, user["username"], note)
            conn.commit()
            return row

    row = await run_db(append)
    return jsonify(row), 201
