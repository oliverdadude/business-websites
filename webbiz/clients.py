"""After the yes: get paid, put the site live, and look after the customer.

1. **Payment.** "Connect Stripe" in Settings creates one Stripe Payment Link that charges your
   setup fee plus the monthly subscription. Every business gets its own copy of the link
   (tagged with its lead id), so webbiz knows exactly who paid.
2. **Go live.** As soon as a payment shows up (checked with every inbox sync), the business
   becomes a client: its final site (no preview banner, visible to Google) is published on its own
   Netlify site, and a welcome email goes out with the live link and the next steps.
3. **Domain.** Type the customer's domain on their page: webbiz attaches it to their site and can
   email them the two DNS settings to change. Netlify then adds HTTPS by itself.
4. **Billing.** Subscriptions are checked too: if a card fails or someone cancels, the client is
   flagged and you get an email.

Without Stripe you can still click "Mark as paid" (bank transfer, cash, PayPal...) and the
rest happens the same way.
"""
import io
import json
import re
import secrets as _secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from . import config, db, outreach, publish, sitegen

STRIPE_API = "https://api.stripe.com/v1"
NETLIFY_LOAD_BALANCER = "75.2.60.5"  # Netlify's address for apex (example.com) A records
DOMAIN_RE = re.compile(r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
REF_RE = re.compile(r"^webbiz-(\d+)$")

WELCOME = """Hi,

Thank you, your payment has come through. Welcome aboard!

{name}'s website is now live here:
{live_url}

What happens next:

1. Send me anything you'd like added or changed: photos, your logo, your menu or price list, and
   any wording. Just reply to this email. Small updates are included every month.
2. Your own web address: {domain_step}
3. Add the link to your Google Business Profile ("Website" field) so customers find it on Google Maps.

Your hosting is {monthly}/month, billed automatically. No contract, so you can cancel any time.

Thanks again,
{your_name}
{business}{phone_line}
"""

DNS_EMAIL = """Hi,

Here's how to point {domain} at your new website. Log in wherever you bought the domain
(GoDaddy, Namecheap, Google/Squarespace Domains...), open the DNS settings and set:

  Type   Name   Value
  A      @      {ip}
  CNAME  www    {target}

Remove any other A record for "@" if there is one. Changes usually take under an hour, and the
padlock (https) is added automatically once they're through.

If you'd rather I do it, you can add me as a delegate on the account, or just send me a
screenshot of the DNS page and I'll tell you exactly what to click.

{your_name}
{business}
"""


def _money(cfg, amount):
    symbol = {"usd": "$", "cad": "$", "aud": "$", "nzd": "$", "gbp": "£", "eur": "€"}.get(cfg["currency"], "")
    amount = int(amount) if float(amount).is_integer() else round(float(amount), 2)
    return f"{symbol}{amount:,}" if symbol else f"{amount:,} {cfg['currency'].upper()}"


# ---- Stripe ------------------------------------------------------------------------------------
def _form(params, prefix=""):
    """Encode nested dicts/lists the way Stripe expects (line_items[0][price]=...)."""
    items = []
    for key, value in params.items():
        name = f"{prefix}[{key}]" if prefix else key
        if isinstance(value, dict):
            items += _form(value, name)
        elif isinstance(value, list):
            for i, item in enumerate(value):
                items += _form(item, f"{name}[{i}]") if isinstance(item, dict) else [(f"{name}[{i}]", str(item))]
        elif isinstance(value, bool):
            items.append((name, "true" if value else "false"))
        elif value is not None:
            items.append((name, str(value)))
    return items


def stripe(cfg, method, path, params=None):
    if not cfg.get("stripe_key"):
        raise ValueError("Add your Stripe secret key in Settings first.")
    data = urllib.parse.urlencode(_form(params or {}))
    url = f"{STRIPE_API}{path}"
    body = None
    if method == "GET":
        url += ("?" + data) if data else ""
    else:
        body = data.encode()
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {cfg['stripe_key']}", "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "webbiz"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            message = json.loads(exc.read())["error"]["message"]
        except Exception:
            message = exc.reason
        if exc.code == 401:
            raise ValueError("Stripe rejected the key. Copy the secret key (sk_live_... or sk_test_...) "
                             "from dashboard.stripe.com/apikeys.") from None
        raise RuntimeError(f"Stripe error {exc.code}: {message}") from None


def price_signature(cfg):
    return f"{cfg['currency']}:{cfg['price_setup']}/{cfg['price_monthly']}"


def connect_stripe(cfg):
    """Create the product, prices and Payment Link for the current prices. Returns the link URL."""
    setup, monthly = int(cfg["price_setup"]), int(cfg["price_monthly"])
    if not setup and not monthly:
        raise ValueError("Set a setup or monthly price first.")
    product = stripe(cfg, "POST", "/products", {
        "name": f"Website by {cfg['business_name']}",
        "description": "Your business website: design, hosting, security and small updates."})
    items = []
    if setup:
        price = stripe(cfg, "POST", "/prices", {"product": product["id"], "currency": cfg["currency"],
                                                "unit_amount": setup * 100, "nickname": "Website setup"})
        items.append({"price": price["id"], "quantity": 1})
    if monthly:
        price = stripe(cfg, "POST", "/prices", {"product": product["id"], "currency": cfg["currency"],
                                                "unit_amount": monthly * 100, "nickname": "Hosting & updates",
                                                "recurring": {"interval": "month"}})
        items.append({"price": price["id"], "quantity": 1})
    link = stripe(cfg, "POST", "/payment_links", {
        "line_items": items,
        "after_completion": {"type": "hosted_confirmation", "hosted_confirmation": {
            "custom_message": f"Thank you! {cfg['your_name']} will email you within the hour with your live "
                              f"website link and the next steps."}},
        "metadata": {"app": "webbiz"}})
    old = cfg.get("stripe_payment_link_id")
    if old and old != link["id"]:
        try:  # retire the link with the old prices
            stripe(cfg, "POST", f"/payment_links/{old}", {"active": False})
        except Exception:
            pass
    values = {"stripe_payment_link_url": link["url"], "stripe_payment_link_id": link["id"],
              "stripe_link_prices": price_signature(cfg)}
    config.save(values)
    cfg.update(values)
    return link["url"]


def pay_url(cfg, lead):
    """This business's own payment link (tagged so the payment is matched to them automatically)."""
    base = cfg.get("stripe_payment_link_url") or cfg.get("payment_link") or ""
    if not base:
        return ""
    if "stripe.com" in base:
        sep = "&" if "?" in base else "?"
        base += sep + urllib.parse.urlencode({"client_reference_id": f"webbiz-{lead['id']}",
                                              "prefilled_email": lead["email"]})
    return base


def _lead_for_session(conn, session):
    ref = REF_RE.match(session.get("client_reference_id") or "")
    if ref:
        row = conn.execute("SELECT * FROM leads WHERE id=?", (int(ref[1]),)).fetchone()
        if row:
            return row
    email = ((session.get("customer_details") or {}).get("email") or session.get("customer_email") or "").strip()
    if email:
        return conn.execute("SELECT * FROM leads WHERE email=?", (email,)).fetchone()
    return None


def check_payments(conn, cfg, log=print):
    """Find new completed Stripe checkouts and onboard each one. Returns the lead ids onboarded."""
    if not cfg.get("stripe_key"):
        return []
    started = int(time.time())
    since = int(db.get_meta(conn, "stripe_checked", started - 30 * 86400)) - 3600
    new, params = [], {"status": "complete", "limit": 100, "created": {"gte": since}}
    while True:
        page = stripe(cfg, "GET", "/checkout/sessions", params)
        for session in page.get("data", []):
            if session.get("payment_status") not in ("paid", "no_payment_required"):
                continue
            if conn.execute("SELECT 1 FROM clients WHERE stripe_session=?", (session["id"],)).fetchone():
                continue
            lead = _lead_for_session(conn, session)
            if not lead:
                if (session.get("metadata") or {}).get("app") == "webbiz" or session.get("client_reference_id"):
                    log(f"Payment {session['id']} couldn't be matched to a lead. Check it in Stripe.")
                continue
            if conn.execute("SELECT 1 FROM clients WHERE lead_id=?", (lead["id"],)).fetchone():
                continue  # already a client (e.g. marked paid by hand)
            record_payment(conn, cfg, lead["id"], via="stripe", amount=(session.get("amount_total") or 0) / 100,
                           session=session["id"], customer=session.get("customer") or "",
                           subscription=session.get("subscription") or "")
            log(f"Payment received from {lead['name']} ({_money(cfg, (session.get('amount_total') or 0) / 100)}).")
            new.append(lead["id"])
        if not page.get("has_more") or not page.get("data"):
            break
        params = dict(params, starting_after=page["data"][-1]["id"])
    db.set_meta(conn, "stripe_checked", started)
    for lead_id in new:
        onboard(conn, cfg, lead_id, log=log)
    return new


BILLING = {"active": "active", "trialing": "active", "past_due": "past_due", "unpaid": "past_due",
           "incomplete": "past_due", "paused": "past_due", "canceled": "cancelled",
           "incomplete_expired": "cancelled"}


def check_subscriptions(conn, cfg, log=print):
    """Update each client's billing state from Stripe; email you about anyone who stopped paying."""
    if not cfg.get("stripe_key"):
        return []
    changed = []
    for c in conn.execute("SELECT c.*, l.name FROM clients c JOIN leads l ON l.id=c.lead_id WHERE "
                          "c.stripe_subscription != '' AND c.billing != 'cancelled'").fetchall():
        try:
            sub = stripe(cfg, "GET", f"/subscriptions/{c['stripe_subscription']}")
        except RuntimeError as exc:
            log(f"Couldn't check {c['name']}'s subscription: {exc}")
            continue
        billing = BILLING.get(sub.get("status"), c["billing"])
        if billing != c["billing"]:
            conn.execute("UPDATE clients SET billing=? WHERE lead_id=?", (billing, c["lead_id"]))
            conn.commit()
            log(f"{c['name']}: billing is now {billing.replace('_', ' ')}.")
            changed.append((c["name"], billing))
    if changed and not outreach.check_ready(cfg, for_outreach=False):
        msg = EmailMessage()
        msg["Subject"] = f"webbiz: billing changed for {len(changed)} client{'s' if len(changed) > 1 else ''}"
        msg["From"] = f"webbiz <{cfg['smtp']['from_email']}>"
        msg["To"] = cfg["reply_to_email"]
        msg.set_content("\n".join(
            f"- {name}: " + {"past_due": "their payment failed. Stripe retries automatically; you may want "
                                         "to check in with them.",
                             "cancelled": "they cancelled. Decide whether to take the site down.",
                             "active": "payments are back to normal."}[b] for name, b in changed))
        try:
            smtp = outreach._smtp(cfg)
            try:
                smtp.send_message(msg)
            finally:
                smtp.quit()
        except Exception as exc:
            log(f"Couldn't email you about billing: {exc}")
    return changed


# ---- Becoming a client ---------------------------------------------------------------------------
def record_payment(conn, cfg, lead_id, via="manual", amount=None, session=None, customer="", subscription=""):
    amount = cfg["price_setup"] + cfg["price_monthly"] if amount is None else amount
    conn.execute(
        "INSERT OR IGNORE INTO clients (lead_id, paid_via, setup_paid, monthly, stripe_session, stripe_customer, "
        "stripe_subscription, paid_at) VALUES (?,?,?,?,?,?,?,?)",
        (lead_id, via, float(amount), float(cfg["price_monthly"]), session, customer, subscription, db.now()))
    conn.execute("UPDATE leads SET status='won' WHERE id=?", (lead_id,))
    # Their earlier "I've paid" emails don't need you any more.
    conn.execute("UPDATE messages SET reply_state='replied' WHERE lead_id=? AND direction='in' AND "
                 "intent='payment_done' AND reply_state IN ('needs_reply','needs_you')", (lead_id,))
    conn.commit()


def get(conn, lead_id):
    row = conn.execute("SELECT * FROM clients WHERE lead_id=?", (lead_id,)).fetchone()
    return dict(row) if row else None


def _site_zip(page, final=True):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("index.html", page)
        zf.writestr("robots.txt", "User-agent: *\nAllow: /\n" if final else publish.ROBOTS)
    return buf.getvalue()


def go_live(conn, cfg, lead_id, log=print):
    """Publish (or re-publish) the client's final site on its own Netlify site. Returns the live URL."""
    lead = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
    client = get(conn, lead_id)
    if not client:
        raise ValueError("Mark this business as paid first.")
    page = sitegen.render(lead, cfg, final=True)
    slug = lead["slug"] or f"{sitegen.slugify(lead['name'])}-{lead['id']}"
    out = config.ROOT / "output" / "live" / slug
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page, encoding="utf-8")
    if not cfg.get("netlify_token"):
        raise ValueError(f"Final site saved to output/live/{slug}/. Connect Netlify in Settings to put it "
                         f"online automatically.")
    site_id, url = client["site_id"], client["live_url"]
    if not site_id:
        base = sitegen.slugify(lead["name"])[:40]
        for attempt in range(5):
            name = base + ("" if attempt == 0 else f"-{_secrets.token_hex(2)}")
            try:
                site = publish._netlify(cfg, "POST", "/sites", json.dumps({"name": name}).encode())
                break
            except RuntimeError as exc:
                if "422" not in str(exc):
                    raise
        else:
            raise RuntimeError("Couldn't find a free Netlify site name.")
        site_id = site["id"]
        url = (site.get("ssl_url") or site.get("url") or f"https://{name}.netlify.app").rstrip("/")
        conn.execute("UPDATE clients SET site_id=?, live_url=? WHERE lead_id=?", (site_id, url, lead_id))
        conn.commit()
    publish._netlify(cfg, "POST", f"/sites/{site_id}/deploys", _site_zip(page), "application/zip")
    if client["domain"]:
        url = f"https://{client['domain']}"
    conn.execute("UPDATE clients SET live_url=?, went_live_at=COALESCE(went_live_at, ?), last_error='' "
                 "WHERE lead_id=?", (url, db.now(), lead_id))
    conn.commit()
    log(f"{lead['name']} is live at {url}")
    return url


def send_welcome(conn, cfg, lead_id):
    lead = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
    client = get(conn, lead_id)
    if not client or not client["live_url"]:
        raise ValueError("Put the site live first.")
    domain_step = (f"{client['domain']} is being connected now. I'll confirm once it's working."
                   if client["domain"] else
                   "if you already own a domain (like yourbusiness.com), reply with it and I'll send the two "
                   "settings to change. If not, tell me the name you'd like and I'll register it for you.")
    body = WELCOME.format(name=lead["name"], live_url=client["live_url"], domain_step=domain_step,
                          monthly=_money(cfg, cfg["price_monthly"]), your_name=cfg["your_name"],
                          business=cfg["business_name"], phone_line=f"\n{cfg['phone']}" if cfg["phone"] else "")
    outreach.send_reply(conn, cfg, lead, f"{lead['name']} is live", body, kind="welcome")
    conn.execute("UPDATE clients SET welcome_sent_at=? WHERE lead_id=?", (db.now(), lead_id))
    conn.commit()


def onboard(conn, cfg, lead_id, log=print):
    """Everything after payment, each step safe to retry: put the site live, then send the welcome email."""
    client = get(conn, lead_id)
    errors = []
    if not client["went_live_at"]:
        try:
            go_live(conn, cfg, lead_id, log=log)
        except Exception as exc:
            errors.append(f"Going live: {exc}")
    client = get(conn, lead_id)
    if client["live_url"] and not client["welcome_sent_at"]:
        try:
            send_welcome(conn, cfg, lead_id)
            log("Welcome email sent.")
        except (Exception, SystemExit) as exc:
            errors.append(f"Welcome email: {exc}")
    conn.execute("UPDATE clients SET last_error=? WHERE lead_id=?", (" ".join(errors), lead_id))
    conn.commit()
    for e in errors:
        log(e)
    return get(conn, lead_id)


def mark_paid(conn, cfg, lead_id, amount=None, log=print):
    if get(conn, lead_id):
        raise ValueError("This business is already a client.")
    record_payment(conn, cfg, lead_id, via="manual", amount=amount)
    return onboard(conn, cfg, lead_id, log=log)


def redeploy_if_live(conn, cfg, lead_id, log=print):
    """After editing a client's details, push the new version to their live site."""
    client = get(conn, lead_id)
    if client and client["site_id"] and cfg.get("netlify_token"):
        go_live(conn, cfg, lead_id, log=log)
        return True
    return False


# ---- Domains -------------------------------------------------------------------------------------
def clean_domain(domain):
    domain = re.sub(r"^https?://", "", (domain or "").strip().lower()).split("/")[0]
    domain = domain.removeprefix("www.")
    if not DOMAIN_RE.match(domain):
        raise ValueError("Enter a domain like rosasbakery.com")
    return domain


def set_domain(conn, cfg, lead_id, domain, email_client=False):
    """Attach the customer's own domain to their site; returns the DNS records they need to set."""
    client = get(conn, lead_id)
    if not client:
        raise ValueError("Mark this business as paid first.")
    domain = clean_domain(domain)
    target = "your-site.netlify.app"
    if client["site_id"]:
        site = publish._netlify(cfg, "PATCH", f"/sites/{client['site_id']}",
                                json.dumps({"custom_domain": domain}).encode())
        target = site.get("default_domain") or target
    conn.execute("UPDATE clients SET domain=?, live_url=? WHERE lead_id=?", (domain, f"https://{domain}", lead_id))
    conn.commit()
    records = [("A", "@", NETLIFY_LOAD_BALANCER), ("CNAME", "www", target)]
    if email_client:
        lead = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
        outreach.send_reply(conn, cfg, lead, f"Connecting {domain} to your website", DNS_EMAIL.format(
            domain=domain, ip=records[0][2], target=records[1][2], your_name=cfg["your_name"],
            business=cfg["business_name"]), kind="dns")
    return {"domain": domain, "records": records}


# ---- Overview ------------------------------------------------------------------------------------
def overview(conn, cfg):
    rows = [dict(r) for r in conn.execute(
        "SELECT c.*, l.name, l.email, l.category, l.city, l.slug FROM clients c JOIN leads l ON l.id=c.lead_id "
        "ORDER BY c.paid_at DESC")]
    paying = [r for r in rows if r["billing"] == "active"]
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    return {
        "clients": rows,
        "paying": len(paying),
        "mrr": sum(r["monthly"] for r in paying),
        "collected": sum(r["setup_paid"] for r in rows),
        "this_month": sum(r["setup_paid"] for r in rows if r["paid_at"].startswith(month)),
        "attention": sum(1 for r in rows if r["last_error"] or r["billing"] == "past_due" or not r["live_url"]),
        "currency": cfg["currency"],
        "stripe": bool(cfg.get("stripe_key") and cfg.get("stripe_payment_link_url")),
    }


def sync(conn, cfg, log=print):
    """Payments and subscriptions, for the inbox sync and the daily run."""
    if not cfg.get("stripe_key"):
        return
    try:
        if cfg.get("stripe_payment_link_url") and cfg.get("stripe_link_prices") != price_signature(cfg):
            connect_stripe(cfg)
            log("Your prices changed, so a new payment link was created.")
        new = check_payments(conn, cfg, log=log)
        check_subscriptions(conn, cfg, log=log)
        log(f"Payments checked: {len(new)} new client{'s' if len(new) != 1 else ''}.")
    except (ValueError, RuntimeError, OSError) as exc:
        log(f"Couldn't check payments: {exc}")
