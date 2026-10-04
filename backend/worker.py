"""后台 worker：用 SKIP LOCKED 认领 pending 记录，按认领时刻的琥珀带判定并快照留存。"""

import os
import time
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from db import connect, current_band, ensure_schema
from rules import DEFAULT_INNER_DEG, DEFAULT_OUTER_DEG, judge

POLL_SEC = float(os.environ.get("WORKER_POLL_SEC", "0.5"))
IDLE_SEC = float(os.environ.get("WORKER_IDLE_SEC", "1.0"))


def claim_and_process(conn) -> bool:
    with conn.transaction():
        row = conn.execute(
            """SELECT id, turbine_code, yaw_err_deg
               FROM yaw_logs
               WHERE status = 'pending'
               ORDER BY id
               FOR UPDATE SKIP LOCKED
               LIMIT 1"""
        ).fetchone()
        if row is None:
            return False
        # 领时快照：认领瞬间的生效琥珀带写入行内，之后改带不影响本单
        band = current_band(conn)
        inner = float(band["inner_deg"]) if band else DEFAULT_INNER_DEG
        outer = float(band["outer_deg"]) if band else DEFAULT_OUTER_DEG
        verdict, reason = judge(float(row["yaw_err_deg"]), inner, outer)
        now = datetime.now(timezone.utc)
        conn.execute(
            """UPDATE yaw_logs
               SET status = 'done', verdict = %s, reason = %s,
                   band_inner_deg = %s, band_outer_deg = %s, processed_at = %s
               WHERE id = %s""",
            (verdict, reason, inner, outer, now, row["id"]),
        )
    return True


def main():
    print("yaw-align worker started", flush=True)
    with connect() as conn:
        ensure_schema(conn)
        conn.commit()
    while True:
        try:
            with connect() as conn:
                if claim_and_process(conn):
                    conn.commit()
                    time.sleep(POLL_SEC)
                else:
                    time.sleep(IDLE_SEC)
        except psycopg.Error as exc:
            print(f"worker db error: {exc}", flush=True)
            time.sleep(IDLE_SEC)


if __name__ == "__main__":
    main()
