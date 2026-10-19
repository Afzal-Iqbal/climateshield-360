#!/usr/bin/env python3
"""
Inspect the DuckDB warehouse and print every table/view with columns, types, and row count.
Always connects in read-only mode.
"""

import os
import sys
from pathlib import Path
import duckdb

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "pipeline" / "data" / "processed" / "climateshield.duckdb"


def inspect_warehouse(db_path: Path) -> None:
    print(f"Connecting to DuckDB: {db_path} (read-only)")
    if not db_path.exists():
        print(f"ERROR: Database file does not exist at {db_path}", file=sys.stderr)
        sys.exit(1)

    con = duckdb.connect(str(db_path), read_only=True)
    try:
        # Get all user tables and views
        tables_df = con.execute("""
            SELECT table_schema, table_name, table_type
            FROM information_schema.tables
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
            ORDER BY table_type, table_schema, table_name;
        """).fetchdf()

        if tables_df.empty:
            print("No tables or views found.")
            return

        print(f"\nFound {len(tables_df)} table(s) / view(s):\n" + "=" * 80)

        for _, row in tables_df.iterrows():
            schema = row["table_schema"]
            name = row["table_name"]
            table_type = row["table_type"]
            full_table_ref = f'"{schema}"."{name}"' if schema != "main" else f'"{name}"'

            # Row count
            try:
                count_res = con.execute(f"SELECT count(*) FROM {full_table_ref}").fetchone()
                row_count = count_res[0] if count_res else 0
            except Exception as e:
                row_count = f"Error counting rows: {e}"

            print(f"\n[{table_type}] {schema}.{name}  (Rows: {row_count})")
            print("-" * 80)

            # Columns and data types
            cols = con.execute(f"""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = '{schema}' AND table_name = '{name}'
                ORDER BY ordinal_position;
            """).fetchall()

            for col_name, data_type, nullable in cols:
                null_str = "NULL" if nullable == "YES" else "NOT NULL"
                print(f"  - {col_name:<30} {data_type:<20} {null_str}")

        print("\n" + "=" * 80)
        print("Inspection completed successfully.")
    finally:
        con.close()


def main():
    if len(sys.argv) > 1:
        db_path = Path(sys.argv[1]).resolve()
    else:
        env_path = os.getenv("CLIMATESHIELD_DB")
        if env_path:
            db_path = Path(env_path).resolve()
        else:
            db_path = DEFAULT_DB_PATH.resolve()

    inspect_warehouse(db_path)


if __name__ == "__main__":
    main()
