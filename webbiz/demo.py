"""Sample data for trying the admin UI (`python -m webbiz admin --demo`). Uses its own database."""
from datetime import timedelta

from . import db, outreach, replies, sitegen

LEADS = [
    dict(name="Rosa's Bakery", email="rosa.bakery@example.com", category="shop=bakery", phone="+1 541 555 0100",
         address="12 Oak St", city="Bend", opening_hours="Mo-Fr 07:00-15:00; Sa 08:00-12:00; Su off", lat=44.058, lon=-121.315),
    dict(name="Ace Plumbing & Heating", email="ace.plumbing@example.com", category="craft=plumber",
         phone="(541) 555-0144", city="Bend"),
    dict(name="Luna Hair Studio", email="luna.hair@example.com", category="shop=hairdresser", phone="+1 541 555 0190",
         address="88 Wall St", city="Bend", opening_hours="Tu-Sa 09:00-18:00", lat=44.06, lon=-121.31),
    dict(name="Riverside Dental", email="riverside.dental@example.com", category="amenity=dentist",
         address="5 River Rd", city="Bend", opening_hours="Mo-Th 08:00-17:00; Fr 08:00-13:00"),
    dict(name="Iron Forge Gym", email="ironforge@example.com", category="leisure=fitness_centre", phone="541 555 0111",
         city="Bend", opening_hours="24/7"),
    dict(name="Hartley & Co Accountants", email="hartley.co@example.com", category="office=accountant",
         phone="541 555 0122", address="2 Bond St", city="Bend"),
    dict(name="Quick Fix Auto", email="quickfix.auto@example.com", category="shop=car_repair", phone="541 555 0133",
         city="Bend", opening_hours="Mo-Fr 08:00-18:00"),
    dict(name="Pine Cone Guest House", email="pinecone.stay@example.com", category="tourism=guest_house",
         phone="541 555 0155", address="40 Hill Rd", city="Bend"),
]


def _ago(days, hours=0):
    return (outreach._now() - timedelta(days=days, hours=hours)).isoformat(timespec="seconds")


def seed(conn, cfg, sites_dir):
    if conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]:
        return
    for lead in LEADS:
        db.add_lead(conn, dict(lead, source="demo"))
    sitegen.build(conn, cfg, sites_dir)
    leads = {r["name"]: r for r in conn.execute("SELECT * FROM leads")}

    def sent(name, step, days):
        lead = conn.execute("SELECT * FROM leads WHERE name=?", (name,)).fetchone()
        msg = outreach.compose(lead, cfg, step)
        db.add_message(conn, lead["id"], "out", "outreach" if step == 1 else "followup", msg["Message-ID"],
                       msg["Subject"], msg.get_content(), msg["From"], msg["To"], created_at=_ago(days))
        conn.execute("UPDATE leads SET status='contacted', emails_sent=emails_sent+1, last_emailed_at=? WHERE id=?",
                     (_ago(days), lead["id"]))

    def got(name, body, days, hours=0):
        lead = leads[name]
        msg_id = f"<demo-{lead['id']}-{days}-{hours}@example.com>"
        db.add_message(conn, lead["id"], "in", "inbound", msg_id,
                       "Re: I made a website for " + name, body, f"{name} <{lead['email']}>", cfg["reply_to_email"],
                       created_at=_ago(days, hours), is_read=False)
        row_id = conn.execute("SELECT id FROM messages WHERE message_id=?", (msg_id,)).fetchone()[0]
        replies.process(conn, dict(cfg, anthropic_api_key=""), row_id, log=lambda *a: None)

    for name in ("Rosa's Bakery", "Luna Hair Studio", "Iron Forge Gym", "Hartley & Co Accountants", "Quick Fix Auto"):
        sent(name, 1, 6)
    sent("Iron Forge Gym", 2, 1)
    got("Rosa's Bakery", "Hi! Wow, this looks lovely. How long would it take to get it live? Thanks, Rosa", 0, 3)
    got("Luna Hair Studio", "Love it. We'd want online booking eventually — is that something you do? "
        "Let's talk, call me on 541 555 0190.", 2)
    got("Quick Fix Auto", "Not interested thanks, please remove me.", 3)
    got("Hartley & Co Accountants", "Who are you exactly, and how did you get our email?", 0, 1)
    sent("Riverside Dental", 1, 3)
    got("Riverside Dental", "Thank you for your email. I am out of the office until Monday.", 3, -1)
    conn.execute("UPDATE leads SET status='won' WHERE id=?", (leads["Luna Hair Studio"]["id"],))
    conn.execute("UPDATE messages SET is_read=1, reply_state='replied' WHERE lead_id=?",
                 (leads["Luna Hair Studio"]["id"],))
    conn.execute("UPDATE leads SET notes='Setup fee paid. Waiting on photos.' WHERE id=?",
                 (leads["Luna Hair Studio"]["id"],))
    conn.commit()
