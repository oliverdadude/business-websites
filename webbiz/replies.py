"""Understand customer replies and answer them.

Every inbound email from a lead is classified into an intent, gets a drafted reply,
and is either sent automatically (auto mode, safe intents only) or queued for you.

Two engines:
  * rules  - always available: keyword patterns + reply templates built from your settings
  * AI     - optional (`pip install anthropic` + an Anthropic API key): Claude reads the
             whole conversation and drafts a reply from your offer, prices and FAQ

Hard safety rules run *after* either engine and always win: unsubscribes are honoured,
legal threats and complaints go to you, auto-replies are never answered, nobody gets an
automatic reply more than MAX_AUTO_REPLIES times, and nothing is auto-sent unless you chose
auto mode.
"""
import json
import re
from email.utils import parseaddr

from . import db
from .sitegen import preview_url

# key: (label, auto-send allowed, lead status to set, reply needed)
INTENTS = {
    "interested":       ("Interested",          True,  "replied", True),
    "price_question":   ("Asks about price",    True,  "replied", True),
    "what_included":    ("Asks what's included", True, "replied", True),
    "timeline":         ("Asks how long",       True,  "replied", True),
    "who_are_you":      ("Asks who you are",    True,  "replied", True),
    "wants_changes":    ("Wants changes",       True,  "replied", True),
    "domain_hosting":   ("Domain / hosting question", True, "replied", True),
    "wants_call":       ("Wants a call",        False, "replied", True),
    "negotiating":      ("Wants a discount",    False, "replied", True),
    "custom_request":   ("Wants something extra", False, "replied", True),
    "payment_done":     ("Says they paid",      False, "replied", True),
    "wrong_person":     ("Wrong person",        True,  "lost",    True),
    "already_has_site": ("Already has a site",  False, "lost",    False),
    "not_interested":   ("Not interested",      False, "lost",    False),
    "unsubscribe":      ("Unsubscribe",         False, "opted_out", False),
    "complaint":        ("Upset / complaint",   False, "opted_out", False),
    "legal":            ("Legal threat",        False, "opted_out", False),
    "auto_reply":       ("Auto-reply",          False, None,      False),
    "other":            ("Other",               False, "replied", True),
}
HUMAN_ALWAYS = {"complaint", "legal", "payment_done", "negotiating", "custom_request", "wants_call", "other"}
MAX_AUTO_REPLIES = 3

# Checked in order; the first match wins. Patterns are matched against the customer's own words only.
RULES = [
    ("legal", r"\b(lawyer|solicitor|attorney|legal action|sue|suing|report(ing)? you|gdpr|data protection|ico\b|ftc|"
              r"cease and desist|harass)"),
    ("unsubscribe", r"\b(unsubscribe|remove (me|us|my|our)|take (me|us) off|stop (emailing|e-mailing|contacting|"
                    r"messaging|sending)|don'?t (email|contact|message) (me|us)|do not (email|contact)|opt.?out|"
                    r"no more emails)"),
    ("complaint", r"\b(spamm(er|ers|ing)|this is spam|junk mail|reported you|reporting this|annoying|"
                  r"leave (me|us) alone|piss off|f+u+c+k|wtf|how dare)"),
    ("wrong_person", r"\b(wrong (person|address|email|business)|not the owner|no longer (work|works|own)|"
                     r"(doesn'?t|does not|don'?t|do not) work here|left the (company|business)|"
                     r"(new|different) owner|sold the business)"),
    ("already_has_site", r"\b(already (have|got) (a |an )?(web ?site|site|page)|we have a (web ?site|site)|"
                         r"(have|got) someone (doing|for) (that|our|it)|(our|my) (web ?site|site) is (being|under))"),
    ("not_interested", r"\b(not interested|no,? thank|no thanks|not for (us|me)|we'?re (ok|okay|good|fine)|"
                       r"we are (ok|okay|good|fine)|don'?t need|do not need|no need|pass on this|we'?ll pass|"
                       r"not at the moment|not right now|not now)"),
    ("payment_done", r"\b(i'?ve paid|i have paid|just paid|payment (sent|made|done|complete)|paid the|sent the money|"
                     r"transferred)"),
    ("wants_call", r"\b(call me|give me a call|ring me|phone me|can we (talk|chat|speak|meet)|call (us|back)|"
                   r"speak (to|with) you|have a chat|meet up|in person|what'?s your (number|phone))"),
    ("negotiating", r"\b(discount|cheaper|too (much|expensive|pricey)|lower (the )?price|best price|"
                    r"can you do (it )?for|negotiat|budget is|knock (some|a bit) off)"),
    ("custom_request", r"\b(online (shop|store)|e-?commerce|sell online|booking (system|page|form)|"
                       r"book(ing)? online|appointments? online|online ordering|ordering system|members? area|"
                       r"login|blog|multiple pages|logo design|translate|second language|bilingual|app\b|"
                       r"social media|seo package|google ads|newsletter)"),
    ("domain_hosting", r"\b(domain|web address|hosting|my own address|business email|"
                       r"who owns|do i own)"),
    ("price_question", r"(\bhow much|\bprices?\b|\bpricing|\bcosts?\b|\bfees?\b|\bcharge|\bmonthly|"
                       r"\bper month|\ba month\b|\binvoice|\bhidden|[$£€])"),
    ("what_included", r"\b(what'?s included|what is included|what do (i|we) get|include|includes|"
                      r"what does it come with|features)"),
    ("timeline", r"\b(how long|how quickly|how soon|when (can|could|would|will) (it|this|we|you)|turnaround|"
                 r"by (next week|friday|monday|the end)|asap|urgent)"),
    ("who_are_you", r"\b(who (are|is) (you|this)|what company|are you (real|legit|a real)|is this (real|legit|a scam)|"
                    r"what'?s the catch|catch\b|where are you (based|located)|why (did|would) you|"
                    r"how did you (get|find)|scam\b)"),
    ("wants_changes", r"\b(change|changes|different (colou?r|photo|picture|font)|colou?rs?|add (our|my|a|some)|"
                      r"photos?|pictures?|logo|menu|update|edit|instead of|wrong (phone|number|address|hours|time)|"
                      r"(is|are) (wrong|incorrect|out of date)|incorrect|typo|mistake)"),
    ("interested", r"\b(interested|love it|looks (great|good|lovely|amazing|nice|fab)|let'?s do it|go ahead|"
                   r"sign (me|us) up|yes please|sounds good|i'?d like|we'?d like|i want|we want|count (me|us) in|"
                   r"how do (i|we) (start|proceed|get started|pay)|next step|happy to go|let'?s go|i'?m in|"
                   r"great deal|go for it|book (me|us) in)"),
]
_COMPILED = [(k, re.compile(p, re.I)) for k, p in RULES]

AUTO_REPLY_SUBJECT = re.compile(r"^(auto(matic)?[ -]?(reply|response)|out of (the )?office|away|on (holiday|vacation|"
                                r"leave)|i am (away|out)|abwesenheit|absence|r[ée]ponse automatique)", re.I)


OUT_OF_OFFICE = re.compile(r"\b(out of (the )?office|on (annual |maternity |paternity )?(leave|holiday|vacation)|"
                           r"currently (away|out)|away from (the office|my desk)|(will|I'?ll) (be back|return)|"
                           r"limited access to (my )?e-?mail|automatic reply|auto-?reply|this is an automated)", re.I)


def own_words(body):
    """Strip quoted history and signatures so we judge only what the customer wrote."""
    text = re.split(r"\n\s*(?:>|On .{0,200}wrote:|-----\s*Original Message|From: .+\n|Sent from my )", "\n" + body,
                    maxsplit=1)[0]
    return text.strip()


def is_auto_reply(headers, subject):
    auto = (headers.get("Auto-Submitted") or "").lower()
    if auto and auto != "no":
        return True
    if headers.get("X-Autoreply") or headers.get("X-Autorespond") or headers.get("X-Auto-Response-Suppress"):
        return True
    if (headers.get("Precedence") or "").lower() in ("auto_reply", "bulk", "junk", "list"):
        return True
    return bool(AUTO_REPLY_SUBJECT.search((subject or "").removeprefix("Re: ").strip()))


def looks_like_out_of_office(body):
    """Out-of-office messages that don't set the standard headers: short and say so."""
    text = own_words(body)
    return len(text) < 700 and bool(OUT_OF_OFFICE.search(text))


def classify_rules(subject, body):
    text = own_words(body)
    # Short subjects like "Unsubscribe" or "STOP" count as the customer's words too.
    candidates = f"{subject if not subject.lower().startswith('re:') else ''}\n{text}"
    if re.fullmatch(r"\s*(stop|remove|unsubscribe|no)\W*\s*", text, re.I):
        return "unsubscribe" if text.strip().lower().startswith(("stop", "remove", "unsub")) else "not_interested"
    for key, pattern in _COMPILED:
        if pattern.search(candidates):
            return key
    return "other"


# ---------------------------------------------------------------------------------------------
# Reply templates (rules engine). Every template ends with a clear next step.

def _money(v):
    return v if isinstance(v, str) else f"${v:,}"


def facts(cfg, lead):
    return {
        "name": lead["name"],
        "your_name": cfg["your_name"],
        "business": cfg["business_name"],
        "setup": _money(cfg["price_setup"]),
        "monthly": _money(cfg["price_monthly"]),
        "days": cfg["turnaround_days"],
        "preview": preview_url(cfg, lead["slug"]) if lead["slug"] else "",
        "included": cfg["included"].strip(),
        "phone_line": f"\nOr call me on {cfg['phone']}." if cfg["phone"] else "",
        "pay_step": (f"Pay the {_money(cfg['price_setup'])} setup fee here: {cfg['payment_link']}"
                     if cfg["payment_link"] else
                     f"Reply \"go ahead\" and I'll send you an invoice for the {_money(cfg['price_setup'])} setup fee"),
    }


TEMPLATES = {
    "interested": """Hi,

That's great to hear — thank you! Here's how we get {name} live:

1. {pay_step}.
2. Send me any photos, your logo (if you have one) and anything you'd like changed or added.
3. Tell me the web address you'd like (e.g. {slug_example}.com) and I'll check it's available.

Your site will be live within {days} days of getting your details. Hosting is {monthly}/month, starting once it's live — no contract, cancel any time.{phone_line}

Thanks,
{your_name}""",
    "price_question": """Hi,

Thanks for getting back to me! It's {setup} one-off to set up, then {monthly}/month for hosting and updates. No contract — cancel any time and nothing else to pay.

That includes:
{included}

If you'd like to go ahead, just reply and I'll get started — or tell me anything you'd like changed first.{phone_line}

Thanks,
{your_name}""",
    "what_included": """Hi,

Good question! For {setup} setup and {monthly}/month you get:
{included}

You can see the starting point here: {preview}
I'm happy to change anything before it goes live.

Would you like to go ahead?

Thanks,
{your_name}""",
    "timeline": """Hi,

Quick! Once I have your go-ahead and any photos or changes, your site is live within {days} days — often sooner. The preview is already built, so most of the work is done: {preview}

Would you like me to get started?

Thanks,
{your_name}""",
    "who_are_you": """Hi,

Totally fair question! I'm {your_name} and I run {business}, a small web studio helping local businesses get online. I found {name} listed on OpenStreetMap with no website, so I built a preview to show what's possible rather than just sending a sales pitch.

There's no catch and nothing to pay unless you want it: {setup} to set up, {monthly}/month for hosting, cancel any time. Here's the preview again: {preview}{phone_line}

Thanks,
{your_name}""",
    "wants_changes": """Hi,

Absolutely — happy to change that. Just send me what you'd like (text, photos, colours, opening hours, anything) and I'll update the preview so you can see it before deciding. There's no charge for changes before you go ahead.

Thanks,
{your_name}""",
    "domain_hosting": """Hi,

Good question! I'll register a web address for you (e.g. {slug_example}.com) — it's in your name, so you own it, and it's included in the {monthly}/month along with hosting, security and small updates. If you already own a domain, I can use that instead.

Would you like me to check if your preferred address is available?

Thanks,
{your_name}""",
    "wants_call": """Hi,

Of course — happy to have a quick chat. What's the best number and time to reach you?{phone_line}

Thanks,
{your_name}""",
    "negotiating": """Hi,

Thanks for being upfront. The price is {setup} setup and {monthly}/month with no contract, which covers the build, your domain, hosting and updates. Let me know what budget you had in mind and I'll see what I can do.

Thanks,
{your_name}""",
    "custom_request": """Hi,

Yes, that's something I can help with. Let me look into exactly what you need and I'll come back to you with options and a price shortly. In the meantime, could you tell me a bit more about how you'd like it to work?

Thanks,
{your_name}""",
    "payment_done": """Hi,

Thank you! I'll confirm as soon as the payment comes through. Could you send me any photos, your logo, and anything you'd like changed? Your site will be live within {days} days.

Thanks,
{your_name}""",
    "wrong_person": """Hi,

Thanks for letting me know, and sorry to bother you. If you're able to pass this on to whoever looks after {name}, I'd really appreciate it — the preview is here: {preview}

Thanks,
{your_name}""",
    "other": """Hi,

Thanks for getting back to me! I'll take a proper look and reply shortly.

{your_name}""",
}


def draft_from_template(intent, lead, cfg):
    template = TEMPLATES.get(intent)
    if not template:
        return ""
    values = facts(cfg, lead)
    values["slug_example"] = re.sub(r"[^a-z0-9]", "", lead["name"].lower())[:30] or "yourbusiness"
    return template.format(**values)


# ---------------------------------------------------------------------------------------------
# AI engine (optional).

SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": list(INTENTS)},
        "summary": {"type": "string", "description": "One short line: what the customer said/wants."},
        "needs_human": {"type": "boolean"},
        "human_reason": {"type": "string", "description": "Why the owner must look, or empty."},
        "reply_body": {"type": "string", "description": "Plain-text email reply, or empty if no reply should be sent."},
    },
    "required": ["intent", "summary", "needs_human", "human_reason", "reply_body"],
    "additionalProperties": False,
}

SYSTEM = """You handle email replies for {business}, a small web-design studio run by {your_name}. \
{business} found local businesses with no website, built each one a free preview site, and emailed the owner \
the link. You are reading a reply from one of those business owners.

Facts you may use (never invent others):
- Price: {setup} one-off setup, then {monthly}/month for hosting, domain and small updates. No contract; cancel any time.
- What's included:
{included}
- Turnaround: live within {days} days of receiving the go-ahead and details.
- How to pay: {pay_step}.
- Changes to the preview before they decide are free.
- Phone: {phone}
{faq}

Your job: classify the reply, then draft {your_name}'s answer.
- Write like a friendly, competent small-business owner: short, warm, plain text, no markdown, no emojis. \
Start with "Hi," (or their name if they signed it) and sign off as {your_name}.
- Answer exactly what they asked, using only the facts above. Always end with one clear next step.
- Never invent prices, discounts, deadlines, features, guarantees or facts about their business. If they ask \
for something the facts don't cover (a discount, an online shop, a booking system, a specific date, a call at \
a specific time, anything legal or about payment problems), write a helpful holding reply that doesn't commit \
to anything and set needs_human=true with the reason.
- If they ask to stop/unsubscribe, are angry, mention legal action or spam complaints: intent unsubscribe, \
complaint or legal, reply_body empty.
- If it's an automatic out-of-office reply: intent auto_reply, reply_body empty.
- If they're not interested or already have a website: reply_body empty (we respect a no).
- Set needs_human=true whenever you are unsure, the stakes are high, or money has changed hands."""


def ai_available(cfg):
    if not cfg.get("anthropic_api_key"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def classify_ai(cfg, lead, thread, inbound):
    """Ask Claude for intent + draft. Returns a dict matching SCHEMA, or raises."""
    import anthropic

    f = facts(cfg, lead)
    system = SYSTEM.format(
        business=cfg["business_name"], your_name=cfg["your_name"], setup=f["setup"], monthly=f["monthly"],
        included=f["included"], days=f["days"], pay_step=f["pay_step"], phone=cfg["phone"] or "(none given)",
        faq=f"- Extra notes from the owner:\n{cfg['reply_faq'].strip()}" if cfg["reply_faq"].strip() else "")
    history = "\n\n".join(
        f"--- {'FROM ' + cfg['your_name'] if m['direction'] == 'out' else 'FROM THE CUSTOMER'} "
        f"({m['created_at'][:10]}) ---\nSubject: {m['subject']}\n\n{m['body']}" for m in thread)
    user = (f"Business: {lead['name']} ({lead['category'] or 'local business'}, {lead['city'] or 'unknown town'})\n"
            f"Their preview site: {f['preview']}\nLead status: {lead['status']}\n\n"
            f"Conversation so far, oldest first:\n\n{history}\n\n"
            f"=== NEW REPLY TO HANDLE ===\nSubject: {inbound['subject']}\n\n{inbound['body']}")
    client = anthropic.Anthropic(api_key=cfg["anthropic_api_key"])
    response = client.beta.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=system,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": user}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to draft this reply")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("Claude's reply was cut off")
    text = next(b.text for b in response.content if b.type == "text")
    result = json.loads(text)
    if result.get("intent") not in INTENTS:
        raise RuntimeError(f"unexpected intent {result.get('intent')!r}")
    return result


# ---------------------------------------------------------------------------------------------

def process(conn, cfg, message_id, headers=None, log=print, send=None):
    """Classify one stored inbound message, update the lead, draft (and maybe auto-send) a reply.

    `send(lead, subject, body)` sends an email; injected so this module stays testable.
    Returns the decision dict.
    """
    m = conn.execute("SELECT * FROM messages WHERE id=?", (message_id,)).fetchone()
    lead = conn.execute("SELECT * FROM leads WHERE id=?", (m["lead_id"],)).fetchone()
    headers = headers or {}
    rule_intent = classify_rules(m["subject"], m["body"])
    if rule_intent not in ("unsubscribe", "legal", "complaint") and (
            is_auto_reply(headers, m["subject"]) or looks_like_out_of_office(m["body"])):
        rule_intent = "auto_reply"

    engine, summary, human_reason, body = "rules", "", "", ""
    intent = rule_intent
    if rule_intent not in ("auto_reply", "unsubscribe", "legal") and ai_available(cfg):
        thread = conn.execute("SELECT * FROM messages WHERE lead_id=? AND id<? ORDER BY created_at, id",
                              (lead["id"], m["id"])).fetchall()
        try:
            ai = classify_ai(cfg, lead, thread, m)
            engine, intent, summary = "ai", ai["intent"], ai["summary"]
            body = ai["reply_body"].strip()
            if ai["needs_human"]:
                human_reason = ai["human_reason"] or "Claude suggests you check this one"
        except Exception as exc:  # any AI problem: fall back to rules, never lose the message
            log(f"AI drafting failed for {lead['email']} ({exc}); using templates instead")
    # Safety net: the rule engine's "stop" and "legal" verdicts always win.
    if rule_intent in ("unsubscribe", "legal", "complaint") and intent not in ("unsubscribe", "legal", "complaint"):
        intent, body = rule_intent, ""

    label, auto_ok, new_status, reply_needed = INTENTS[intent]
    if engine == "rules" and reply_needed:
        body = draft_from_template(intent, lead, cfg)
    if not reply_needed:
        body = ""
    if intent in HUMAN_ALWAYS and not human_reason:
        human_reason = {"complaint": "They're upset — consider whether to reply personally.",
                        "legal": "Mentions legal action. They've been added to do-not-contact; don't reply without advice.",
                        "payment_done": "Check the payment arrived, then mark the lead Won.",
                        "negotiating": "Decide whether to offer a discount.",
                        "custom_request": "They want something beyond the standard site — quote it yourself.",
                        "wants_call": "They'd like to talk — arrange a call.",
                        "other": "Not sure what they want — please read it."}[intent]
    summary = summary or label

    # Lead status. Don't downgrade a won customer, and keep follow-ups running past auto-replies.
    if intent in ("unsubscribe", "complaint", "legal"):
        db.suppress(conn, lead["email"], "opt-out")
    elif new_status and lead["status"] not in ("won", "opted_out", "bounced"):
        if not (new_status == "replied" and lead["status"] == "replied"):
            db.set_status(conn, lead["id"], new_status)

    # Decide what happens to the reply.
    auto_count = conn.execute("SELECT COUNT(*) FROM messages WHERE lead_id=? AND kind='auto_reply'",
                              (lead["id"],)).fetchone()[0]
    if not reply_needed or not body:
        state = "needs_you" if human_reason and intent in ("complaint", "legal", "payment_done") else "no_reply"
    elif cfg["reply_mode"] == "auto" and auto_ok and not human_reason and auto_count < MAX_AUTO_REPLIES \
            and send is not None and not db.is_suppressed(conn, lead["email"]):
        state = "auto_sent"
    elif human_reason:
        state = "needs_you"
    else:
        state = "needs_reply"
    subject = m["subject"] if m["subject"].lower().startswith("re:") else f"Re: {m['subject']}"
    conn.execute("UPDATE messages SET intent=?, summary=?, needs_human=?, draft_subject=?, draft_body=?, "
                 "reply_state=?, engine=? WHERE id=?",
                 (intent, summary, human_reason, subject, body, state, engine, m["id"]))
    conn.commit()
    if state == "auto_sent":
        try:
            send(lead, subject, body)
            log(f"auto-replied ({label}) -> {lead['email']}")
        except Exception as exc:
            conn.execute("UPDATE messages SET reply_state='needs_reply', needs_human=? WHERE id=?",
                         (f"Automatic reply failed to send: {exc}", m["id"]))
            conn.commit()
            state = "needs_reply"
    return {"intent": intent, "label": label, "state": state, "engine": engine, "summary": summary,
            "needs_human": human_reason, "draft": body}


def header_dict(msg):
    return {k: msg.get(k, "") for k in ("Auto-Submitted", "X-Autoreply", "X-Autorespond",
                                        "X-Auto-Response-Suppress", "Precedence")}


def pending(conn):
    return conn.execute("SELECT COUNT(*) FROM messages WHERE direction='in' AND reply_state IN "
                        "('needs_reply','needs_you')").fetchone()[0]


def sender_of(msg):
    return parseaddr(msg.get("From", ""))[1].lower()
