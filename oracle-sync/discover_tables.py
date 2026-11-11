"""One-time, READ-ONLY look at the Oracle payroll data dictionary.

Purpose: find which tables hold family / children, CEA claims, conveyance
allowance (eligibility + paid periods) and HRA / NPA / PCA flags, so the claim
forms can be planned. It reads ONLY table and column NAMES (the dictionary views
ALL_TABLES / ALL_TAB_COLUMNS / ALL_TAB_COMMENTS / ALL_COL_COMMENTS) — no
employee data at all.

Safety (same rules as queries.py):
  * every statement goes through queries.assert_read_only (plain SELECT only),
  * the session starts with SET TRANSACTION READ ONLY,
  * nothing is ever committed.

Run it yourself in a terminal (the password is typed by you, never stored):
    python oracle-sync/discover_tables.py
Result: oracle-sync/discovery_report.txt
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import queries  # noqa: E402  (the read-only guard)

OWNER = "AMU_PAY"
DSN = os.environ.get("ORACLE_DSN", "10.0.93.148:1521/TENG")
CLIENT_DIR = os.environ.get("ORACLE_CLIENT_LIB", r"E:\instantclient\instantclient_11_2")
REPORT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "discovery_report.txt")

# Words looked for in table names and column names
KEYWORDS = [
    "FAM", "CHILD", "CHLD", "KID", "DEPEND", "NOMIN", "SPOUSE", "WIFE", "HUSB", "RELAT", "DOB", "BIRTH",
    "CEA", "EDU", "TUITION", "TUTION", "SCHOOL", "SCHL", "HOSTEL", "CLASS", "SESSION", "ACAD", "REIMB",
    "CONV", "VEHIC", "VISIT",
    "HRA", "QTR", "QUARTER", "ACCOM", "LICEN", "NPA", "PCA", "PAT_CARE", "PATIENT",
    "ALLOW", "ELIG", "ENTITLE", "CLAIM",
]

ALL_TABLES = """
SELECT t.table_name, t.num_rows, TO_CHAR(t.last_analyzed, 'YYYY-MM-DD') AS analyzed, c.comments
FROM all_tables t
LEFT JOIN all_tab_comments c ON c.owner = t.owner AND c.table_name = t.table_name
WHERE t.owner = :owner
ORDER BY t.table_name
"""

ALL_VIEWS = "SELECT view_name FROM all_views WHERE owner = :owner ORDER BY view_name"

TABLE_COLUMNS = """
SELECT c.table_name, c.column_id, c.column_name, c.data_type, c.data_length, c.nullable, m.comments
FROM all_tab_columns c
LEFT JOIN all_col_comments m
  ON m.owner = c.owner AND m.table_name = c.table_name AND m.column_name = c.column_name
WHERE c.owner = :owner
ORDER BY c.table_name, c.column_id
"""


def matches(name: str) -> list[str]:
    up = (name or "").upper()
    return [k for k in KEYWORDS if k in up]


def main() -> int:
    try:
        import cx_Oracle as ora
        ora.init_oracle_client(lib_dir=CLIENT_DIR)
    except ImportError:
        import oracledb as ora
        ora.init_oracle_client(lib_dir=CLIENT_DIR)

    user = os.environ.get("ORACLE_USER") or input(f"Oracle user [{OWNER}]: ").strip() or OWNER
    password = os.environ.get("ORACLE_PASSWORD") or getpass.getpass("Oracle password (not shown, not stored): ")

    conn = ora.connect(user=user, password=password, dsn=DSN)
    try:
        cur = conn.cursor()
        cur.arraysize = 5000
        cur.execute(queries.READ_ONLY_TRANSACTION)

        def run(sql: str):
            cur.execute(queries.assert_read_only(sql), {"owner": OWNER})
            return cur.fetchall()

        tables = run(ALL_TABLES)
        views = [r[0] for r in run(ALL_VIEWS)]
        columns = run(TABLE_COLUMNS)
    finally:
        conn.close()  # nothing was changed; nothing is committed

    by_table: dict[str, list] = {}
    for row in columns:
        by_table.setdefault(row[0], []).append(row)

    # A table is interesting if its name, or one of its columns, has a keyword
    interesting: dict[str, set[str]] = {}
    for name in by_table:
        hits = set(matches(name))
        for col in by_table[name]:
            hits.update(matches(col[2]))
        if hits:
            interesting[name] = hits

    out: list[str] = []
    out.append(f"Oracle data dictionary of {OWNER} — names only, no employee data")
    out.append(f"Tables: {len(tables)}   Views: {len(views)}")
    out.append("")
    out.append("=== 1. ALL TABLES (name | rows by statistics | last analyzed | comment) ===")
    for name, rows, analyzed, comment in tables:
        out.append(f"{name} | {rows if rows is not None else '?'} | {analyzed or '-'} | {comment or ''}")
    out.append("")
    out.append("=== 2. ALL VIEWS ===")
    out.extend(views or ["(none)"])
    out.append("")
    out.append("=== 3. TABLES / VIEWS WITH A KEYWORD IN THE NAME OR IN A COLUMN ===")
    for name in sorted(interesting):
        out.append("")
        out.append(f"--- {name}   (matched: {', '.join(sorted(interesting[name]))})")
        for _t, _id, col, dtype, length, nullable, comment in by_table[name]:
            mark = " *" if matches(col) else ""
            out.append(f"    {col} {dtype}({length}) {'NULL' if nullable == 'Y' else 'NOT NULL'}{mark}"
                       f"{'   -- ' + comment if comment else ''}")
    out.append("")
    out.append("=== 4. M_EMP_MAST — every column ===")
    for _t, _id, col, dtype, length, nullable, comment in by_table.get("M_EMP_MAST", []):
        out.append(f"    {col} {dtype}({length}){'   -- ' + comment if comment else ''}")

    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"Done. {len(tables)} tables, {len(interesting)} with matching names.")
    print(f"Report: {REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
