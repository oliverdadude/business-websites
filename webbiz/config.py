import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("WEBBIZ_HOME", Path.cwd()))

DEFAULTS = {
    "business_name": "Your Web Studio",
    "your_name": "Your Name",
    "reply_to_email": "you@example.com",
    "phone": "",
    "postal_address": "",
    "preview_base_url": "",
    "publish_command": "",
    "price_setup": 299,
    "price_monthly": 29,
    "daily_send_limit": 30,
    "min_delay_seconds": 45,
    "max_delay_seconds": 120,
    "followup_after_days": 4,
    "max_emails_per_lead": 2,
    "check_email_domains": True,
    "db_path": "data/leads.db",
    "sites_dir": "output/sites",
}


def load(path=None):
    path = Path(path or ROOT / "config.json")
    cfg = dict(DEFAULTS)
    if path.exists():
        cfg.update(json.loads(path.read_text()))
    # SMTP/IMAP secrets come from the environment only, never from the config file.
    cfg["smtp"] = {
        "host": os.environ.get("SMTP_HOST", ""),
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": os.environ.get("SMTP_USER", ""),
        "password": os.environ.get("SMTP_PASS", ""),
        "from_email": os.environ.get("SMTP_FROM", cfg["reply_to_email"]),
    }
    cfg["imap"] = {
        "host": os.environ.get("IMAP_HOST", ""),
        "user": os.environ.get("IMAP_USER", os.environ.get("SMTP_USER", "")),
        "password": os.environ.get("IMAP_PASS", os.environ.get("SMTP_PASS", "")),
    }
    return cfg


def resolve(cfg, key):
    p = Path(cfg[key])
    return p if p.is_absolute() else ROOT / p
