"""Every SQL statement the Oracle sync service may run — and the guard that checks them.

RULE: the payroll database is READ ONLY for us. The Oracle login has the DBA role,
so safety comes from this code:
  * only the fixed SELECT statements below exist; nothing builds SQL from input,
  * `assert_read_only` rejects anything that is not a plain SELECT/WITH,
  * every session starts with SET TRANSACTION READ ONLY (Oracle itself then
    refuses any change), and the service never calls commit.
"""
import re

# The only non-SELECT statement allowed: it makes the whole session read-only.
READ_ONLY_TRANSACTION = "SET TRANSACTION READ ONLY"

_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|merge|upsert|drop|alter|create|truncate|rename|grant|revoke|"
    r"commit|rollback|savepoint|lock|execute|exec|call|begin|declare|dbms_\w+|utl_\w+|"
    r"for\s+update)\b",
    re.IGNORECASE,
)


def assert_read_only(sql: str) -> str:
    """Raise unless `sql` is a single plain SELECT (or WITH … SELECT)."""
    s = sql.strip()
    if ";" in s:
        raise ValueError("Only one statement is allowed")
    if not re.match(r"^(select|with)\b", s, re.IGNORECASE):
        raise ValueError("Only SELECT statements are allowed")
    bad = _FORBIDDEN.search(s)
    if bad:
        raise ValueError(f"Forbidden word in query: {bad.group(0)}")
    return s


# Latest month that has a regular salary bill (SAL_CODE 1 = regular, 2/3 = supplementary)
LATEST_PAYBILL_MONTH = """
SELECT yr_no, mth_no FROM (
  SELECT yr_no, mth_no FROM amu_pay.t_paybill_hist
  WHERE sal_code = 1
  GROUP BY yr_no, mth_no
  ORDER BY yr_no DESC, mth_no DESC
) WHERE ROWNUM = 1
"""

# One row per employee in the payroll master, with names looked up and a flag
# telling whether a regular salary was made for the given month.
EMPLOYEE_SNAPSHOT = """
SELECT m.ecode,
       m.emp_name,
       m.desig_code,
       d.desig_name,
       m.sal_no,
       m.d_ast,
       TO_CHAR(m.term_app, 'YYYY-MM-DD')           AS term_app,
       m.pay_release_flag,
       m.emp_status,
       m.emp_cat,
       m.posting,
       m.pan_no,
       m.acct_no,
       m.aadhar,
       m.bank_code,
       b.bank_name,
       m.ifsc,
       TO_CHAR(m.date_of_join, 'YYYY-MM-DD')       AS date_of_join,
       TO_CHAR(m.retire_date, 'YYYY-MM-DD')        AS retire_date,
       TO_CHAR(m.actual_retire_date, 'YYYY-MM-DD') AS actual_retire_date,
       m.salgroup,
       m.suspend,
       m.pay_grade,
       m.order_no,
       CASE WHEN p.ecode IS NULL THEN 0 ELSE 1 END AS paid_last_month
FROM amu_pay.m_emp_mast m
LEFT JOIN amu_pay.m_desig_mast d ON d.desig = m.desig_code
LEFT JOIN amu_pay.m_bank b ON b.bank_code = m.bank_code
LEFT JOIN (
  SELECT DISTINCT ecode FROM amu_pay.t_paybill_hist
  WHERE yr_no = :yr AND mth_no = :mth AND sal_code = 1
) p ON p.ecode = m.ecode
"""

DB_PING = "SELECT 1 FROM dual"

# ── Paybill history (T_PAYBILL_HIST = recent years, T_PAYBILL_HIST_ARCHIVE = older) ──
# The 22 columns copied to the app's paybill_history table, in this order.
PAYBILL_COLUMNS = """yr_no, mth_no, sal_code, ecode, cat_code, emp_cat, desig_code, deptt,
       basic_sal, npa, da, hra, ta, pat_care, nursing, annual, d_ast,
       TO_CHAR(full_pay_fdate, 'YYYY-MM-DD') AS full_pay_fdate,
       TO_CHAR(full_pay_tdate, 'YYYY-MM-DD') AS full_pay_tdate,
       sal_no, grade_pay, sal_flag"""

# One value per row built from the same 22 columns. A month's fingerprint is
# COUNT(*) + SUM(ORA_HASH(row)): if any of these columns changes in Oracle, or a
# row is added or removed, the fingerprint of that month changes.
_PAYBILL_ROW_SIGNATURE = """yr_no||'|'||mth_no||'|'||sal_code||'|'||ecode||'|'||cat_code||'|'||emp_cat||'|'||
  desig_code||'|'||deptt||'|'||basic_sal||'|'||npa||'|'||da||'|'||hra||'|'||ta||'|'||pat_care||'|'||
  nursing||'|'||annual||'|'||d_ast||'|'||TO_CHAR(full_pay_fdate, 'YYYYMMDD')||'|'||
  TO_CHAR(full_pay_tdate, 'YYYYMMDD')||'|'||sal_no||'|'||grade_pay||'|'||sal_flag"""

# Fingerprint of every month in both tables ('H' = hist, 'A' = archive)
PAYBILL_FINGERPRINTS = f"""
SELECT 'H' AS src, yr_no, mth_no, COUNT(*) AS n, SUM(ORA_HASH({_PAYBILL_ROW_SIGNATURE})) AS h
FROM amu_pay.t_paybill_hist GROUP BY yr_no, mth_no
UNION ALL
SELECT 'A' AS src, yr_no, mth_no, COUNT(*) AS n, SUM(ORA_HASH({_PAYBILL_ROW_SIGNATURE})) AS h
FROM amu_pay.t_paybill_hist_archive GROUP BY yr_no, mth_no
"""

# The rows of a few months of one year (:m1 to :m2), and those months' fingerprints
# (both run in the same read-only transaction, so they describe exactly the same data).
# A few months at a time keeps memory small in the app and in this container.
_RANGE = "yr_no = :yr AND mth_no BETWEEN :m1 AND :m2"
PAYBILL_HIST_ROWS = f"SELECT {PAYBILL_COLUMNS} FROM amu_pay.t_paybill_hist WHERE {_RANGE}"
PAYBILL_ARCHIVE_ROWS = f"SELECT {PAYBILL_COLUMNS} FROM amu_pay.t_paybill_hist_archive WHERE {_RANGE}"
PAYBILL_HIST_RANGE_FINGERPRINTS = f"""
SELECT 'H' AS src, yr_no, mth_no, COUNT(*) AS n, SUM(ORA_HASH({_PAYBILL_ROW_SIGNATURE})) AS h
FROM amu_pay.t_paybill_hist WHERE {_RANGE} GROUP BY yr_no, mth_no
"""
PAYBILL_ARCHIVE_RANGE_FINGERPRINTS = f"""
SELECT 'A' AS src, yr_no, mth_no, COUNT(*) AS n, SUM(ORA_HASH({_PAYBILL_ROW_SIGNATURE})) AS h
FROM amu_pay.t_paybill_hist_archive WHERE {_RANGE} GROUP BY yr_no, mth_no
"""

ALL_QUERIES = {
    "LATEST_PAYBILL_MONTH": LATEST_PAYBILL_MONTH,
    "EMPLOYEE_SNAPSHOT": EMPLOYEE_SNAPSHOT,
    "DB_PING": DB_PING,
    "PAYBILL_FINGERPRINTS": PAYBILL_FINGERPRINTS,
    "PAYBILL_HIST_ROWS": PAYBILL_HIST_ROWS,
    "PAYBILL_ARCHIVE_ROWS": PAYBILL_ARCHIVE_ROWS,
    "PAYBILL_HIST_RANGE_FINGERPRINTS": PAYBILL_HIST_RANGE_FINGERPRINTS,
    "PAYBILL_ARCHIVE_RANGE_FINGERPRINTS": PAYBILL_ARCHIVE_RANGE_FINGERPRINTS,
}

# Fail at import time if anyone ever adds a statement that is not read-only.
for _name, _sql in ALL_QUERIES.items():
    assert_read_only(_sql)
