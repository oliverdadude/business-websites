"""Find local businesses that list a public email but no website, using OpenStreetMap.

OpenStreetMap data is open (ODbL). We use the public Nominatim geocoder and the
Overpass API, both of which ask for a descriptive User-Agent and gentle usage.
"""
import json
import time
import urllib.parse
import urllib.request

from . import db

NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = "https://overpass-api.de/api/interpreter"

# Free mailbox providers: an address here says nothing about whether the business has a site.
FREE_MAIL = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk",
    "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com",
    "proton.me", "protonmail.com", "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com",
    "yandex.com", "yandex.ru", "zoho.com", "btinternet.com", "sky.com", "comcast.net",
    "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "orange.fr", "free.fr",
    "libero.it", "t-online.de", "bigpond.com", "optusnet.com.au", "shaw.ca", "rogers.com",
}

# Things in OSM that have an email but aren't customers for a small-business website.
EXCLUDED = {
    "amenity": {"school", "townhall", "place_of_worship", "police", "fire_station", "library",
                "university", "college", "kindergarten", "post_office", "courthouse", "prison",
                "public_building", "community_centre", "social_facility", "hospital",
                "parking", "toilets", "bench", "waste_basket", "recycling"},
    "office": {"government", "diplomatic", "political_party", "religion", "association", "ngo"},
}
BUSINESS_KEYS = ("shop", "amenity", "craft", "office", "tourism", "healthcare", "leisure", "beauty")


def _get(url, user_agent, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def geocode(area, user_agent):
    q = urllib.parse.urlencode({"q": area, "format": "json", "limit": 1})
    results = _get(f"{NOMINATIM}?{q}", user_agent)
    if not results:
        raise SystemExit(f"Could not find a place called {area!r}")
    return float(results[0]["lat"]), float(results[0]["lon"])


def build_query(lat, lon, radius_m):
    no_site = '[!"website"][!"contact:website"][!"url"]'
    around = f"(around:{radius_m},{lat},{lon})"
    return (
        "[out:json][timeout:120];("
        f'nwr{around}["name"]["email"]{no_site};'
        f'nwr{around}["name"]["contact:email"]{no_site};'
        ");out center tags;"
    )


def category_of(tags):
    for key in BUSINESS_KEYS:
        if key in tags:
            return f"{key}={tags[key]}"
    return ""


def is_business(tags):
    if not any(k in tags for k in BUSINESS_KEYS):
        return False
    for key, banned in EXCLUDED.items():
        if tags.get(key) in banned:
            return False
    return True


def first_email(tags):
    raw = tags.get("email") or tags.get("contact:email") or ""
    email = raw.split(";")[0].split(",")[0].strip().removeprefix("mailto:")
    return email if "@" in email and "." in email.split("@")[-1] else ""


def element_to_lead(el):
    tags = el.get("tags", {})
    if not is_business(tags):
        return None
    email = first_email(tags)
    if not email:
        return None
    street = " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")]))
    city = tags.get("addr:city", "")
    address = ", ".join(filter(None, [street, city, tags.get("addr:postcode")]))
    lat = el.get("lat") or el.get("center", {}).get("lat")
    lon = el.get("lon") or el.get("center", {}).get("lon")
    return {
        "source": "osm",
        "source_id": f"{el['type']}/{el['id']}",
        "name": tags["name"].strip(),
        "email": email,
        "category": category_of(tags),
        "phone": tags.get("phone") or tags.get("contact:phone") or "",
        "address": address,
        "city": city,
        "opening_hours": tags.get("opening_hours", ""),
        "lat": lat,
        "lon": lon,
    }


def domain_has_website(domain, timeout=8):
    """True if the email's own domain serves a web page (so they already have a site)."""
    for scheme in ("https", "http"):
        try:
            req = urllib.request.Request(f"{scheme}://{domain}", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status < 400 and len(resp.read(4096)) > 200:
                    return True
        except Exception:
            continue
    return False


def find(conn, cfg, area, radius_km=10, log=print):
    ua = f"webbiz/0.1 (lead research; contact {cfg['reply_to_email']})"
    lat, lon = geocode(area, ua)
    log(f"Searching {radius_km} km around {area} ({lat:.4f}, {lon:.4f})...")
    time.sleep(1)  # Nominatim policy: max 1 request/second
    data = urllib.parse.urlencode({"data": build_query(lat, lon, int(radius_km * 1000))}).encode()
    elements = _get(OVERPASS, ua, data=data).get("elements", [])
    log(f"OpenStreetMap returned {len(elements)} places with an email and no website.")

    added = skipped = 0
    for el in elements:
        lead = element_to_lead(el)
        if not lead:
            continue
        domain = lead["email"].split("@")[-1].lower()
        if cfg["check_email_domains"] and domain not in FREE_MAIL and domain_has_website(domain):
            skipped += 1
            continue
        if not lead["city"]:
            lead["city"] = area.split(",")[0].strip()
        if not db.is_suppressed(conn, lead["email"]) and db.add_lead(conn, lead):
            added += 1
    log(f"Added {added} new leads ({skipped} skipped because their email domain already has a website).")
    return added
