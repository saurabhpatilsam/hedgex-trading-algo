"""
Data Migration Script: SQLite → PostgreSQL (v2)

Handles SQLite→PostgreSQL type differences:
  - Boolean columns: SQLite stores 0/1, PostgreSQL needs True/False
  - Foreign keys: Temporarily disabled during migration
  - Sequences: Reset to max(id)+1 after migration

Usage:
  DATABASE_URL=postgresql://postgres.your-tenant-id:PASSWORD@host:5432/postgres python migrate_data.py
"""

import os
import sys

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import Base
import models
import models_market_data


# Boolean columns per table (SQLite stores as 0/1, PostgreSQL requires bool)
BOOLEAN_COLUMNS = {
    "users": [],
    "broker_credentials": ["is_active"],
    "groups": ["is_active"],
    "accounts": ["is_active"],
    "instruments": ["is_active"],
    "active_strategies": ["paper_mode"],
    "system_alerts": ["is_read"],
    "group_orders": [],
    "trades": [],
    "order_records": [],
}


def migrate():
    target_url = os.getenv("DATABASE_URL")
    if not target_url or target_url.startswith("sqlite"):
        print("❌ Set DATABASE_URL to your PostgreSQL connection string")
        sys.exit(1)

    source_url = "sqlite:///./hedging.db"
    
    print(f"📦 Source: {source_url}")
    print(f"🎯 Target: PostgreSQL @ {target_url.split('@')[-1] if '@' in target_url else '***'}")
    print()

    src_engine = create_engine(source_url, connect_args={"check_same_thread": False})
    tgt_engine = create_engine(target_url, pool_pre_ping=True)

    SrcSession = sessionmaker(bind=src_engine)
    TgtSession = sessionmaker(bind=tgt_engine)

    # Create all tables in target
    print("🔧 Creating tables in PostgreSQL...")
    Base.metadata.create_all(bind=tgt_engine)
    print("   ✅ Tables created")
    print()

    # Tables in strict dependency order
    table_order = [
        "users",
        "broker_credentials",
        "groups",
        "instruments",
        "accounts",
        "group_memberships",
        "group_orders",
        "trades",
        "active_strategies",
        "order_records",
        "audit_log",
        "system_alerts",
        "request_logs",
        "tick_data",
        "candle_data",
        "data_collection_jobs",
    ]

    src_session = SrcSession()
    tgt_session = TgtSession()

    existing_src_tables = inspect(src_engine).get_table_names()

    # Disable FK constraints temporarily
    print("🔓 Disabling FK constraints...")
    tgt_session.execute(text("SET session_replication_role = 'replica'"))
    tgt_session.commit()

    total_migrated = 0

    for table_name in table_order:
        if table_name not in existing_src_tables:
            print(f"   ⏭️  {table_name}: not in source")
            continue

        try:
            result = src_session.execute(text(f"SELECT * FROM {table_name}"))
            columns = list(result.keys())
            rows = result.fetchall()
        except Exception as e:
            print(f"   ⚠️  {table_name}: error reading — {e}")
            continue

        if not rows:
            print(f"   📭 {table_name}: empty")
            continue

        # Clear target table
        try:
            tgt_session.execute(text(f"DELETE FROM {table_name}"))
            tgt_session.commit()
        except Exception:
            tgt_session.rollback()

        # Get boolean columns for this table
        bool_cols = BOOLEAN_COLUMNS.get(table_name, [])

        inserted = 0
        for row in rows:
            row_dict = dict(zip(columns, row))
            
            # Convert SQLite integers (0/1) to Python booleans for boolean columns
            for col in bool_cols:
                if col in row_dict and row_dict[col] is not None:
                    row_dict[col] = bool(row_dict[col])

            cols_str = ", ".join(f'"{k}"' for k in row_dict.keys())
            placeholders = ", ".join([f":{k}" for k in row_dict.keys()])
            insert_sql = text(f'INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders})')
            
            try:
                tgt_session.execute(insert_sql, row_dict)
                inserted += 1
            except Exception as e:
                tgt_session.rollback()
                # Re-disable FK constraints after rollback
                tgt_session.execute(text("SET session_replication_role = 'replica'"))
                tgt_session.commit()
                err_msg = str(e).split('\n')[0][:120]
                print(f"   ⚠️  {table_name} row {inserted}: {err_msg}")
                continue

        tgt_session.commit()

        # Reset PostgreSQL sequence
        try:
            max_id = tgt_session.execute(text(f"SELECT MAX(id) FROM {table_name}")).scalar()
            if max_id is not None:
                seq_name = f"{table_name}_id_seq"
                tgt_session.execute(text(f"SELECT setval('{seq_name}', {max_id})"))
                tgt_session.commit()
        except Exception:
            tgt_session.rollback()

        total_migrated += inserted
        print(f"   ✅ {table_name}: {inserted}/{len(rows)} rows")

    # Re-enable FK constraints
    print()
    print("🔒 Re-enabling FK constraints...")
    tgt_session.execute(text("SET session_replication_role = 'origin'"))
    tgt_session.commit()

    print()
    print(f"🎉 Migration complete! {total_migrated} total rows.")

    # Verify
    print()
    print("🔍 Verification:")
    for table_name in table_order:
        if table_name not in existing_src_tables:
            continue
        try:
            src_count = src_session.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
            tgt_count = tgt_session.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
            status = "✅" if src_count == tgt_count else "⚠️ "
            print(f"   {status} {table_name}: SQLite={src_count}, PG={tgt_count}")
        except Exception as e:
            print(f"   ⚠️  {table_name}: {e}")

    src_session.close()
    tgt_session.close()


if __name__ == "__main__":
    migrate()
