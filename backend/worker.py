"""后台 worker：用 SKIP LOCKED 认领 pending 记录并写入判定结论。

认领单据的同一事务内读取当前琥珀带版本，把内/外界连同版本 id 快照进
单据——已被领走的单据始终按领单时的界判定，运行中改带不影响在途/已完成
单据，只作用于此后新认领的单据。
"""

import os
import time
from datetime import datetime, timezone

import psycopg

from db import connect, current_band, ensure_schema
from rules import judge

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

        # 与认领同一事务读取，保证快照的就是领单那一刻的生效带。
        band = current_band(conn)
        verdict, near_threshold, reason = judge(
            float(row["yaw_err_deg"]),
            band["inner_deg"],
            band["outer_deg"],
        )
        now = datetime.now(timezone.utc)
        conn.execute(
            """UPDATE yaw_logs
               SET status = 'done',
                   verdict = %s,
                   reason = %s,
                   processed_at = %s,
                   near_threshold = %s,
                   band_id = %s,
                   inner_threshold_deg = %s,
                   outer_threshold_deg = %s
               WHERE id = %s""",
            (
                verdict,
                reason,
                now,
                near_threshold,
                band["id"],
                band["inner_deg"],
                band["outer_deg"],
                row["id"],
            ),
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
