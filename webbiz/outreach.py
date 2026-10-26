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
from email.header import decode_header, make_header
from email.utils import make_msgid, parseaddr, parsedate_to_datetime
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
    """Cold emails (first touch + follow-up) sent since midnight UTC. Manual replies don't count."""
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
    return conn.execute("SELECT COUNT(*) FROM messages WHERE direction='out' AND kind IN ('outreach','followup') "
                        "AND created_at>=?", (start,)).fetchone()[0]


def check_ready(cfg, for_outreach=True):
    problems = []
    if for_outreach:
        if not cfg["postal_address"]:
            problems.append("Add your postal address — required by anti-spam law (Settings → Your business)")
        if not cfg["preview_base_url"]:
            problems.append("Connect website hosting so preview links work (Settings → Website hosting)")
    if "example.com" in cfg["reply_to_email"]:
        problems.append("Add your business email (Settings → Your business)")
    if not all(cfg["smtp"][k] for k in ("host", "user", "password")):
        problems.append("Connect your email account (Settings → Email account, or SMTP_HOST / SMTP_USER / "
                        "SMTP_PASS in .env)")
    return problems


def _smtp(cfg):
    smtp = smtplib.SMTP(cfg["smtp"]["host"], cfg["smtp"]["port"], timeout=60)
    smtp.starttls()
    smtp.login(cfg["smtp"]["user"], cfg["smtp"]["password"])
    return smtp


def test_smtp(cfg):
    """Send a test email to yourself. Raises with a readable message on failure."""
    msg = EmailMessage()
    msg["Subject"] = "webbiz test email"
    msg["From"] = f"{cfg['your_name']} <{cfg['smtp']['from_email']}>"
    msg["To"] = cfg["reply_to_email"]
    msg.set_content("It works! webbiz can send email from this account.")
    smtp = _smtp(cfg)
    try:
        smtp.send_message(msg)
    finally:
        smtp.quit()
    return cfg["reply_to_email"]


def test_imap(cfg):
    """Log in to the inbox and count messages."""
    with imaplib.IMAP4_SSL(cfg["imap"]["host"]) as box:
        box.login(cfg["imap"]["user"], cfg["imap"]["password"])
        _, data = box.select("INBOX", readonly=True)
        return int(data[0])


def _record_sent(conn, lead_id, kind, msg):
    db.add_message(conn, lead_id, "out", kind, msg["Message-ID"], msg["Subject"], msg.get_content(),
                   msg["From"], msg["To"], msg.get("In-Reply-To", ""))


def queue(conn, cfg, limit=None, skip_ids=()):
    """What `send` would send right now, honouring the daily limit."""
    budget = cfg["daily_send_limit"] - sent_today(conn)
    if limit is not None:
        budget = min(budget, limit)
    return [(r, s) for r, s in due(conn, cfg) if r["id"] not in skip_ids][:max(budget, 0)]


def send(conn, cfg, live=False, limit=None, outbox=None, skip_ids=(), log=print, sleep=time.sleep):
    if live:
        problems = check_ready(cfg)
        if problems:
            raise SystemExit("Not ready to send:\n  - " + "\n  - ".join(problems))
    todo = queue(conn, cfg, limit, skip_ids)
    if not todo:
        log("Nothing to send (no leads due, or today's limit is reached).")
        return 0

    smtp = _smtp(cfg) if live else None
    count = 0
    try:
        for i, (lead, step) in enumerate(todo):
            msg = compose(lead, cfg, step)
            if live:
                if i:
                    sleep(random.uniform(cfg["min_delay_seconds"], cfg["max_delay_seconds"]))
                smtp.send_message(msg)
                _record_sent(conn, lead["id"], "outreach" if step == 1 else "followup", msg)
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


def send_reply(conn, cfg, lead, subject, body):
    """Send a hand-written email to a lead (from the admin mailbox), threaded onto their last message."""
    problems = check_ready(cfg, for_outreach=False)
    if problems:
        raise SystemExit("Not ready to send:\n  - " + "\n  - ".join(problems))
    last_in = conn.execute("SELECT message_id FROM messages WHERE lead_id=? AND direction='in' "
                           "ORDER BY created_at DESC LIMIT 1", (lead["id"],)).fetchone()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg['your_name']} <{cfg['smtp']['from_email']}>"
    msg["To"] = lead["email"]
    msg["Reply-To"] = cfg["reply_to_email"]
    msg["Message-ID"] = make_msgid(domain=cfg["smtp"]["from_email"].split("@")[-1])
    if last_in and last_in["message_id"]:
        msg["In-Reply-To"] = msg["References"] = last_in["message_id"]
    msg.set_content(body)
    smtp = _smtp(cfg)
    try:
        smtp.send_message(msg)
    finally:
        smtp.quit()
    _record_sent(conn, lead["id"], "reply", msg)
    return msg


def _text_of(msg):
    parts = msg.walk() if msg.is_multipart() else [msg]
    out = []
    for part in parts:
        if part.get_content_type() == "text/plain":
            payload = part.get_payload(decode=True) or b""
            out.append(payload.decode(part.get_content_charset() or "utf-8", "replace"))
    if not out:  # HTML-only email: strip tags for a readable fallback
        for part in parts if msg.is_multipart() else [msg]:
            if part.get_content_type() == "text/html":
                raw = (part.get_payload(decode=True) or b"").decode(part.get_content_charset() or "utf-8", "replace")
                out.append(re.sub(r"\n\s*\n+", "\n\n", re.sub(r"<[^>]+>", "", re.sub(r"(?i)<br\s*/?>|</p>", "\n", raw))))
    return "\n".join(out).strip()


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


def _decode(value):
    return str(make_header(decode_header(value or "")))


def _date_of(msg):
    try:
        return parsedate_to_datetime(msg["Date"]).astimezone(timezone.utc).isoformat(timespec="seconds")
    except Exception:
        return db.now()


def ingest(conn, raw, leads):
    """Store one inbound email if it's from (or bounced from) a lead and update the lead. Returns outcome or None."""
    msg = email.message_from_bytes(raw)
    hit = classify(msg, leads)
    if not hit:
        return None
    addr, outcome = hit
    lead = leads[addr]
    msg_id = msg.get("Message-ID") or f"<no-id-{hash(raw)}@webbiz>"
    is_new = db.add_message(conn, lead["id"], "in", "bounce" if outcome == "bounced" else "inbound", msg_id,
                            _decode(msg.get("Subject")), _text_of(msg), _decode(msg.get("From")),
                            _decode(msg.get("To")), msg.get("In-Reply-To", ""), _date_of(msg))
    if not is_new:
        return None  # already processed on an earlier sync; don't override manual status changes
    if outcome in ("opted_out", "bounced"):
        db.suppress(conn, addr, "bounce" if outcome == "bounced" else "opt-out")
    elif lead["status"] in ("site_built", "contacted"):
        db.set_status(conn, lead["id"], "replied")
    return outcome


def sync_replies(conn, cfg, log=print):
    imap_cfg = cfg["imap"]
    if not imap_cfg["host"]:
        raise SystemExit("Set IMAP_HOST (and IMAP_USER / IMAP_PASS if different from SMTP) to sync replies.")
    leads = {r["email"].lower(): r for r in conn.execute(
        "SELECT * FROM leads WHERE id IN (SELECT lead_id FROM messages WHERE direction='out')")}
    if not leads:
        log("No contacted leads to check.")
        return {}
    first_sent = conn.execute("SELECT MIN(created_at) FROM messages WHERE direction='out'").fetchone()[0]
    since_imap = (datetime.fromisoformat(first_sent) - timedelta(days=1)).strftime("%d-%b-%Y")
    results = {}
    with imaplib.IMAP4_SSL(imap_cfg["host"]) as box:
        box.login(imap_cfg["user"], imap_cfg["password"])
        box.select("INBOX", readonly=True)
        _, data = box.search(None, f'(SINCE "{since_imap}")')
        for num in data[0].split():
            _, parts = box.fetch(num, "(BODY.PEEK[])")
            raw = parts[0][1]
            outcome = ingest(conn, raw, leads)
            if outcome:
                addr = classify(email.message_from_bytes(raw), leads)[0]
                results[addr] = outcome if results.get(addr) != "opted_out" else "opted_out"
    for addr, outcome in results.items():
        log(f"{outcome:9} {addr} ({leads[addr]['name']})")
    log(f"{len(results)} lead(s) updated from the inbox.")
    return results
