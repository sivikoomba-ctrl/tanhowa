"""
Database Backup Tool for TANHOWA
Exports all tables as JSON files to .tmp/backups/

Usage:
  python tools/backup_database.py
  python tools/backup_database.py --tables users,subscriptions
"""

import os
import json
import sys
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Load env from tanhowa/.env.local
env_path = Path(__file__).parent.parent / ".env.local"
load_dotenv(env_path)

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

ALL_TABLES = [
    "users", "announcements", "events", "documents", "grievances",
    "subscriptions", "teams", "team_members", "todos", "todo_notes",
    "todo_attachments", "todo_vouchers", "todo_time_entries",
    "expense_vouchers", "resolutions", "resolution_votes",
    "contributions", "audit_logs", "notification_prefs",
    "polls", "poll_votes", "faqs", "food_vendors", "food_items",
    "food_orders", "food_order_items", "content_translations",
    "wishlist_ideas", "wishlist_upvotes", "site_settings",
    "trainings", "training_enrollments", "analytics_events",
]


def backup_table(sb, table_name, backup_dir):
    """Fetch all rows from a table and save as JSON."""
    try:
        data = []
        offset = 0
        batch_size = 1000
        while True:
            result = sb.table(table_name).select("*").range(offset, offset + batch_size - 1).execute()
            rows = result.data or []
            data.extend(rows)
            if len(rows) < batch_size:
                break
            offset += batch_size

        file_path = backup_dir / f"{table_name}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str, ensure_ascii=False)

        print(f"  {table_name}: {len(data)} rows")
        return len(data)
    except Exception as e:
        print(f"  {table_name}: ERROR - {e}")
        return 0


def main():
    # Parse --tables argument
    tables = ALL_TABLES
    for arg in sys.argv[1:]:
        if arg.startswith("--tables="):
            tables = arg.split("=")[1].split(",")

    # Create backup directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = Path(__file__).parent.parent / ".tmp" / "backups" / timestamp
    backup_dir.mkdir(parents=True, exist_ok=True)

    print(f"TANHOWA Database Backup")
    print(f"Backup to: {backup_dir}")
    print(f"Tables: {len(tables)}")
    print()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    total_rows = 0

    for table in tables:
        total_rows += backup_table(sb, table, backup_dir)

    # Write manifest
    manifest = {
        "timestamp": timestamp,
        "tables": len(tables),
        "total_rows": total_rows,
        "backup_dir": str(backup_dir),
    }
    with open(backup_dir / "_manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDone! {total_rows} total rows backed up to {backup_dir}")


if __name__ == "__main__":
    main()
