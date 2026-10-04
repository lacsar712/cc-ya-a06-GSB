import os

import psycopg
from psycopg.rows import dict_row

from rules import DEFAULT_INNER_DEG, DEFAULT_OUTER_DEG

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://app:app@localhost:54399/yawalign",
)


def connect():
    return psycopg.connect(DSN, row_factory=dict_row)


SCHEMA = """
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
);

-- 琥珀带版本：append-only，改带即追加新行，绝不更新旧行。
CREATE TABLE IF NOT EXISTS band_configs (
    id serial PRIMARY KEY,
    inner_deg double precision NOT NULL,   -- 合格内界：|x| <= inner 为合格
    outer_deg double precision NOT NULL,   -- 琥珀外界：inner < |x| <= outer 为近阈，超过才超差
    changed_by text NOT NULL,
    changed_at timestamptz NOT NULL,
    note text
);

-- 单据在领单瞬间快照当时的琥珀界，此后与配置版本解耦。
ALTER TABLE yaw_logs
    ADD COLUMN IF NOT EXISTS near_threshold boolean NOT NULL DEFAULT false;
ALTER TABLE yaw_logs
    ADD COLUMN IF NOT EXISTS band_id integer REFERENCES band_configs(id);
ALTER TABLE yaw_logs
    ADD COLUMN IF NOT EXISTS inner_threshold_deg double precision;
ALTER TABLE yaw_logs
    ADD COLUMN IF NOT EXISTS outer_threshold_deg double precision;

CREATE INDEX IF NOT EXISTS idx_yaw_logs_status_id ON yaw_logs(status, id);
"""

DEFAULT_BAND_NOTE = "初始琥珀带：合格内界 ±1.5°，近阈琥珀带 ±1.5°～±1.8°"


def current_band(conn):
    """当前生效的琥珀带（id 最大者）。"""
    return conn.execute(
        "SELECT * FROM band_configs ORDER BY id DESC LIMIT 1"
    ).fetchone()


def list_bands(conn):
    """改带历史，新到旧。"""
    return conn.execute(
        "SELECT * FROM band_configs ORDER BY id DESC"
    ).fetchall()


def insert_band(conn, inner_deg: float, outer_deg: float,
                changed_by: str, note: str | None):
    """追加一条新版本并返回它（调用方负责提交事务）。"""
    return conn.execute(
        """INSERT INTO band_configs
           (inner_deg, outer_deg, changed_by, changed_at, note)
           VALUES (%s, %s, %s, now(), %s)
           RETURNING *""",
        (inner_deg, outer_deg, changed_by, note),
    ).fetchone()


def ensure_schema(conn):
    """建表/加列（幂等），并保证存在一条默认带、旧单据补齐快照。"""
    conn.execute(SCHEMA)

    band = current_band(conn)
    if band is None:
        band = conn.execute(
            """INSERT INTO band_configs
               (inner_deg, outer_deg, changed_by, changed_at, note)
               VALUES (%s, %s, 'system', now(), %s)
               RETURNING *""",
            (DEFAULT_INNER_DEG, DEFAULT_OUTER_DEG, DEFAULT_BAND_NOTE),
        ).fetchone()

    # 升级前产生的历史单据没有快照列：按初始带回填，并按带界重算近阈标记。
    conn.execute(
        """UPDATE yaw_logs
           SET band_id = %s,
               inner_threshold_deg = %s,
               outer_threshold_deg = %s,
               near_threshold = CASE
                   WHEN verdict = '合格'
                        AND abs(yaw_err_deg) > %s
                        AND abs(yaw_err_deg) <= %s
                   THEN true ELSE false END
           WHERE band_id IS NULL""",
        (band["id"], band["inner_deg"], band["outer_deg"],
         band["inner_deg"], band["outer_deg"]),
    )
