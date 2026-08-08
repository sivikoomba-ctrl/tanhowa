"""
Diagnostic audit for Ship 3 (AI Subtask Breakdown + AI Completion Drafter)
and Telegram adoption telemetry.

Shipped commits:
  6fe39ba  Ship 3a/3b — POST /api/todos/suggest-subtasks + POST /api/todos/draft-report
  b416b3d  Connect-Telegram CTA banner on /dashboard

Usage:
  python tools/audit_ship3.py
  python tools/audit_ship3.py --dry-run
  python tools/audit_ship3.py --json-out /tmp/ship3_out.json

Requires: requests, python-dotenv  (no other deps)
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ENV_PATH = Path(__file__).parent.parent / ".env.local"
load_dotenv(ENV_PATH)

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

REST_BASE = f"{SUPABASE_URL}/rest/v1"

_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Accept": "application/json",
}

SHIP3A_COMMIT = "6fe39ba"
SHIP3B_COMMIT = "b416b3d"
BASELINE_DATE = "2026-05-01"
AI_ROUTE_PREFIXES = (
    "/api/todos/suggest-subtasks",
    "/api/todos/draft-report",
)


def _iso_minus_7d() -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=7)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# PostgREST helpers (sb_secret_* keys rejected by supabase-py 2.9.1 — use
# requests directly, same pattern as other scripts in this directory)
# ---------------------------------------------------------------------------

def _get_count(table: str, params: dict) -> int:
    """Return exact row count without downloading body."""
    headers = {**_HEADERS, "Prefer": "count=exact", "Range": "0-0"}
    resp = requests.get(
        f"{REST_BASE}/{table}",
        headers=headers,
        params={**params, "select": "id"},
    )
    resp.raise_for_status()
    cr = resp.headers.get("Content-Range", "")
    if "/" in cr:
        total_part = cr.split("/")[1]
        if total_part.isdigit():
            return int(total_part)
    return 0


def _get_rows(table: str, params: dict) -> list:
    """Fetch all matching rows, paginated in 1 000-row batches."""
    url = f"{REST_BASE}/{table}"
    rows: list = []
    offset = 0
    batch = 1000
    while True:
        resp = requests.get(
            url,
            headers=_HEADERS,
            params={**params, "offset": offset, "limit": batch},
        )
        resp.raise_for_status()
        page = resp.json()
        rows.extend(page)
        if len(page) < batch:
            break
        offset += batch
    return rows


# ---------------------------------------------------------------------------
# Section a — Telegram adoption
# ---------------------------------------------------------------------------

def section_telegram_adoption() -> dict:
    print("\n=== a) Telegram Adoption ===")
    count = _get_count(
        "users",
        {"status": "eq.approved", "telegram_chat_id": "not.is.null"},
    )
    print(f"Linked: {count} (was 0 on {BASELINE_DATE})")
    return {"linked_count": count, "baseline": 0, "baseline_date": BASELINE_DATE}


# ---------------------------------------------------------------------------
# Section b — Subtasks created in last 7 days
# ---------------------------------------------------------------------------

def section_subtasks_last_7d() -> dict:
    print("\n=== b) Subtasks Created (last 7 days) ===")
    since = _iso_minus_7d()
    rows = _get_rows(
        "todos",
        {
            "select": "id,created_at,event_id",
            "parent_id": "not.is.null",
            "created_at": f"gte.{since}",
            "order": "created_at.asc",
        },
    )

    by_date: dict[str, int] = defaultdict(int)
    for r in rows:
        by_date[r["created_at"][:10]] += 1

    total = len(rows)
    print(f"Total: {total}")
    if by_date:
        print(f"{'Date':<12} {'Count':>6}")
        print("-" * 20)
        for date in sorted(by_date):
            print(f"{date:<12} {by_date[date]:>6}")
    else:
        print("  (none in window)")

    return {"total": total, "by_date": dict(sorted(by_date.items()))}


# ---------------------------------------------------------------------------
# Section c — Report-type notes in last 7 days, top 10 by member
# ---------------------------------------------------------------------------

def section_report_notes_last_7d() -> dict:
    print("\n=== c) Completion Reports Submitted (last 7 days, top 10) ===")
    since = _iso_minus_7d()
    notes = _get_rows(
        "todo_notes",
        {
            "select": "id,user_id,created_at",
            "type": "eq.report",
            "created_at": f"gte.{since}",
        },
    )

    user_counts: dict[str, int] = defaultdict(int)
    for n in notes:
        user_counts[n["user_id"]] += 1

    # Resolve names in a single batched request
    user_names: dict[str, str] = {}
    if user_counts:
        uid_list = ",".join(user_counts.keys())
        users = _get_rows(
            "users",
            {"select": "id,name", "id": f"in.({uid_list})"},
        )
        user_names = {u["id"]: (u.get("name") or "(unnamed)") for u in users}

    top10 = sorted(user_counts.items(), key=lambda x: -x[1])[:10]

    print(f"Total report notes: {len(notes)}")
    if top10:
        print(f"{'Member':<30} {'Count':>6}")
        print("-" * 38)
        for uid, cnt in top10:
            name = user_names.get(uid, uid[:8])
            print(f"{name:<30} {cnt:>6}")
    else:
        print("  (none in window)")

    return {
        "total": len(notes),
        "top10": [
            {"user_id": uid, "name": user_names.get(uid, ""), "count": cnt}
            for uid, cnt in top10
        ],
    }


# ---------------------------------------------------------------------------
# Section d — Failures on the two AI routes in last 7 days
# ---------------------------------------------------------------------------

def section_failures_last_7d() -> dict:
    print("\n=== d) AI Route Failures (last 7 days) ===")
    since = _iso_minus_7d()

    # Fetch recent error_logs and filter in Python to avoid URL-encoding
    # complexity with OR queries across PostgREST versions.
    rows = _get_rows(
        "error_logs",
        {
            "select": "id,path,message,created_at",
            "created_at": f"gte.{since}",
            "order": "created_at.desc",
        },
    )

    matched = [
        r for r in rows
        if r.get("path") and any(
            r["path"].startswith(p) for p in AI_ROUTE_PREFIXES
        )
    ]

    by_route: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in matched:
        route = r["path"].split("?")[0]
        msg = (r.get("message") or "(no message)")[:120]
        by_route[route][msg] += 1

    total = len(matched)
    print(f"Total failures: {total}")
    if by_route:
        for route in sorted(by_route):
            print(f"\n  {route}")
            for msg, cnt in sorted(by_route[route].items(), key=lambda x: -x[1]):
                print(f"    [{cnt}x] {msg}")
    else:
        print("  (none — routes appear healthy)")

    return {
        "total": total,
        "by_route": {
            route: [{"message": msg, "count": cnt} for msg, cnt in msgs.items()]
            for route, msgs in by_route.items()
        },
    }


# ---------------------------------------------------------------------------
# Section e — Final markdown summary
# ---------------------------------------------------------------------------

def print_summary(
    tg: dict,
    subtasks: dict,
    reports: dict,
    failures: dict,
) -> list[str]:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [
        f"**Ship 3 + TG Audit — {today}**",
        f"- Telegram linked members: {tg['linked_count']} (baseline 0 on {BASELINE_DATE})",
        f"- AI subtasks created (7d): {subtasks['total']}",
        f"- Completion reports submitted (7d): {reports['total']}",
        f"- AI route errors (7d): {failures['total']}",
        f"- Commits: {SHIP3A_COMMIT} (subtask AI + drafter), {SHIP3B_COMMIT} (TG CTA)",
    ]
    print("\n=== e) Summary ===")
    for line in lines:
        print(line)
    return lines


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit Ship 3 AI features and Telegram adoption"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip writing JSON output",
    )
    parser.add_argument(
        "--json-out",
        default=str(
            Path(__file__).parent.parent / ".tmp" / "ship3_audit.json"
        ),
        help="Path to write JSON results (default: .tmp/ship3_audit.json)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    print("TANHOWA — Ship 3 + Telegram Adoption Audit")
    print(f"Env : {ENV_PATH}")
    print(f"Host: {SUPABASE_URL}")

    tg = section_telegram_adoption()
    subtasks = section_subtasks_last_7d()
    reports = section_report_notes_last_7d()
    failures = section_failures_last_7d()
    summary_lines = print_summary(tg, subtasks, reports, failures)

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "telegram_adoption": tg,
        "subtasks_7d": subtasks,
        "report_notes_7d": reports,
        "failures_7d": failures,
        "summary": summary_lines,
    }

    if not args.dry_run:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\nJSON written to: {out_path}")
    else:
        print("\n[dry-run] JSON write skipped.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
