"""Hand-made demo sites for businesses you pitch in person. Usage: python scripts/make_demos.py demos"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from webbiz import sitegen

OUT = Path(sys.argv[1])
cfg = {"business_name": "", "reply_to_email": ""}

def theme(fonts, colors, tagline, highlights, cta, about, services):
    return dict(fonts=fonts, colors=colors, tagline=tagline, highlights=highlights, cta=cta, about=about,
                services=services, kind="trades")

SITES = [
    ("graham-lawlor-plants-and-gardens", dict(name="Graham Lawlor Plants & Gardens", category="Gardener"), theme(
        "serif-warm",
        {"accent": "#4f7d3a", "on_accent": "#ffffff", "hero_bg": "#1f3324", "hero_ink": "#f3f7ee",
         "soft": "#f3f7ef", "ink": "#1f3324", "muted": "#5a6b58", "line": "#dde7d6"},
        "Beautiful gardens, planted and looked after by a local expert.",
        ["Free garden visits & quotes", "Plants chosen to thrive", "Friendly and reliable"],
        "Get a free quote",
        "{name} is a local gardening business{in_city} with a real love of plants. Whether it's a new border, "
        "a tired lawn or regular upkeep, we'll keep your garden looking its best all year round.",
        [("leaf", "Planting & borders", "New beds and borders, with plants chosen to suit your soil and light."),
         ("scissors", "Hedges & pruning", "Neat hedges, shaped shrubs and healthy, well-pruned trees."),
         ("calendar", "Regular maintenance", "Weekly, fortnightly or monthly visits to keep things tidy."),
         ("sparkles", "Seasonal tidy-ups", "Spring and autumn clear-outs to get your garden back on track."),
         ("heart", "Plant care advice", "Honest advice on what to plant, where, and how to look after it."),
         ("home", "Homes & businesses", "Private gardens, rentals and commercial grounds.")])),
    ("dj-window-and-patio-cleaning", dict(name="DJ Window & Patio Cleaning", category="Window cleaning"), theme(
        "clean",
        {"accent": "#0ea5e9", "accent_text": "#0369a1", "on_accent": "#ffffff", "hero_bg": "#0c2d48", "hero_ink": "#f0f9ff",
         "soft": "#f0f8fd", "ink": "#0c2d48", "muted": "#4b6478", "line": "#d6e8f3"},
        "Sparkling windows and patios that look like new.",
        ["Streak-free finish", "Regular rounds available", "Free, no-obligation quotes"],
        "Get a free quote",
        "{name} is a local cleaning business{in_city}. We turn up when we say we will, take care around your "
        "home, and leave your windows and outdoor spaces spotless.",
        [("sparkles", "Window cleaning", "Streak-free windows, inside and out, using pure-water cleaning."),
         ("home", "Patio & driveway cleaning", "Moss, algae and grime lifted to bring paving back to life."),
         ("check", "Frames, sills & doors", "Frames, sills and conservatory panels cleaned as standard."),
         ("calendar", "Regular rounds", "Every 4, 6 or 8 weeks, so you never have to think about it."),
         ("clock", "One-off cleans", "Moving house or getting ready for summer? We can help."),
         ("users", "Homes & businesses", "Houses, flats, shops and offices across the area.")])),
    ("matt-dowrick-plumbing-and-heating", dict(name="Matt Dowrick Plumbing & Heating", category="Plumber",
                                               city="Chippenham"), theme(
        "bold",
        {"accent": "#f97316", "accent_text": "#c2410c", "on_accent": "#ffffff", "hero_bg": "#13203a", "hero_ink": "#ffffff",
         "soft": "#f5f7fb", "ink": "#13203a", "muted": "#55617a", "line": "#e0e5ee"},
        "Over 20 years of plumbing and heating experience, with a 24/7 call-out.",
        ["24/7 emergency call-out", "20+ years' experience", "Chippenham, Melksham & Calne"],
        "Get a free quote",
        "{name} is a local plumbing and heating business{in_city}, covering Chippenham, Melksham, Calne and the "
        "surrounding villages. From a dripping tap to a new heating system, the job is done properly and left tidy.",
        [("clock", "24/7 emergency call-out", "Burst pipe or no heating? Call any time, day or night."),
         ("gauge", "Boilers & heating", "Boiler repairs, servicing and central heating work."),
         ("wrench", "Plumbing repairs", "Leaks, blockages, taps, toilets and showers fixed fast."),
         ("hammer", "Bathrooms & kitchens", "New suites, showers and sinks fitted to a high standard."),
         ("home", "Radiators & pipework", "New radiators, power flushing and pipework upgrades."),
         ("clipboard", "Free quotes", "A clear, fair price before any work starts.")])),
    ("peps-plumbing-and-heating", dict(name="Pep's Plumbing & Heating", category="Plumber"), theme(
        "sport",
        {"accent": "#dc2626", "on_accent": "#ffffff", "hero_bg": "#1c1c1e", "hero_ink": "#ffffff",
         "soft": "#f7f6f5", "ink": "#1c1c1e", "muted": "#5d5a57", "line": "#e7e3df"},
        "Friendly, reliable plumbing and heating for your home.",
        ["Free, no-obligation quotes", "Clean & tidy work", "Homes & light commercial"],
        "Get a free quote",
        "{name} is a local, independent plumbing and heating business{in_city}. We explain everything clearly, "
        "give honest prices, and treat your home as if it were our own.",
        [("wrench", "Plumbing repairs", "Leaks, drips and blockages sorted quickly and properly."),
         ("gauge", "Heating & boilers", "Boiler repairs, servicing and heating that works when you need it."),
         ("home", "Radiators", "New radiators, valves and balancing for an evenly warm home."),
         ("hammer", "Bathroom installs", "Showers, baths, toilets and basins fitted to a high standard."),
         ("clock", "Fast response", "Get in touch and we'll get back to you quickly."),
         ("briefcase", "Light commercial", "Plumbing and heating for shops, offices and landlords.")])),
    ("direct-home-improvements", dict(name="Direct Home Improvements", category="Builder"), theme(
        "bold",
        {"accent": "#14b8a6", "accent_text": "#0f766e", "on_accent": "#06201d", "hero_bg": "#1e293b", "hero_ink": "#ffffff",
         "soft": "#f4f7f8", "ink": "#1e293b", "muted": "#566476", "line": "#dfe6ea"},
        "Kitchens, bathrooms and renovations, done right from start to finish.",
        ["Free home visits & quotes", "One team, start to finish", "Clean, tidy and on time"],
        "Get a free quote",
        "{name} is a local home improvement business{in_city}. We handle your project from the first visit to "
        "the final clean-up, with clear prices, good communication and quality workmanship.",
        [("hammer", "Kitchens", "Design, fitting and finishing for a kitchen you'll love."),
         ("sparkles", "Bathrooms", "Full bathroom refits, wet rooms and shower upgrades."),
         ("home", "Renovations", "Room makeovers, knock-throughs and whole-home refurbishments."),
         ("clipboard", "Flooring & tiling", "Tiles, laminate and wood floors laid neatly and level."),
         ("star", "Painting & decorating", "Fresh, crisp finishes inside and out."),
         ("wrench", "Repairs & maintenance", "Those jobs on your list, finally done properly.")])),
]

for slug, lead, th in SITES:
    d = OUT / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(sitegen.render(lead, cfg, theme=th), encoding="utf-8")
(OUT / "index.html").write_text("<!doctype html><meta charset=utf-8><meta name=robots content=noindex>"
                                "<title>Website previews</title><p style='font:16px system-ui;margin:40px'>Nothing to see here.</p>")
(OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
print("\n".join(sorted(p.name for p in OUT.iterdir())))
