import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    opening_hours TEXT DEFAULT '',
    lat REAL,
    lon REAL,
    slug TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    emails_sent INTEGER NOT NULL DEFAULT 0,
    last_emailed_at TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppressions (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    reason TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sends (
    id INTEGER PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    step INTEGER NOT NULL,
    subject TEXT,
    sent_at TEXT NOT NULL
);
"""

# Lead lifecycle: new -> site_built -> contacted -> (replied | opted_out | bounced | won | lost)
STATUSES = ("new", "site_built", "contacted", "replied", "opted_out", "bounced", "won", "lost", "skipped")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def add_lead(conn, lead):
    """Insert a lead; returns True if new. Duplicate emails are ignored."""
    fields = ["source", "source_id", "name", "email", "category", "phone", "address",
              "city", "opening_hours", "lat", "lon"]
    values = [lead.get(f) if f in ("lat", "lon") else (lead.get(f) or "") for f in fields]
    cur = conn.execute(
        f"INSERT OR IGNORE INTO leads ({','.join(fields)}, created_at) "
        f"VALUES ({','.join('?' * len(fields))}, ?)",
        values + [now()],
    )
    conn.commit()
    return cur.rowcount == 1


def suppress(conn, email, reason):
    conn.execute("INSERT OR REPLACE INTO suppressions VALUES (?, ?, ?)", (email.strip(), reason, now()))
    status = "bounced" if reason == "bounce" else "opted_out"
    conn.execute("UPDATE leads SET status=? WHERE email=?", (status, email.strip()))
    conn.commit()


def is_suppressed(conn, email):
    return conn.execute("SELECT 1 FROM suppressions WHERE email=?", (email,)).fetchone() is not None


def set_status(conn, lead_id, status):
    if status not in STATUSES:
        raise ValueError(f"unknown status {status!r}; choose from {', '.join(STATUSES)}")
    conn.execute("UPDATE leads SET status=? WHERE id=?", (status, lead_id))
    conn.commit()
