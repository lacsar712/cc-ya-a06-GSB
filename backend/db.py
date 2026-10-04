import os
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://app:app@localhost:54399/yawalign",
)


def connect():
    return psycopg.connect(DSN, row_factory=dict_row)


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS yaw_logs (
        id serial PRIMARY KEY,
        turbine_code text NOT NULL,
        yaw_err_deg double precision NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        verdict text,
        reason text,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL,
        processed_at timestamptz
    )
    """,
    # 认领时快照的琥珀带界限（pending 行为 NULL，认领后写入）
    "ALTER TABLE yaw_logs ADD COLUMN IF NOT EXISTS band_inner_deg double precision",
    "ALTER TABLE yaw_logs ADD COLUMN IF NOT EXISTS band_outer_deg double precision",
    # 琥珀带改带历史：最新一行即当前生效带
    """
    CREATE TABLE IF NOT EXISTS band_settings (
        id serial PRIMARY KEY,
        inner_deg double precision NOT NULL,
        outer_deg double precision NOT NULL,
        changed_by text NOT NULL,
        changed_at timestamptz NOT NULL
    )
    """,
]


def ensure_schema(conn):
    for stmt in SCHEMA_STATEMENTS:
        conn.execute(stmt)


def ensure_default_band(conn, inner_deg: float, outer_deg: float):
    """band_settings 为空时写入默认琥珀带（幂等）。"""
    count = conn.execute("SELECT COUNT(*) AS n FROM band_settings").fetchone()["n"]
    if count == 0:
        conn.execute(
            """INSERT INTO band_settings (inner_deg, outer_deg, changed_by, changed_at)
               VALUES (%s, %s, %s, %s)""",
            (inner_deg, outer_deg, "system", datetime.now(timezone.utc)),
        )


def current_band(conn):
    """当前生效的琥珀带；未设置时返回 None（调用方回退默认值）。"""
    return conn.execute(
        """SELECT id, inner_deg, outer_deg, changed_by, changed_at
           FROM band_settings ORDER BY id DESC LIMIT 1"""
    ).fetchone()
