"""Email leads their preview site, follow up once, and watch the inbox for replies.

Built-in guardrails (keep them — they protect your domain's reputation and keep you
on the right side of CAN-SPAM / GDPR / PECR style rules):
  * dry run by default; nothing is sent without --live
  * daily send cap and randomised delay between emails
  * every email identifies you, includes your postal address and an easy opt-out
  * List-Unsubscribe header; opt-outs and bounces go on a permanent suppression list
  * at most `max_emails_per_lead` emails per business, and none after any reply
"""
import email
import imaplib
import random
import re
import smtplib
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr
from pathlib import Path

from . import db
from .sitegen import nice_category, preview_url

SUBJECTS = {
    1: "I made a website for {name}",
    2: "Re: I made a website for {name}",
}

BODIES = {
    1: """Hi {name} team,

I was looking for {kind_phrase} in {city} and noticed {name} doesn't have a website yet — so I put together a free preview of what one could look like:

{preview_url}

It's yours if you want it. I can put it live on your own web address, add your photos, menu or price list, and make sure you show up when people search on Google.

It's {price_setup} to set up and {price_monthly}/month for hosting and updates — no contracts.

If you'd like it, just reply to this email and I'll take care of the rest.

Thanks,
{your_name}
{business_name}{phone_line}
""",
    2: """Hi again,

Just following up on the free website preview I made for {name}:

{preview_url}

Happy to change anything — colours, wording, photos. If it's not for you, no problem at all, and I won't email again.

{your_name}
{business_name}
""",
}

FOOTER = """
--
{business_name} · {postal_address}
You're receiving this one-off message because {email} is listed publicly as {name}'s contact address. Reply "unsubscribe" and you'll never hear from us again.
"""

OPT_OUT_WORDS = re.compile(r"\b(unsubscribe|remove me|stop|not interested|no thanks|opt.?out)\b", re.I)


def _now():
    return datetime.now(timezone.utc)


def compose(lead, cfg, step):
    category = nice_category(lead["category"] or "").lower()
    ctx = {
        "name": lead["name"],
        "city": lead["city"] or "your area",
        "kind_phrase": f"a local {category}" if category else "local businesses",
        "preview_url": preview_url(cfg, lead["slug"]),
        "price_setup": _money(cfg["price_setup"]),
        "price_monthly": _money(cfg["price_monthly"]),
        "your_name": cfg["your_name"],
        "business_name": cfg["business_name"],
        "phone_line": f"\n{cfg['phone']}" if cfg["phone"] else "",
        "postal_address": cfg["postal_address"],
        "email": lead["email"],
    }
    msg = EmailMessage()
    msg["Subject"] = SUBJECTS[step].format(**ctx)
    msg["From"] = f"{cfg['your_name']} <{cfg['smtp']['from_email']}>"
    msg["To"] = lead["email"]
    msg["Reply-To"] = cfg["reply_to_email"]
    msg["Message-ID"] = make_msgid(domain=cfg["smtp"]["from_email"].split("@")[-1])
    msg["List-Unsubscribe"] = f"<mailto:{cfg['reply_to_email']}?subject=unsubscribe>"
    msg.set_content(BODIES[step].format(**ctx) + FOOTER.format(**ctx))
    return msg


def _money(v):
    return v if isinstance(v, str) else f"${v:,}"


def due(conn, cfg):
    """Leads due an email now, as (lead, step) pairs, first-touch emails first."""
    rows = [(r, 1) for r in conn.execute(
        "SELECT * FROM leads WHERE status='site_built' AND emails_sent=0 ORDER BY id")]
    if cfg["max_emails_per_lead"] >= 2:
        cutoff = (_now() - timedelta(days=cfg["followup_after_days"])).isoformat(timespec="seconds")
        rows += [(r, 2) for r in conn.execute(
            "SELECT * FROM leads WHERE status='contacted' AND emails_sent=1 AND last_emailed_at<=? ORDER BY id",
            (cutoff,))]
    return [(r, s) for r, s in rows if not db.is_suppressed(conn, r["email"])]


def sent_today(conn):
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
    return conn.execute("SELECT COUNT(*) FROM sends WHERE sent_at>=?", (start,)).fetchone()[0]


def check_ready(cfg):
    problems = []
    if not cfg["postal_address"]:
        problems.append("set postal_address in config.json (required by anti-spam law)")
    if not cfg["preview_base_url"]:
        problems.append("set preview_base_url in config.json and publish output/sites there (see README)")
    if "example.com" in cfg["reply_to_email"]:
        problems.append("set reply_to_email in config.json")
    for k in ("host", "user", "password"):
        if not cfg["smtp"][k]:
            problems.append(f"set SMTP_{k.upper() if k != 'password' else 'PASS'} environment variable")
    return problems


def send(conn, cfg, live=False, limit=None, outbox=None, skip_ids=(), log=print, sleep=time.sleep):
    if live:
        problems = check_ready(cfg)
        if problems:
            raise SystemExit("Not ready to send:\n  - " + "\n  - ".join(problems))
    budget = cfg["daily_send_limit"] - sent_today(conn)
    if limit is not None:
        budget = min(budget, limit)
    queue = [(r, s) for r, s in due(conn, cfg) if r["id"] not in skip_ids][:max(budget, 0)]
    if not queue:
        log("Nothing to send (no leads due, or today's limit is reached).")
        return 0

    smtp = None
    if live:
        smtp = smtplib.SMTP(cfg["smtp"]["host"], cfg["smtp"]["port"], timeout=60)
        smtp.starttls()
        smtp.login(cfg["smtp"]["user"], cfg["smtp"]["password"])
    count = 0
    try:
        for i, (lead, step) in enumerate(queue):
            msg = compose(lead, cfg, step)
            if live:
                if i:
                    sleep(random.uniform(cfg["min_delay_seconds"], cfg["max_delay_seconds"]))
                smtp.send_message(msg)
                conn.execute("INSERT INTO sends (lead_id, step, subject, sent_at) VALUES (?,?,?,?)",
                             (lead["id"], step, msg["Subject"], db.now()))
                conn.execute("UPDATE leads SET status='contacted', emails_sent=emails_sent+1, last_emailed_at=? "
                             "WHERE id=?", (db.now(), lead["id"]))
                conn.commit()
                log(f"sent  step {step} -> {lead['email']} ({lead['name']})")
            else:
                if outbox:
                    Path(outbox).mkdir(parents=True, exist_ok=True)
                    (Path(outbox) / f"{lead['id']}-step{step}.eml").write_bytes(bytes(msg))
                log(f"[dry run] step {step} -> {lead['email']} ({lead['name']}): {msg['Subject']}")
            count += 1
    finally:
        if smtp:
            smtp.quit()
    if not live:
        log(f"\n{count} email(s) previewed" + (f" in {outbox}" if outbox else "") + ". Add --live to send for real.")
    return count


def _text_of(msg):
    parts = msg.walk() if msg.is_multipart() else [msg]
    out = []
    for part in parts:
        if part.get_content_type() == "text/plain":
            payload = part.get_payload(decode=True) or b""
            out.append(payload.decode(part.get_content_charset() or "utf-8", "replace"))
    return "\n".join(out)


def classify(msg, lead_emails):
    """Return (lead_email, 'replied'|'opted_out'|'bounced') for an inbound message, or None."""
    sender = parseaddr(msg.get("From", ""))[1].lower()
    subject = msg.get("Subject", "")
    body = _text_of(msg)
    if sender.startswith(("mailer-daemon", "postmaster")) or "delivery status notification" in subject.lower():
        for addr in lead_emails:
            if addr in body.lower():
                return addr, "bounced"
        return None
    if sender in lead_emails:
        # Only look at what they wrote, not our quoted email (which itself says "unsubscribe").
        own_text = re.split(r"\n(?:>|On .+wrote:)", body, maxsplit=1)[0]
        if OPT_OUT_WORDS.search(subject) or OPT_OUT_WORDS.search(own_text):
            return sender, "opted_out"
        return sender, "replied"
    return None


def sync_replies(conn, cfg, log=print):
    imap_cfg = cfg["imap"]
    if not imap_cfg["host"]:
        raise SystemExit("Set IMAP_HOST (and IMAP_USER / IMAP_PASS if different from SMTP) to sync replies.")
    leads = {r["email"].lower(): r for r in conn.execute(
        "SELECT * FROM leads WHERE status IN ('contacted','replied')")}
    if not leads:
        log("No contacted leads to check.")
        return {}
    since = min(r["last_emailed_at"] or db.now() for r in leads.values())[:10]
    since_imap = datetime.fromisoformat(since).strftime("%d-%b-%Y")
    results = {}
    with imaplib.IMAP4_SSL(imap_cfg["host"]) as box:
        box.login(imap_cfg["user"], imap_cfg["password"])
        box.select("INBOX", readonly=True)
        _, data = box.search(None, f'(SINCE "{since_imap}")')
        for num in data[0].split():
            _, parts = box.fetch(num, "(BODY.PEEK[])")
            hit = classify(email.message_from_bytes(parts[0][1]), leads)
            if hit:
                results[hit[0]] = hit[1] if results.get(hit[0]) != "opted_out" else "opted_out"
    for addr, outcome in results.items():
        if outcome in ("opted_out", "bounced"):
            db.suppress(conn, addr, "bounce" if outcome == "bounced" else "opt-out")
        elif leads[addr]["status"] == "contacted":
            db.set_status(conn, leads[addr]["id"], "replied")
        log(f"{outcome:9} {addr} ({leads[addr]['name']})")
    log(f"{len(results)} lead(s) updated from the inbox.")
    return results
