"""Per-industry design themes for preview sites: fonts, colours, wording and services.

Copy is deliberately generic and truthful (no invented reviews, awards or numbers) —
the owner fills in specifics once they buy.
"""
import re

FONTS = {
    "serif-warm": ("Fraunces", "Inter", "family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600"),
    "elegant": ("Cormorant Garamond", "Jost", "family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600"),
    "bold": ("Archivo", "Inter", "family=Archivo:wght@600;800&family=Inter:wght@400;500;600"),
    "clean": ("Plus Jakarta Sans", "Plus Jakarta Sans", "family=Plus+Jakarta+Sans:wght@400;500;600;700;800"),
    "sport": ("Oswald", "Inter", "family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600"),
    "classic": ("Libre Baskerville", "Source Sans 3", "family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;500;600"),
}

THEMES = {
    "food": {
        "match": ("restaurant", "takeaway", "bakeries", "catering", "pizza", "pizzeria", "bistro", "diner", "cafe", "bakery", "fast_food", "bar", "pub", "ice_cream", "deli", "butcher",
                  "confectionery", "pastry", "food", "coffee", "biergarten", "greengrocer", "cheese", "wine",
                  "tea", "chocolate", "seafood", "farm", "beverages"),
        "fonts": "serif-warm",
        "colors": {"accent": "#b4471f", "on_accent": "#ffffff", "hero_bg": "#2a1a12", "hero_ink": "#fbf3ea",
                   "soft": "#fbf5ee", "ink": "#2a1a12", "muted": "#6b5a4e", "line": "#ecdccb"},
        "tagline": "Good food, made fresh and served with a smile.",
        "highlights": ["Made fresh daily", "Locally loved", "Takeaway available"],
        "cta": "Call to order",
        "about": "{name} is an independent, locally run spot{in_city}. We care about doing simple things really "
                 "well — good ingredients, honest portions and a warm welcome every time you come through the door.",
        "services": [
            ("utensils", "Eat in", "Pull up a chair and take your time — we'll look after you."),
            ("bag", "Takeaway", "Call ahead and we'll have your order ready to pick up."),
            ("leaf", "Fresh ingredients", "Prepared fresh, with local produce wherever we can."),
            ("calendar", "Catering & events", "Feeding a group? Ask us about larger orders."),
            ("heart", "Dietary needs", "Let us know about allergies or preferences — we're happy to help."),
            ("gift", "Gift vouchers", "A treat for someone special. Just ask in store."),
        ],
    },
    "beauty": {
        "match": ("hair", "hairdresser", "nail", "barbershop", "beauty", "nails", "massage", "cosmetics", "tattoo", "barber", "spa", "piercing",
                  "tanning", "perfumery", "salon"),
        "fonts": "elegant",
        "colors": {"accent": "#9d4b62", "on_accent": "#ffffff", "hero_bg": "#f6ebe8", "hero_ink": "#3b2229",
                   "soft": "#fbf6f4", "ink": "#3b2229", "muted": "#7a6168", "line": "#efdfdb"},
        "light_hero": True,
        "tagline": "Relax, unwind and leave feeling your best.",
        "highlights": ["Experienced team", "Appointments & walk-ins", "Quality products"],
        "cta": "Book an appointment",
        "about": "At {name}{in_city}, every appointment is about you. We take the time to listen, give honest "
                 "advice and make sure you walk out feeling confident and looked after.",
        "services": [
            ("scissors", "Cuts & styling", "Fresh cuts, restyles and blow-dries tailored to you."),
            ("sparkles", "Colour", "From subtle refreshes to complete transformations."),
            ("heart", "Treatments", "Pampering treatments to help you relax and recharge."),
            ("star", "Special occasions", "Weddings, parties and events — look your best on the day."),
            ("calendar", "Easy booking", "Call or email to book a time that suits you."),
            ("gift", "Gift vouchers", "The perfect present. Available in any amount."),
        ],
    },
    "trades": {
        "match": ("plumb", "electric", "roofing", "painting", "building", "construction", "plumber", "electrician", "carpenter", "builder", "roofer", "painter", "hvac", "locksmith",
                  "gardener", "handicraft", "tiler", "glaziery", "stonemason", "craft", "hardware", "doityourself",
                  "joiner", "floorer", "plasterer", "scaffolder", "metal_construction", "window_construction",
                  "insulation", "landscap", "cleaning", "sweep", "trade"),
        "fonts": "bold",
        "colors": {"accent": "#f5b301", "accent_text": "#a16207", "on_accent": "#14213d", "hero_bg": "#14213d", "hero_ink": "#ffffff",
                   "soft": "#f4f6fa", "ink": "#14213d", "muted": "#566079", "line": "#dfe4ee"},
        "tagline": "Reliable local work, done right the first time.",
        "highlights": ["Free, no-obligation quotes", "Clean & tidy work", "Local and trusted"],
        "cta": "Get a free quote",
        "about": "{name} is a local business{in_city} that takes pride in quality workmanship. We turn up when "
                 "we say we will, explain everything clearly, and leave your place as tidy as we found it.",
        "services": [
            ("clipboard", "Free quotes", "Tell us what you need and we'll give you a clear, fair price."),
            ("wrench", "Repairs", "Quick, reliable fixes for problems big and small."),
            ("hammer", "Installations", "New fittings and projects, done properly and to standard."),
            ("clock", "Fast response", "Get in touch and we'll get back to you quickly."),
            ("shield", "Quality guaranteed", "Careful work you can count on, from start to finish."),
            ("home", "Homes & businesses", "Domestic and commercial jobs across the area."),
        ],
    },
    "health": {
        "match": ("dental", "dentist", "doctor", "physio", "therapy", "therapist", "clinic", "pharmacy", "physiotherapist", "optician", "veterinary",
                  "healthcare", "chemist", "medical", "psychotherapist", "chiropractor", "podiatrist",
                  "hearing_aids", "alternative", "counselling", "nutrition", "dietitian"),
        "fonts": "clean",
        "colors": {"accent": "#0e7c7b", "on_accent": "#ffffff", "hero_bg": "#e8f4f3", "hero_ink": "#0b3c49",
                   "soft": "#f3f9f9", "ink": "#0b3c49", "muted": "#4f6b73", "line": "#d6e9e8"},
        "light_hero": True,
        "tagline": "Friendly, professional care close to home.",
        "highlights": ["New patients welcome", "Caring, qualified team", "Convenient appointments"],
        "cta": "Make an appointment",
        "about": "{name} provides friendly, professional care{in_city}. We take the time to listen, explain your "
                 "options clearly and make every visit as comfortable as possible.",
        "services": [
            ("heart", "Personal care", "Treatment plans built around you and your needs."),
            ("calendar", "Appointments", "Book a time that works for you — just call or email."),
            ("user-plus", "New patients", "Always happy to welcome new patients and families."),
            ("shield", "Qualified team", "Experienced professionals you can trust."),
            ("clipboard", "Clear advice", "We explain everything in plain language."),
            ("map-pin", "Easy to find", "Conveniently located with the details below."),
        ],
    },
    "auto": {
        "match": ("mechanic", "auto", "automotive", "car_repair", "car", "tyres", "motorcycle", "car_wash", "fuel", "bicycle", "car_parts",
                  "vehicle", "boat", "garage"),
        "fonts": "bold",
        "colors": {"accent": "#e23b2e", "on_accent": "#ffffff", "hero_bg": "#17181c", "hero_ink": "#ffffff",
                   "soft": "#f5f5f6", "ink": "#17181c", "muted": "#5d5f66", "line": "#e2e3e6"},
        "tagline": "Honest work that keeps you on the road.",
        "highlights": ["Honest, upfront pricing", "Experienced mechanics", "Quick turnaround"],
        "cta": "Book a service",
        "about": "{name} is an independent garage{in_city}. No jargon, no surprises — we explain what needs doing, "
                 "give you a fair price, and get you back on the road quickly.",
        "services": [
            ("wrench", "Servicing", "Regular servicing to keep your vehicle running smoothly."),
            ("gauge", "Diagnostics", "We find the fault fast and explain it clearly."),
            ("shield", "Repairs", "Brakes, suspension, exhausts and more."),
            ("circle", "Tyres", "Fitting, balancing and puncture repairs."),
            ("clock", "Same-day jobs", "Many jobs done while you wait — just ask."),
            ("clipboard", "Clear quotes", "You'll know the price before any work starts."),
        ],
    },
    "fitness": {
        "match": ("personal_trainer", "fitness", "sports_centre", "gym", "yoga", "dance", "sports", "martial", "pilates",
                  "climbing", "swimming", "boxing"),
        "fonts": "sport",
        "colors": {"accent": "#c6f432", "accent_text": "#4d7c0f", "on_accent": "#0d0f12", "hero_bg": "#0d0f12", "hero_ink": "#ffffff",
                   "soft": "#f4f5f2", "ink": "#0d0f12", "muted": "#555b62", "line": "#e1e3dd"},
        "tagline": "Stronger, fitter and more confident — every week.",
        "highlights": ["All levels welcome", "Friendly coaches", "Flexible memberships"],
        "cta": "Book a free session",
        "about": "{name} is a welcoming, community-focused place to train{in_city}. Whether you're just starting "
                 "out or chasing a new goal, we'll help you get there.",
        "services": [
            ("users", "Group classes", "Motivating sessions for every fitness level."),
            ("dumbbell", "Personal training", "One-to-one coaching built around your goals."),
            ("calendar", "Flexible times", "Early mornings, evenings and weekends."),
            ("heart", "Beginners welcome", "Never trained before? You're in the right place."),
            ("star", "Memberships", "Simple options with no complicated contracts."),
            ("sparkles", "First session free", "Come and try us out — just get in touch."),
        ],
    },
    "stay": {
        "match": ("lodging", "hotel", "guest_house", "hostel", "apartment", "camp_site", "motel", "bed_and_breakfast",
                  "chalet", "caravan_site", "holiday"),
        "fonts": "classic",
        "colors": {"accent": "#1f5f8b", "on_accent": "#ffffff", "hero_bg": "#10283b", "hero_ink": "#f7f3ec",
                   "soft": "#f7f3ec", "ink": "#10283b", "muted": "#5a6672", "line": "#e6dfd2"},
        "tagline": "A warm welcome and a comfortable stay.",
        "highlights": ["Comfortable rooms", "Great location", "Friendly hosts"],
        "cta": "Check availability",
        "about": "{name} offers comfortable, welcoming accommodation{in_city}. Whether you're here for work, "
                 "a weekend away or a longer stay, we'll make you feel at home.",
        "services": [
            ("bed", "Comfortable rooms", "Clean, cosy rooms for a great night's sleep."),
            ("map-pin", "Great location", "Perfectly placed to explore the area."),
            ("coffee", "Breakfast", "Ask us about breakfast options during your stay."),
            ("wifi", "Free Wi-Fi", "Stay connected throughout your visit."),
            ("calendar", "Book direct", "Contact us directly for availability and rates."),
            ("heart", "Personal welcome", "Local tips and friendly service from your hosts."),
        ],
    },
    "professional": {
        "match": ("accounting", "legal", "solicitor", "attorney", "accountant", "lawyer", "estate_agent", "insurance", "consulting", "financial", "tax_advisor",
                  "architect", "notary", "surveyor", "company", "it", "travel_agent", "employment_agency",
                  "photographer", "graphic_design", "printing", "copyshop"),
        "fonts": "classic",
        "colors": {"accent": "#a67c2e", "on_accent": "#ffffff", "hero_bg": "#1c2633", "hero_ink": "#ffffff",
                   "soft": "#f6f5f2", "ink": "#1c2633", "muted": "#5a6370", "line": "#e5e2da"},
        "tagline": "Expert advice and a personal service you can trust.",
        "highlights": ["Free initial consultation", "Clear, fixed pricing", "Personal service"],
        "cta": "Book a consultation",
        "about": "{name} provides professional, personal service to clients{in_city}. We take the time to "
                 "understand your situation and give clear, practical advice.",
        "services": [
            ("briefcase", "Consultations", "An initial conversation to understand what you need."),
            ("clipboard", "Clear advice", "Practical guidance without the jargon."),
            ("users", "Individuals & businesses", "Supporting clients of every size."),
            ("shield", "Trusted & confidential", "Your information is always handled with care."),
            ("clock", "Responsive", "We reply promptly and keep you informed."),
            ("map-pin", "Local expertise", "We know the area and the people in it."),
        ],
    },
    "shop": {
        "match": (),
        "fonts": "clean",
        "colors": {"accent": "#2f6f4f", "on_accent": "#ffffff", "hero_bg": "#183a2b", "hero_ink": "#f4f1e8",
                   "soft": "#f6f4ee", "ink": "#183a2b", "muted": "#58675f", "line": "#e3e0d4"},
        "tagline": "Proudly serving our local community.",
        "highlights": ["Independent & local", "Friendly, expert help", "Quality you can trust"],
        "cta": "Get in touch",
        "about": "{name} is an independent, locally owned business{in_city}. We believe in great service, "
                 "products we're proud of, and getting to know our customers by name.",
        "services": [
            ("star", "Hand-picked range", "Quality products chosen with care."),
            ("users", "Expert advice", "Not sure what you need? Just ask — we're happy to help."),
            ("heart", "Locally owned", "Every visit supports an independent local business."),
            ("phone", "Call ahead", "Check stock or ask a question before you visit."),
            ("gift", "Gifts", "Something for everyone, with gift wrapping on request."),
            ("map-pin", "Visit us", "Find our address and opening hours below."),
        ],
    },
}

# Inline SVG icons (24x24 stroke icons in the style of Lucide, MIT).
ICONS = {
    "utensils": '<path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2"/><path d="M6 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
    "bag": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    "leaf": '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
    "calendar": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "heart": '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
    "gift": '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    "scissors": '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
    "sparkles": '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    "star": '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    "clipboard": '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
    "hammer": '<path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9"/><path d="M17.64 15 22 10.64M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    "home": '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    "gauge": '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "circle": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    "dumbbell": '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
    "bed": '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
    "coffee": '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
    "wifi": '<path d="M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0"/>',
    "briefcase": '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    "phone": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    "mail": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
}


def icon(name, size=24):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            f'{ICONS[name]}</svg>')


KEY_FALLBACK = {"craft": "trades", "healthcare": "health", "office": "professional", "beauty": "beauty"}


def _matches(word, keyword):
    # Short keywords ("car", "spa", "it") must match exactly so "carpet" isn't a garage.
    return word == keyword or (len(keyword) >= 5 and word.startswith(keyword))


def theme_for(category):
    """Pick a theme from an OSM-style "key=value" category or free text like "Hair salon"."""
    key, _, value = (category or "").lower().rpartition("=")
    words = [w for w in re.split(r"[;,/\s]+", value) if w]
    words += [value.replace(" ", "_")]
    for kind, theme in THEMES.items():
        if any(_matches(w, k) for w in words for k in theme["match"]):
            return kind, theme
    kind = KEY_FALLBACK.get(key, "shop")
    return kind, THEMES[kind]
