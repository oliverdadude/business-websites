"""Generate a one-page website for a lead.

The preview is the pitch: the owner opens the email and sees their own business
already online. Pages are single self-contained HTML files, ready for any static host.
"""
import html
import json
import re
import urllib.parse
from pathlib import Path
from string import Template

from . import hours as hours_mod
from .themes import FONTS, icon, theme_for as _theme_for

TEMPLATE = Template((Path(__file__).parent / "templates" / "site.html").read_text())

SERVICES_COPY = {
    "food": ("Something for everyone", "Whether you're stopping by for a quick bite or a proper sit-down, we've got you covered."),
    "beauty": ("Our treatments", "A full range of services in a relaxed, welcoming space."),
    "trades": ("How we can help", "From small fixes to bigger projects — one call and we'll take it from there."),
    "health": ("How we can help", "Professional, personal care for you and your family."),
    "auto": ("Our services", "Everything your vehicle needs, under one roof."),
    "fitness": ("Train with us", "Find the session that suits you and your goals."),
    "stay": ("Your stay", "Everything you need for a relaxing visit."),
    "professional": ("Our services", "Practical expertise, delivered personally."),
    "shop": ("Why visit us", "Friendly, independent and here to help."),
}
CTA_HEADINGS = {
    "food": "Hungry? We'd love to see you.",
    "beauty": "Treat yourself — book your visit.",
    "trades": "Need a job done? Get your free quote.",
    "health": "Ready to book your appointment?",
    "auto": "Book your vehicle in today.",
    "fitness": "Your first step starts here.",
    "stay": "Plan your stay with us.",
    "professional": "Let's talk about how we can help.",
    "shop": "We'd love to hear from you.",
}


def theme_for(category):
    kind, theme = _theme_for(category)
    return dict(theme, kind=kind)


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "business"


def nice_category(category):
    value = (category or "").split("=", 1)[-1].split(";")[0]
    return value.replace("_", " ").strip().capitalize()


def _li(icon_name, label, value_html):
    return (f'<li><span class="ic">{icon(icon_name, 20)}</span>'
            f'<span><small>{label}</small>{value_html}</span></li>')


def render(lead, cfg, final=False):
    """Render a lead's site. final=True drops the "free preview" notice (for delivery)."""
    e = lambda s: html.escape(str(s or ""), quote=True)
    lead = dict(lead)
    theme = theme_for(lead.get("category"))
    kind = theme["kind"]
    # accent_text: a readable-on-white shade for themes whose accent is light (yellow, lime).
    c = {"accent_text": theme["colors"]["accent"], **theme["colors"]}
    display_font, body_font, font_query = FONTS[theme["fonts"]]
    name, city = lead["name"].strip(), (lead.get("city") or "").strip()
    category = nice_category(lead.get("category"))
    in_city = f" in {city}" if city else ""

    phone = (lead.get("phone") or "").split(";")[0].strip()
    phone_digits = re.sub(r"[^\d+]", "", phone)
    email = lead["email"]
    address = (lead.get("address") or "").strip()
    if phone_digits:
        cta_href, cta, cta_short, cta_icon = f"tel:{phone_digits}", theme["cta"], "Call us", icon("phone", 18)
    else:
        cta_href, cta, cta_short, cta_icon = f"mailto:{email}", "Email us", "Email us", icon("mail", 18)

    contact = []
    if phone_digits:
        contact.append(_li("phone", "Phone", f'<a href="tel:{e(phone_digits)}">{e(phone)}</a>'))
    contact.append(_li("mail", "Email", f'<a href="mailto:{e(email)}">{e(email)}</a>'))
    if address or city:
        contact.append(_li("map-pin", "Address", f'<a href="#visit">{e(address or city)}</a>'))

    week = hours_mod.parse(lead.get("opening_hours"))
    if week:
        rows = "".join(f'<tr data-day="{i}"><td>{d}</td><td>{e(t)}</td></tr>' for i, (d, t) in enumerate(week))
        hours_html = f"<table>{rows}</table>"
        status = '<div class="status" id="open-status"><span class="dot"></span><span>Opening hours below</span></div>'
    elif lead.get("opening_hours"):
        hours_html = f'<p class="raw">{e(lead["opening_hours"]).replace(";", "<br>")}</p>'
        status = ""
    else:
        hours_html = (f'<p class="raw">Please get in touch for our current opening hours — '
                      f'<a href="{e(cta_href)}">{e(cta_short.lower())}</a>.</p>')
        status = ""

    lat, lon = lead.get("lat"), lead.get("lon")
    if lat and lon:
        bbox = f"{lon - .006},{lat - .0035},{lon + .006},{lat + .0035}"
        map_html = (f'<iframe title="Map showing {e(name)}" loading="lazy" '
                    f'src="https://www.openstreetmap.org/export/embed.html?bbox={bbox}&amp;layer=mapnik&amp;marker={lat},{lon}">'
                    f'</iframe>')
    else:
        q = urllib.parse.quote_plus(address or f"{name} {city}")
        map_html = (f'<div class="nomap"><div><span class="ic" style="margin:0 auto 14px">{icon("map-pin", 20)}</span>'
                    f'<p style="margin:0 0 6px;color:var(--ink);font-weight:600">{e(address or city or name)}</p>'
                    f'<a href="https://www.openstreetmap.org/search?query={q}" target="_blank" rel="noopener">Open in maps →</a>'
                    f'</div></div>')

    schema = {"@context": "https://schema.org", "@type": "LocalBusiness", "name": name, "email": email}
    if phone:
        schema["telephone"] = phone
    if address or city:
        schema["address"] = {"@type": "PostalAddress", "streetAddress": address, "addressLocality": city}
    if lat and lon:
        schema["geo"] = {"@type": "GeoCoordinates", "latitude": lat, "longitude": lon}

    favicon = urllib.parse.quote(
        f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' "
        f"fill='{c['accent']}'/><text x='32' y='44' font-size='34' font-family='Arial' font-weight='700' "
        f"text-anchor='middle' fill='{c['on_accent']}'>{e(name[:1].upper())}</text></svg>")

    studio = e(cfg["business_name"])
    preview_bar = "" if final else (
        f'<div class="preview-bar">Free website preview made for {e(name)} by {studio}. '
        f'<a href="mailto:{e(cfg["reply_to_email"])}?subject={urllib.parse.quote("Website for " + name)}">'
        f'Make it yours →</a></div>')
    services_title, services_intro = SERVICES_COPY[kind]

    return TEMPLATE.substitute(
        title=e(f"{name} | {category}{in_city}" if category else f"{name}{in_city}"),
        description=e(f"{name}{in_city}. {theme['tagline']}"),
        favicon=favicon,
        font_query=font_query,
        display_font=display_font,
        body_font=body_font,
        schema=json.dumps(schema).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"),
        preview_bar=preview_bar,
        name=e(name),
        initial=e(name[:1].upper()),
        eyebrow=e(" · ".join(filter(None, [category, city])) or "Locally owned"),
        tagline=e(theme["tagline"]),
        cta=e(cta), cta_short=e(cta_short), cta_href=e(cta_href), cta_icon=cta_icon,
        cta_heading=e(CTA_HEADINGS[kind]),
        contact_items="".join(contact),
        status_line=status,
        highlights="".join(f"<li>{icon('check', 22)}{e(h)}</li>" for h in theme["highlights"]),
        services_title=e(services_title),
        services_intro=e(services_intro),
        services="".join(f'<div class="service"><div class="ic">{icon(i, 24)}</div><h3>{e(t)}</h3><p>{e(d)}</p></div>'
                         for i, t, d in theme["services"]),
        about=e(theme["about"].format(name=name, in_city=in_city)),
        panel_line=e(" · ".join(filter(None, [category, city])) or "Independent & locally owned"),
        address_line=e(", ".join(filter(None, [address, city if city not in address else ""]))
                       or "Get in touch and we'll point you in the right direction."),
        hours=hours_html,
        hours_json=json.dumps([t for _, t in week]) if week else "null",
        map=map_html,
        footer_location=e(f" · {city}" if city else ""),
        credit=f"Website by {studio}",
        **c,
    )


def preview_url(cfg, slug):
    base = cfg["preview_base_url"].rstrip("/")
    return f"{base}/{slug}/" if base else ""


def build_one(conn, cfg, sites_dir, lead):
    slug = lead["slug"] or f"{slugify(lead['name'])}-{lead['id']}"
    out = Path(sites_dir) / slug
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(render(lead, cfg), encoding="utf-8")
    status = "site_built" if lead["status"] == "new" else lead["status"]
    conn.execute("UPDATE leads SET slug=?, status=? WHERE id=?", (slug, status, lead["id"]))
    conn.commit()
    return slug


def build(conn, cfg, sites_dir, rebuild=False):
    """Build sites for new leads (and, with rebuild, every lead that already has one). Returns built ids."""
    query = "SELECT * FROM leads WHERE status='new' OR slug IS NOT NULL" if rebuild else \
        "SELECT * FROM leads WHERE status='new'"
    built = []
    for lead in conn.execute(query).fetchall():
        build_one(conn, cfg, sites_dir, lead)
        built.append(lead["id"])
    return built
