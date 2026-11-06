"""Oracle payroll READ-ONLY gateway for the attendance app.

Runs in its own container, which is kept STOPPED and started from Portainer only
when employees are to be compared with the payroll master. It has no published
port: only the attendance app reaches it over the private Docker network, and
every request must carry the shared key (header X-Sync-Key).

Endpoints (GET only):
  /health    -> is Oracle reachable, database version, latest paybill month
  /snapshot  -> all rows of M_EMP_MAST (selected columns) + "paid last month"

It never writes anywhere: no Oracle changes (see queries.py), no Postgres at all.
"""
import datetime
import gzip
import hmac
import json
import logging
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import oracledb

import queries

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("oracle-sync")


def env(name: str, default: str | None = None) -> str:
    v = os.environ.get(name, default)
    if not v:
        log.error("Missing environment variable %s", name)
        sys.exit(1)
    return v


ORACLE_DSN = env("ORACLE_DSN")            # e.g. 10.0.93.148:1521/TENG
ORACLE_USER = env("ORACLE_USER")
ORACLE_PASSWORD = env("ORACLE_PASSWORD")
SYNC_KEY = env("ORACLE_SYNC_KEY")
if len(SYNC_KEY) < 24:
    log.error("ORACLE_SYNC_KEY must be at least 24 characters")
    sys.exit(1)
PORT = int(os.environ.get("PORT", "8000"))

# Thick mode: needed for Oracle 11.1 (thin mode needs 12.1+). Library path from the image.
oracledb.init_oracle_client(lib_dir=os.environ.get("ORACLE_CLIENT_LIB") or None)

# Only one Oracle query at a time — this is an occasional admin tool, keep the load tiny.
_oracle_lock = threading.Lock()


def run_queries(steps):
    """Open a session, make it read-only, run the given (sql, params) steps, close.

    Returns (oracle_version, [(columns, rows) per step]). Each step's SQL is
    checked by queries.assert_read_only again right before it runs.
    """
    with _oracle_lock:
        conn = oracledb.connect(user=ORACLE_USER, password=ORACLE_PASSWORD, dsn=ORACLE_DSN)
        try:
            conn.call_timeout = 120_000  # ms
            cur = conn.cursor()
            cur.execute(queries.READ_ONLY_TRANSACTION)
            out = []
            for sql, params in steps:
                cur.execute(queries.assert_read_only(sql), params or {})
                cols = [d[0].lower() for d in cur.description]
                out.append((cols, cur.fetchall()))
            return conn.version, out
        finally:
            # Never commit. Rolling back ends the read-only transaction.
            try:
                conn.rollback()
            finally:
                conn.close()


def latest_month():
    _, res = run_queries([(queries.LATEST_PAYBILL_MONTH, None)])
    rows = res[0][1]
    return (int(rows[0][0]), int(rows[0][1])) if rows else (None, None)


def to_json_value(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()[:10]
    if isinstance(v, str):
        return v.strip()
    return v


class Handler(BaseHTTPRequestHandler):
    server_version = "oracle-sync"
    sys_version = ""
    protocol_version = "HTTP/1.1"  # every reply has Content-Length

    def log_message(self, fmt, *args):  # quieter access log
        log.info("%s %s", self.address_string(), fmt % args)

    def send_json(self, status: int, body):
        data = json.dumps(body, separators=(",", ":")).encode()
        gz = "gzip" in (self.headers.get("Accept-Encoding") or "")
        if gz:
            data = gzip.compress(data, compresslevel=5)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorised(self) -> bool:
        key = self.headers.get("X-Sync-Key") or ""
        return hmac.compare_digest(key.encode(), SYNC_KEY.encode())

    def do_GET(self):
        if not self.authorised():
            return self.send_json(401, {"message": "Unauthorized"})
        try:
            if self.path == "/health":
                started = time.time()
                version, res = run_queries([(queries.DB_PING, None), (queries.LATEST_PAYBILL_MONTH, None)])
                rows = res[1][1]
                return self.send_json(200, {
                    "ok": True,
                    "oracleVersion": version,
                    "latestPaybill": {"year": int(rows[0][0]), "month": int(rows[0][1])} if rows else None,
                    "ms": int((time.time() - started) * 1000),
                })
            if self.path == "/snapshot":
                started = time.time()
                yr, mth = latest_month()
                _, res = run_queries([(queries.EMPLOYEE_SNAPSHOT, {"yr": yr or 0, "mth": mth or 0})])
                cols, rows = res[0]
                data = [dict(zip(cols, (to_json_value(v) for v in r))) for r in rows]
                log.info("snapshot: %d rows, paybill %s/%s, %.1fs", len(data), mth, yr, time.time() - started)
                return self.send_json(200, {
                    "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "paybill": {"year": yr, "month": mth},
                    "rows": data,
                })
            return self.send_json(404, {"message": "Not found"})
        except oracledb.Error as e:
            log.error("Oracle error: %s", e)
            return self.send_json(502, {"message": f"Oracle error: {e}"})
        except Exception as e:  # noqa: BLE001
            log.exception("Unexpected error")
            return self.send_json(500, {"message": f"Error: {e}"})

    # Anything but GET is refused outright
    def _refuse(self):
        self.send_json(405, {"message": "Read-only service"})

    do_POST = do_PUT = do_PATCH = do_DELETE = _refuse


if __name__ == "__main__":
    log.info("Oracle sync (read-only) listening on :%d, Oracle %s", PORT, ORACLE_DSN)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
