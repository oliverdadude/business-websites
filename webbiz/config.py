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
    "netlify_site_id": "",
    "price_setup": 299,
    "price_monthly": 29,
    "daily_send_limit": 30,
    "min_delay_seconds": 45,
    "max_delay_seconds": 120,
    "followup_after_days": 4,
    "max_emails_per_lead": 2,
    "check_email_domains": True,
    # Replying to customers (see webbiz/replies.py)
    "reply_mode": "review",          # "review": you approve every reply; "auto": safe replies send themselves
    "payment_link": "",              # e.g. a Stripe Payment Link for the setup fee
    "turnaround_days": 3,
    "included": "- A mobile-friendly website on your own web address (.com)\n"
                "- Your opening hours, contact details, map and services\n"
                "- Showing up properly on Google, with a link from your Google Business Profile\n"
                "- Hosting, security and small updates whenever you need them",
    "reply_faq": "",                 # extra facts for the AI, e.g. "We also do logos for $99."
    "auto_sync_minutes": 10,         # how often the dashboard checks your inbox (0 = off)
    "notify_needs_you": True,        # email yourself when a reply needs your attention
    "db_path": "data/leads.db",
    "sites_dir": "output/sites",
}

# Secrets live in .env (or real environment variables, which take precedence), never in config.json.
SECRET_KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
               "IMAP_HOST", "IMAP_USER", "IMAP_PASS", "NETLIFY_TOKEN", "ANTHROPIC_API_KEY")


def read_env_file(path=None):
    path = Path(path or ROOT / ".env")
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load(path=None):
    path = Path(path or ROOT / "config.json")
    cfg = dict(DEFAULTS)
    if path.exists():
        cfg.update(json.loads(path.read_text(encoding="utf-8")))
    file_env = read_env_file(path.parent / ".env")
    env = lambda key, default="": os.environ.get(key) or file_env.get(key) or default
    cfg["smtp"] = {
        "host": env("SMTP_HOST"),
        "port": int(env("SMTP_PORT", "587")),
        "user": env("SMTP_USER"),
        "password": env("SMTP_PASS"),
        "from_email": env("SMTP_FROM", cfg["reply_to_email"]),
    }
    cfg["imap"] = {
        "host": env("IMAP_HOST"),
        "user": env("IMAP_USER", env("SMTP_USER")),
        "password": env("IMAP_PASS", env("SMTP_PASS")),
    }
    cfg["netlify_token"] = env("NETLIFY_TOKEN")
    cfg["anthropic_api_key"] = env("ANTHROPIC_API_KEY")
    cfg["configured"] = path.exists()
    return cfg


def save(settings=None, secrets=None):
    """Merge settings into config.json and secrets into .env (private to the user's account)."""
    if settings:
        path = ROOT / "config.json"
        current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        current.update({k: v for k, v in settings.items() if k in DEFAULTS})
        path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
    if secrets:
        for key, value in secrets.items():
            if key not in SECRET_KEYS or "\n" in str(value):
                raise ValueError(f"invalid setting {key}")
        env_path = ROOT / ".env"
        values = read_env_file(env_path)
        values.update({k: str(v) for k, v in secrets.items()})
        env_path.write_text("".join(f"{k}={v}\n" for k, v in values.items() if v != ""), encoding="utf-8")
        try:
            env_path.chmod(0o600)
        except OSError:
            pass
        # Keep this running process in step with the file.
        for k, v in secrets.items():
            if v == "":
                os.environ.pop(k, None)
            else:
                os.environ[k] = str(v)


def resolve(cfg, key):
    p = Path(cfg[key])
    return p if p.is_absolute() else ROOT / p
