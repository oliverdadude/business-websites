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
-- Every email to or from a lead: the admin mailbox reads from here.
-- kind: outreach | followup | reply (all outgoing) | inbound | bounce
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id),
    direction TEXT NOT NULL CHECK (direction IN ('out', 'in')),
    kind TEXT NOT NULL,
    subject TEXT DEFAULT '',
    body TEXT DEFAULT '',
    from_addr TEXT DEFAULT '',
    to_addr TEXT DEFAULT '',
    message_id TEXT UNIQUE,
    in_reply_to TEXT DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_lead ON messages(lead_id, created_at);
"""

# Columns added after the first release; added to existing databases on connect.
# reply_state for inbound mail: needs_reply | needs_you | auto_sent | replied | no_reply | dismissed
MIGRATIONS = {
    "messages": [("intent", "TEXT DEFAULT ''"), ("summary", "TEXT DEFAULT ''"), ("needs_human", "TEXT DEFAULT ''"),
                 ("draft_subject", "TEXT DEFAULT ''"), ("draft_body", "TEXT DEFAULT ''"),
                 ("reply_state", "TEXT DEFAULT ''"), ("engine", "TEXT DEFAULT ''")],
}

# Lead lifecycle: new -> site_built -> contacted -> (replied | opted_out | bounced | won | lost)
STATUSES = ("new", "site_built", "contacted", "replied", "opted_out", "bounced", "won", "lost", "skipped")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    for table, columns in MIGRATIONS.items():
        have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
        for name, decl in columns:
            if name not in have:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
    conn.commit()
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


def add_message(conn, lead_id, direction, kind, msg_id, subject="", body="", from_addr="", to_addr="",
                in_reply_to="", created_at=None, is_read=None):
    """Store an email; returns False if this Message-ID is already stored."""
    cur = conn.execute(
        "INSERT OR IGNORE INTO messages (lead_id, direction, kind, subject, body, from_addr, to_addr, message_id, "
        "in_reply_to, is_read, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (lead_id, direction, kind, subject, body, from_addr, to_addr, msg_id, in_reply_to,
         int(direction == "out") if is_read is None else int(is_read), created_at or now()))
    conn.commit()
    return cur.rowcount == 1
