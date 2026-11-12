"""One-time, READ-ONLY look at the CODES used in the payroll tables found by
discover_tables.py (family, CEA, conveyance, HRA / NPA / PCA).

It reads only:
  * COUNTS per code value (e.g. how many rows have CON_FLG = 'Y'),
  * date ranges (first / last period),
  * the small rate masters (M_CONV, M_NPA, M_HRA_MAST_7CPC, M_PCA_MAST_7CPC,
    P_GEN_PARAM_SAL) — these hold rates, not people.
No employee code, name, child name, account number or any other personal row.

Safety (same rules as queries.py): every statement goes through
queries.assert_read_only, the session is SET TRANSACTION READ ONLY, no commit.

Run it yourself (the password is typed by you, never stored):
    python oracle-sync/discover_codes.py
Result: oracle-sync/discovery_codes.txt
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import queries  # noqa: E402  (the read-only guard)

OWNER = "amu_pay"
DSN = os.environ.get("ORACLE_DSN", "10.0.93.148:1521/TENG")
CLIENT_DIR = os.environ.get("ORACLE_CLIENT_LIB", r"E:\instantclient\instantclient_11_2")
REPORT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "discovery_codes.txt")


def counts(table: str, column: str, where: str = "") -> tuple[str, str]:
    """How many rows have each value of one code column (at most 60 values shown)."""
    w = f"WHERE {where}" if where else ""
    return (
        f"{table}.{column} — rows per value {('(' + where + ')') if where else ''}",
        f"SELECT * FROM (SELECT {column} AS val, COUNT(*) AS n FROM {OWNER}.{table} {w} "
        f"GROUP BY {column} ORDER BY COUNT(*) DESC) WHERE ROWNUM <= 60",
    )


STEPS: list[tuple[str, str]] = [
    # ── Family ────────────────────────────────────────────────────────────────
    ("M_FAMILY_DETAIL — totals",
     f"""SELECT COUNT(*) AS total_rows, COUNT(DISTINCT ecode) AS employees,
                SUM(CASE WHEN dob IS NULL THEN 1 ELSE 0 END) AS dob_empty,
                SUM(CASE WHEN person_name IS NULL THEN 1 ELSE 0 END) AS name_empty
         FROM {OWNER}.m_family_detail"""),
    counts("m_family_detail", "relation_with_emp"),
    counts("m_family_detail", "sex"),
    counts("m_family_detail", "dependent"),
    counts("m_family_detail", "person_status"),
    counts("m_family_detail", "recflag"),
    ("M_FAMILY_DETAIL — family rows per employee (how many employees have 1, 2, 3… rows)",
     f"""SELECT members, COUNT(*) AS employees FROM (
           SELECT ecode, COUNT(*) AS members FROM {OWNER}.m_family_detail GROUP BY ecode
         ) GROUP BY members ORDER BY members"""),
    ("M_FAMILY_DETAIL — same date of birth twice for one employee (twins) — number of employees",
     f"""SELECT COUNT(*) AS employees_with_twins FROM (
           SELECT ecode, dob FROM {OWNER}.m_family_detail WHERE dob IS NOT NULL
           GROUP BY ecode, dob HAVING COUNT(*) > 1)"""),
    ("M_SPOUSE — totals",
     f"SELECT COUNT(*) AS total_rows, COUNT(DISTINCT ecode) AS employees FROM {OWNER}.m_spouse"),

    # ── Employee master flags ─────────────────────────────────────────────────
    counts("m_emp_mast", "con_flg", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "off_vech_flag", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "vacation_code", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "medico", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "hra_flg", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "govt_acc_flag", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "pca_flg", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "pat_flg", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "wife_ser_flag", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "wife_govt_ser_flag", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "handicapt_flag", "pay_release_flag = 'Y'"),
    counts("m_emp_mast", "no_of_child", "pay_release_flag = 'Y'"),
    ("M_EMP_MAST — paid employees: how many have a spouse code, e-mail, phone",
     f"""SELECT COUNT(*) AS paid_employees,
                SUM(CASE WHEN wife_ecode IS NOT NULL THEN 1 ELSE 0 END) AS with_spouse_ecode,
                SUM(CASE WHEN email IS NOT NULL OR personal_email IS NOT NULL THEN 1 ELSE 0 END) AS with_email,
                SUM(CASE WHEN phone_no IS NOT NULL THEN 1 ELSE 0 END) AS with_phone,
                SUM(CASE WHEN date_of_birth IS NOT NULL THEN 1 ELSE 0 END) AS with_dob,
                SUM(CASE WHEN confirm_date IS NOT NULL THEN 1 ELSE 0 END) AS with_confirm_date
         FROM {OWNER}.m_emp_mast WHERE pay_release_flag = 'Y'"""),
    ("M_EMP_MAST — paid employees with / without a family row",
     f"""SELECT CASE WHEN f.ecode IS NULL THEN 'no family row' ELSE 'has family row' END AS val, COUNT(*) AS n
         FROM {OWNER}.m_emp_mast m
         LEFT JOIN (SELECT DISTINCT ecode FROM {OWNER}.m_family_detail) f ON f.ecode = m.ecode
         WHERE m.pay_release_flag = 'Y'
         GROUP BY CASE WHEN f.ecode IS NULL THEN 'no family row' ELSE 'has family row' END"""),

    # ── Conveyance ────────────────────────────────────────────────────────────
    ("M_CONV — rate master (designation, vehicle type, amount) — all rows",
     f"SELECT desig_code, desig_desc, type_of_veh, amt FROM {OWNER}.m_conv ORDER BY desig_code, type_of_veh"),
    ("T_CONV — totals and date range",
     f"""SELECT COUNT(*) AS total_rows, COUNT(DISTINCT ecode) AS employees,
                TO_CHAR(MIN(prd_fr), 'YYYY-MM-DD') AS first_from, TO_CHAR(MAX(prd_fr), 'YYYY-MM-DD') AS last_from,
                TO_CHAR(MAX(prd_to), 'YYYY-MM-DD') AS last_to, TO_CHAR(MAX(transdate), 'YYYY-MM-DD') AS last_entry
         FROM {OWNER}.t_conv"""),
    counts("t_conv", "type_of_veh"),
    counts("t_conv", "sal_code"),
    counts("t_conv", "flg"),
    counts("t_conv", "recflag"),
    counts("t_conv", "yr"),
    ("T_CONV — amounts used since 2024 (amount, rows)",
     f"""SELECT * FROM (SELECT amt AS val, COUNT(*) AS n FROM {OWNER}.t_conv
         WHERE prd_fr >= DATE '2024-01-01' GROUP BY amt ORDER BY COUNT(*) DESC) WHERE ROWNUM <= 40"""),
    ("T_CONV — length of a claimed period in months since 2024 (months, rows)",
     f"""SELECT ROUND(MONTHS_BETWEEN(prd_to + 1, prd_fr)) AS months, COUNT(*) AS n FROM {OWNER}.t_conv
         WHERE prd_fr >= DATE '2024-01-01' GROUP BY ROUND(MONTHS_BETWEEN(prd_to + 1, prd_fr)) ORDER BY 1"""),
    ("T_CONV — starting month of a claimed period since 2024 (month number, rows)",
     f"""SELECT TO_CHAR(prd_fr, 'MM') AS start_month, COUNT(*) AS n FROM {OWNER}.t_conv
         WHERE prd_fr >= DATE '2024-01-01' GROUP BY TO_CHAR(prd_fr, 'MM') ORDER BY 1"""),
    ("T_CONV — designations of employees paid conveyance since 2024 (designation, employees)",
     f"""SELECT * FROM (
           SELECT m.desig_code, d.desig_name, COUNT(DISTINCT c.ecode) AS employees
           FROM {OWNER}.t_conv c
           JOIN {OWNER}.m_emp_mast m ON m.ecode = c.ecode
           LEFT JOIN {OWNER}.m_desig_mast d ON d.desig = m.desig_code
           WHERE c.prd_fr >= DATE '2024-01-01'
           GROUP BY m.desig_code, d.desig_name ORDER BY COUNT(DISTINCT c.ecode) DESC
         ) WHERE ROWNUM <= 60"""),
    ("T_CONV — CON_FLG / MEDICO of employees paid conveyance since 2024",
     f"""SELECT m.con_flg, m.medico, COUNT(DISTINCT c.ecode) AS employees
         FROM {OWNER}.t_conv c JOIN {OWNER}.m_emp_mast m ON m.ecode = c.ecode
         WHERE c.prd_fr >= DATE '2024-01-01' GROUP BY m.con_flg, m.medico ORDER BY 3 DESC"""),
    ("T_CONV_7CPC — totals",
     f"SELECT COUNT(*) AS total_rows, TO_CHAR(MAX(prd_to), 'YYYY-MM-DD') AS last_to FROM {OWNER}.t_conv_7cpc"),
    ("T_PAYBILL_HIST — conveyance and CEA paid through the salary bill, last months",
     f"""SELECT * FROM (
           SELECT yr_no, mth_no,
                  SUM(CASE WHEN conv_alw > 0 THEN 1 ELSE 0 END) AS rows_with_conv, SUM(conv_alw) AS conv_total,
                  SUM(CASE WHEN cea_reimburse > 0 THEN 1 ELSE 0 END) AS rows_with_cea, SUM(cea_reimburse) AS cea_total
           FROM {OWNER}.t_paybill_hist GROUP BY yr_no, mth_no ORDER BY yr_no DESC, mth_no DESC
         ) WHERE ROWNUM <= 20"""),

    # ── CEA ───────────────────────────────────────────────────────────────────
    ("T_CECX_SAL_HIST — totals",
     f"""SELECT COUNT(*) AS total_rows, COUNT(DISTINCT ecode) AS employees,
                SUM(CASE WHEN cname IS NULL THEN 1 ELSE 0 END) AS child_name_empty,
                SUM(CASE WHEN dob IS NULL THEN 1 ELSE 0 END) AS dob_empty,
                SUM(CASE WHEN asession IS NULL THEN 1 ELSE 0 END) AS session_empty,
                SUM(CASE WHEN class IS NULL THEN 1 ELSE 0 END) AS class_empty,
                SUM(CASE WHEN ce_amt > 0 THEN 1 ELSE 0 END) AS rows_with_ce_amt,
                SUM(CASE WHEN cx_amt > 0 THEN 1 ELSE 0 END) AS rows_with_cx_amt,
                TO_CHAR(MIN(drec), 'YYYY-MM-DD') AS first_drec, TO_CHAR(MAX(drec), 'YYYY-MM-DD') AS last_drec
         FROM {OWNER}.t_cecx_sal_hist"""),
    counts("t_cecx_sal_hist", "asession"),
    counts("t_cecx_sal_hist", "financial_year"),
    counts("t_cecx_sal_hist", "class"),
    counts("t_cecx_sal_hist", "flag"),
    counts("t_cecx_sal_hist", "pay_flag"),
    counts("t_cecx_sal_hist", "checkbox"),
    counts("t_cecx_sal_hist", "sal_code"),
    counts("t_cecx_sal_hist", "ce_amt"),
    counts("t_cecx_sal_hist", "cx_amt"),
    counts("t_cecx_sal_hist", "yr_no"),
    ("T_CECX_SAL_HIST — CEA rows whose child (same employee + date of birth) is / is not in M_FAMILY_DETAIL",
     f"""SELECT CASE WHEN f.ecode IS NULL THEN 'child not in family table' ELSE 'child in family table' END AS val,
                COUNT(*) AS n
         FROM {OWNER}.t_cecx_sal_hist h
         LEFT JOIN (SELECT DISTINCT ecode, dob FROM {OWNER}.m_family_detail) f
           ON f.ecode = h.ecode AND f.dob = h.dob
         GROUP BY CASE WHEN f.ecode IS NULL THEN 'child not in family table' ELSE 'child in family table' END"""),
    ("T_CECX_SAL (current) — totals",
     f"SELECT COUNT(*) AS total_rows FROM {OWNER}.t_cecx_sal"),
    counts("t_cecx_sal_old", "asession"),

    # ── Rate masters (rates only, no people) ──────────────────────────────────
    ("P_GEN_PARAM_SAL — conveyance / patient-care parameters",
     f"""SELECT TO_CHAR(param_fix_dt, 'YYYY-MM-DD') AS fix_dt, conveyance, conveyance1, patient_care, patient_care1, nursing
         FROM {OWNER}.p_gen_param_sal ORDER BY param_fix_dt"""),
    ("M_NPA — all rows",
     f"""SELECT cat_code, cat_name, bsk_lwlmt, bsk_uplmt, TO_CHAR(npa_fix_dt, 'YYYY-MM-DD') AS fix_dt,
                npa_rate, npa_amount, order_no FROM {OWNER}.m_npa"""),
    ("M_HRA_MAST_7CPC — all rows",
     f"""SELECT cat_code, TO_CHAR(hra_fix_dt, 'YYYY-MM-DD') AS fix_dt, bsk_lwlmt, bsk_uplmt, hra_rate, hra_amount,
                order_no, fund_grant FROM {OWNER}.m_hra_mast_7cpc ORDER BY hra_fix_dt, cat_code"""),
    ("M_PCA_MAST_7CPC — all rows",
     f"""SELECT cat_code, TO_CHAR(pca_fix_dt, 'YYYY-MM-DD') AS fix_dt, pay_grade, pca_amt, order_no
         FROM {OWNER}.m_pca_mast_7cpc ORDER BY pca_fix_dt, pay_grade"""),
]

# Fail before connecting if any statement is not a plain SELECT
for _title, _sql in STEPS:
    queries.assert_read_only(_sql)


def main() -> int:
    try:
        import cx_Oracle as ora
    except ImportError:
        import oracledb as ora
    ora.init_oracle_client(lib_dir=CLIENT_DIR)

    user = os.environ.get("ORACLE_USER") or input("Oracle user [AMU_PAY]: ").strip() or "AMU_PAY"
    password = os.environ.get("ORACLE_PASSWORD") or getpass.getpass("Oracle password (not shown, not stored): ")

    out: list[str] = ["Codes and counts in the payroll tables — no personal rows", ""]
    failed = 0
    conn = ora.connect(user=user, password=password, dsn=DSN)
    try:
        # (no call_timeout here: it needs a newer Oracle client than the 11.2 one on this PC)
        cur = conn.cursor()
        cur.execute(queries.READ_ONLY_TRANSACTION)
        for title, sql in STEPS:
            out.append(f"=== {title} ===")
            try:
                cur.execute(queries.assert_read_only(sql))
                out.append(" | ".join(d[0].lower() for d in cur.description))
                for row in cur.fetchall():
                    out.append(" | ".join("" if v is None else str(v) for v in row))
            except Exception as error:  # one missing column must not stop the rest
                failed += 1
                out.append(f"(could not read: {error})")
            out.append("")
    finally:
        conn.close()  # nothing was changed; nothing is committed

    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"Done. {len(STEPS) - failed} of {len(STEPS)} checks read.")
    print(f"Report: {REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
