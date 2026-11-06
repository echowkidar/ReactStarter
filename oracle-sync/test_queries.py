"""Checks that the read-only guard lets our queries through and stops everything else.
Run: python -m unittest test_queries   (runs during the Docker build too)
"""
import unittest

import queries


class ReadOnlyGuard(unittest.TestCase):
    def test_all_queries_pass(self):
        for name, sql in queries.ALL_QUERIES.items():
            with self.subTest(name=name):
                queries.assert_read_only(sql)

    def test_blocks_changes(self):
        bad = [
            "UPDATE amu_pay.m_emp_mast SET emp_name = 'x'",
            "DELETE FROM amu_pay.m_emp_mast",
            "INSERT INTO t VALUES (1)",
            "MERGE INTO t USING s ON (1=1) WHEN MATCHED THEN UPDATE SET a=1",
            "DROP TABLE t",
            "ALTER SESSION SET x=1",
            "TRUNCATE TABLE t",
            "GRANT SELECT ON t TO u",
            "BEGIN NULL; END",
            "SELECT 1 FROM dual; DELETE FROM t",
            "SELECT * FROM t FOR UPDATE",
            "SELECT dbms_random.value FROM dual",
            "WITH x AS (SELECT 1 a FROM dual) SELECT * FROM x WHERE 1=(SELECT 1 FROM dual) /* commit */",
            "  select 1 from dual where exists (select 1 from t) union all select 1 from dual for update",
            "COMMIT",
            "CALL p()",
        ]
        for sql in bad:
            with self.subTest(sql=sql):
                with self.assertRaises(ValueError):
                    queries.assert_read_only(sql)

    def test_only_the_transaction_statement_is_not_a_select(self):
        self.assertEqual(queries.READ_ONLY_TRANSACTION, "SET TRANSACTION READ ONLY")


if __name__ == "__main__":
    unittest.main()
