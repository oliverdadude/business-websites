"""Generate a one-page preview website for a lead.

The preview is the pitch: the owner opens the email and sees their own business
already online. Pages are single self-contained HTML files, ready for any static host.
"""
import html
import re
import urllib.parse
from pathlib import Path
from string import Template

TEMPLATE = Template((Path(__file__).parent / "templates" / "site.html").read_text())

# (match on category value) -> theme
THEMES = [
    (("restaurant", "cafe", "bakery", "fast_food", "bar", "pub", "ice_cream", "deli", "butcher",
      "confectionery", "pastry", "food", "coffee", "biergarten"),
     {"accent": "#c2410c", "accent2": "#fde68a", "kind": "food",
      "tagline": "Fresh, local and made with care.",
      "services": ["Dine in", "Takeaway", "Catering & events"],
      "cta": "Call to order"}),
    (("hairdresser", "beauty", "nails", "massage", "cosmetics", "tattoo", "barber", "spa"),
     {"accent": "#be185d", "accent2": "#fbcfe8", "kind": "beauty",
      "tagline": "Look good. Feel better.",
      "services": ["Cuts & styling", "Treatments", "Walk-ins welcome"],
      "cta": "Book an appointment"}),
    (("plumber", "electrician", "carpenter", "builder", "roofer", "painter", "hvac", "locksmith",
      "gardener", "handicraft", "tiler", "glaziery", "stonemason", "craft", "hardware", "doityourself"),
     {"accent": "#1d4ed8", "accent2": "#bfdbfe", "kind": "trades",
      "tagline": "Reliable local work, done right the first time.",
      "services": ["Free quotes", "Repairs & installs", "Emergency call-outs"],
      "cta": "Get a free quote"}),
    (("dentist", "doctor", "doctors", "clinic", "pharmacy", "physiotherapist", "optician",
      "veterinary", "healthcare", "chemist", "medical", "psychotherapist"),
     {"accent": "#0f766e", "accent2": "#99f6e4", "kind": "health",
      "tagline": "Friendly, professional care close to home.",
      "services": ["New patients welcome", "Appointments", "Personal care"],
      "cta": "Make an appointment"}),
    (("car_repair", "car", "tyres", "motorcycle", "car_wash", "fuel", "bicycle"),
     {"accent": "#b91c1c", "accent2": "#fecaca", "kind": "auto",
      "tagline": "Keeping you on the road.",
      "services": ["Servicing", "Repairs", "Honest pricing"],
      "cta": "Book a service"}),
    (("fitness", "sports_centre", "gym", "yoga", "dance", "sports"),
     {"accent": "#7c3aed", "accent2": "#ddd6fe", "kind": "fitness",
      "tagline": "Stronger every week.",
      "services": ["Classes", "Personal training", "Memberships"],
      "cta": "Try a free session"}),
    (("hotel", "guest_house", "hostel", "apartment", "camp_site", "motel", "bed_and_breakfast"),
     {"accent": "#0369a1", "accent2": "#bae6fd", "kind": "stay",
      "tagline": "Your home away from home.",
      "services": ["Comfortable rooms", "Great location", "Warm welcome"],
      "cta": "Check availability"}),
    (("accountant", "lawyer", "estate_agent", "insurance", "consulting", "financial", "tax_advisor",
      "architect", "notary"),
     {"accent": "#334155", "accent2": "#cbd5e1", "kind": "professional",
      "tagline": "Expert advice you can trust.",
      "services": ["Free consultation", "Personal service", "Local experience"],
      "cta": "Book a consultation"}),
]
DEFAULT_THEME = {"accent": "#047857", "accent2": "#a7f3d0", "kind": "shop",
                 "tagline": "Proudly serving our local community.",
                 "services": ["Friendly service", "Quality you can trust", "Locally owned"],
                 "cta": "Get in touch"}


def theme_for(category):
    value = category.split("=", 1)[-1].lower()
    for keys, theme in THEMES:
        if any(k in value for k in keys):
            return theme
    return DEFAULT_THEME


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "business"


def nice_category(category):
    return category.split("=", 1)[-1].replace("_", " ").replace(";", ", ").title() if category else ""


def render(lead, cfg):
    e = lambda s: html.escape(str(s or ""), quote=True)
    theme = theme_for(lead["category"] or "")
    name = lead["name"]
    location = lead["city"] or ""
    services = "".join(f"<li>{e(s)}</li>" for s in theme["services"])
    phone_digits = re.sub(r"[^\d+]", "", lead["phone"] or "")
    if phone_digits:
        cta_href, contact_phone = f"tel:{phone_digits}", f'<h3>Phone</h3><p><a href="tel:{phone_digits}">{e(lead["phone"])}</a></p>'
    else:
        cta_href, contact_phone = f"mailto:{lead['email']}", ""
    map_q = urllib.parse.quote_plus(lead["address"] or f"{name} {location}")
    hours = lead["opening_hours"] or ""
    hours_html = (f"<h3>Opening hours</h3><p>{e(hours).replace(';', '<br>')}</p>" if hours else "")
    return TEMPLATE.substitute(
        name=e(name),
        initial=e(name.strip()[:1].upper()),
        category=e(nice_category(lead["category"] or "")),
        location=e(location),
        in_location=e(f" in {location}" if location else ""),
        tagline=e(theme["tagline"]),
        services=services,
        cta=e(theme["cta"] if phone_digits else "Email us"),
        cta_href=e(cta_href),
        accent=theme["accent"],
        accent2=theme["accent2"],
        kind=theme["kind"],
        email=e(lead["email"]),
        phone=contact_phone,
        address=e(lead["address"]),
        hours=hours_html,
        map_url=f"https://www.openstreetmap.org/search?query={map_q}",
        studio=e(cfg["business_name"]),
        studio_email=e(cfg["reply_to_email"]),
    )


def preview_url(cfg, slug):
    base = cfg["preview_base_url"].rstrip("/")
    return f"{base}/{slug}/" if base else ""


def build(conn, cfg, sites_dir, rebuild=False, lead_ids=None):
    sites_dir = Path(sites_dir)
    query = "SELECT * FROM leads WHERE status IN ('new','site_built')" if rebuild else \
        "SELECT * FROM leads WHERE status='new'"
    built = []
    for lead in conn.execute(query).fetchall():
        if lead_ids and lead["id"] not in lead_ids:
            continue
        slug = lead["slug"] or f"{slugify(lead['name'])}-{lead['id']}"
        out = sites_dir / slug
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(render(lead, cfg), encoding="utf-8")
        conn.execute("UPDATE leads SET slug=?, status='site_built' WHERE id=?", (slug, lead["id"]))
        built.append(lead["id"])
    conn.commit()
    return built

