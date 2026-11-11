"""Oracle payroll READ-ONLY gateway for the attendance app.

Runs in its own container, which is kept STOPPED and started from Portainer only
when employees are to be compared with the payroll master. It has no published
port: only the attendance app reaches it over the private Docker network, and
every request must carry the shared key (header X-Sync-Key).

Endpoints (GET only):
  /health                  -> is Oracle reachable, database version, latest paybill month
  /snapshot                -> all rows of M_EMP_MAST (selected columns) + "paid last month"
  /conveyance-paid         -> conveyance allowance already paid (T_CONV), last four years
  /paybill/fingerprints    -> per month of T_PAYBILL_HIST(_ARCHIVE): row count + hash sum
  /paybill/rows?src=&yr=&m1=&m2=
                           -> months m1..m2 of one year of T_PAYBILL_HIST (src=H) or
                              _ARCHIVE (src=A), 22 columns, plus those months' fingerprints

It never writes anywhere: no Oracle changes (see queries.py), no Postgres at all.
"""
import datetime
import decimal
import gzip
import hmac
import json
import logging
import os
import sys
import threading
import time
import urllib.parse
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


def run_queries(steps, timeout_ms: int = 120_000):
    """Open a session, make it read-only, run the given (sql, params) steps, close.

    Returns (oracle_version, [(columns, rows) per step]). Each step's SQL is
    checked by queries.assert_read_only again right before it runs. All steps
    run in ONE read-only transaction, so they see the same data.
    """
    with _oracle_lock:
        conn = oracledb.connect(user=ORACLE_USER, password=ORACLE_PASSWORD, dsn=ORACLE_DSN)
        try:
            conn.call_timeout = timeout_ms
            cur = conn.cursor()
            cur.arraysize = 5000
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
    if isinstance(v, decimal.Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    return v


def fingerprint(r):
    """(src, yr_no, mth_no, n, h) row → JSON; the hash sum is sent as text (it is too big for a JS number)."""
    return {"src": r[0], "year": int(r[1]), "month": int(r[2]), "rows": int(r[3]), "hash": str(int(r[4] or 0))}


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
        url = urllib.parse.urlsplit(self.path)
        path, params = url.path, urllib.parse.parse_qs(url.query)
        try:
            if path == "/health":
                started = time.time()
                version, res = run_queries([(queries.DB_PING, None), (queries.LATEST_PAYBILL_MONTH, None)])
                rows = res[1][1]
                return self.send_json(200, {
                    "ok": True,
                    "oracleVersion": version,
                    "latestPaybill": {"year": int(rows[0][0]), "month": int(rows[0][1])} if rows else None,
                    "ms": int((time.time() - started) * 1000),
                })
            if path == "/snapshot":
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
            if path == "/conveyance-paid":
                started = time.time()
                _, res = run_queries([(queries.CONVEYANCE_PAID, None)])
                cols, rows = res[0]
                data = [dict(zip(cols, (to_json_value(v) for v in r))) for r in rows]
                log.info("conveyance paid: %d rows, %.1fs", len(data), time.time() - started)
                return self.send_json(200, {"rows": data})
            if path == "/paybill/fingerprints":
                started = time.time()
                _, res = run_queries([(queries.PAYBILL_FINGERPRINTS, None)], timeout_ms=600_000)
                months = [fingerprint(r) for r in res[0][1]]
                log.info("paybill fingerprints: %d months, %.1fs", len(months), time.time() - started)
                return self.send_json(200, {"months": months})
            if path == "/paybill/rows":
                # ?src=H|A&yr=YYYY&m1=1&m2=3 — src only picks one of the fixed queries;
                # the numbers are checked and passed as bind variables.
                src = (params.get("src") or [""])[0]
                nums = [(params.get(k) or [""])[0] for k in ("yr", "m1", "m2")]
                if src not in ("H", "A") or not all(n.isdigit() for n in nums):
                    return self.send_json(400, {"message": "src must be H or A; yr, m1, m2 numbers"})
                yr, m1, m2 = (int(n) for n in nums)
                if not (1990 <= yr <= 2100 and 1 <= m1 <= m2 <= 12):
                    return self.send_json(400, {"message": "yr or month range out of bounds"})
                rows_sql, fp_sql = (
                    (queries.PAYBILL_HIST_ROWS, queries.PAYBILL_HIST_RANGE_FINGERPRINTS) if src == "H"
                    else (queries.PAYBILL_ARCHIVE_ROWS, queries.PAYBILL_ARCHIVE_RANGE_FINGERPRINTS)
                )
                bind = {"yr": yr, "m1": m1, "m2": m2}
                started = time.time()
                _, res = run_queries([(rows_sql, bind), (fp_sql, bind)], timeout_ms=600_000)
                cols, rows = res[0]
                log.info("paybill rows %s/%d/%d-%d: %d rows, %.1fs", src, yr, m1, m2, len(rows), time.time() - started)
                return self.send_json(200, {
                    "src": src, "year": yr, "columns": cols,
                    "rows": [[to_json_value(v) for v in r] for r in rows],
                    "months": [fingerprint(r) for r in res[1][1]],
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
