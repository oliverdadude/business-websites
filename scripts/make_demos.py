"""Hand-made demo sites for businesses you pitch in person.

    python scripts/make_demos.py demos

Each business gets its own fonts, colours, photos and wording. Photos are free-to-use Unsplash
images. Contact details are never invented: where we don't have them, the page shows where
they'll go.
"""
import html
import sys
from pathlib import Path

E = lambda s: html.escape(str(s), quote=True)
IMG = "https://images.unsplash.com/photo-{}?auto=format&fit=crop&w={}&q=75"

PAGE = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{name} | {trade}{in_area}</title>
<meta name="description" content="{sub}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{font_query}&display=swap">
<link rel="preload" as="image" href="{hero_img}">
<style>
:root {{ --dark: {dark}; --accent: {accent}; --paper: {paper}; --ink: {ink}; --muted: {muted}; --line: {line};
  --head: {head_font}; --body: {body_font}; }}
*, *::before, *::after {{ box-sizing: border-box; }}
html {{ scroll-behavior: smooth; }}
body {{ margin: 0; font: 400 17px/1.7 var(--body); color: var(--ink); background: #fff; -webkit-font-smoothing: antialiased; }}
h1, h2, h3 {{ font-family: var(--head); font-weight: {head_weight}; line-height: 1.1; margin: 0; letter-spacing: {head_tracking}; {head_case} }}
p {{ margin: 0; }}
a {{ color: inherit; }}
img {{ display: block; max-width: 100%; }}
.wrap {{ width: min(1160px, 100% - 48px); margin-inline: auto; }}
.kicker {{ font: 600 13px/1 var(--body); letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }}
.btn {{ display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 15px 26px; border-radius: 4px;
  font: 600 15px/1 var(--body); text-decoration: none; border: 1.5px solid transparent; cursor: pointer; transition: background .2s, color .2s, border-color .2s; }}
.btn-solid {{ background: var(--accent); color: {on_accent}; }}
.btn-solid:hover {{ filter: brightness(.93); }}
.btn-line {{ border-color: rgba(255,255,255,.55); color: #fff; }}
.btn-line:hover {{ background: #fff; color: var(--dark); border-color: #fff; }}

.demo {{ background: #111; color: #bbb; font: 500 12.5px/1 system-ui, sans-serif; text-align: center; padding: 9px 16px; letter-spacing: .02em; }}

header {{ position: absolute; inset: 33px 0 auto; z-index: 10; color: #fff; }}
header .wrap {{ display: flex; align-items: center; justify-content: space-between; height: 84px; border-bottom: 1px solid rgba(255,255,255,.18); }}
.brand {{ font: {brand_weight} 21px/1.1 var(--head); text-decoration: none; letter-spacing: {head_tracking}; {head_case} }}
nav {{ display: flex; align-items: center; gap: 34px; font-size: 15px; }}
nav a {{ text-decoration: none; opacity: .85; }}
nav a:hover {{ opacity: 1; }}
nav .btn {{ padding: 11px 20px; opacity: 1; }}

.hero {{ position: relative; min-height: min(92vh, 860px); display: flex; align-items: flex-end; color: #fff; background: var(--dark); }}
.hero img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: {hero_pos}; }}
.hero::after {{ content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.45) 0, rgba(0,0,0,0) 190px), linear-gradient(100deg, {overlay} 0%, {overlay_mid} 55%, rgba(0,0,0,.18) 100%); }}
.hero .wrap {{ position: relative; z-index: 1; padding: 190px 0 96px; }}
.hero h1 {{ font-size: clamp(42px, 6.2vw, 80px); max-width: {h1_width}; margin: 18px 0 22px; }}
.hero p {{ font-size: 19px; max-width: 46ch; opacity: .9; margin-bottom: 36px; }}
.hero .kicker {{ color: #fff; opacity: .85; }}
.actions {{ display: flex; flex-wrap: wrap; gap: 12px; }}

.trust {{ border-bottom: 1px solid var(--line); background: var(--paper); }}
.trust ul {{ list-style: none; margin: 0; padding: 26px 0; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 14px 32px; }}
.trust li {{ display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 15.5px; }}
.trust li::before {{ content: ""; width: 7px; height: 7px; background: var(--accent); border-radius: 50%; }}

section {{ padding: 120px 0; }}
.split {{ display: grid; grid-template-columns: 5fr 7fr; gap: 80px; }}
.head-col {{ position: sticky; top: 40px; align-self: start; }}
.head-col h2, .section-title {{ font-size: clamp(34px, 4vw, 52px); margin: 16px 0 20px; }}
.head-col p {{ color: var(--muted); max-width: 38ch; }}
.services {{ list-style: none; margin: 0; padding: 0; counter-reset: s; }}
.services li {{ display: grid; grid-template-columns: 64px 1fr; padding: 30px 0; border-top: 1px solid var(--line); counter-increment: s; }}
.services li:last-child {{ border-bottom: 1px solid var(--line); }}
.services li::before {{ content: counter(s, decimal-leading-zero); font: 500 14px/2.1 var(--body); color: var(--accent); letter-spacing: .06em; }}
.services h3 {{ font-size: 24px; margin-bottom: 8px; }}
.services p {{ color: var(--muted); max-width: 52ch; }}

.about {{ background: var(--paper); }}
.about .wrap {{ display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }}
.about figure {{ margin: 0; aspect-ratio: 4 / 5; overflow: hidden; border-radius: 4px; }}
.about figure img {{ width: 100%; height: 100%; object-fit: cover; object-position: {about_pos}; }}
.about p {{ color: var(--muted); font-size: 18px; margin-bottom: 18px; }}
.ticks {{ list-style: none; margin: 30px 0 0; padding: 0; display: grid; gap: 14px; }}
.ticks li {{ display: flex; gap: 14px; font-weight: 600; }}
.ticks svg {{ flex: none; color: var(--accent); margin-top: 4px; }}

.steps {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; margin-top: 64px; }}
.step {{ border-top: 2px solid var(--ink); padding-top: 26px; }}
.step b {{ display: block; font: 400 15px/1 var(--body); color: var(--muted); margin-bottom: 22px; letter-spacing: .08em; }}
.step h3 {{ font-size: 24px; margin-bottom: 10px; }}
.step p {{ color: var(--muted); }}

.quote {{ background: var(--dark); color: #fff; }}
.quote .wrap {{ display: grid; grid-template-columns: 5fr 6fr; gap: 80px; }}
.quote .kicker {{ color: var(--accent-on-dark, var(--accent)); }}
.quote h2 {{ font-size: clamp(34px, 4vw, 52px); margin: 16px 0 20px; }}
.quote .lead {{ opacity: .75; max-width: 40ch; }}
.details {{ margin-top: 44px; display: grid; gap: 22px; }}
.details div {{ border-top: 1px solid rgba(255,255,255,.16); padding-top: 18px; }}
.details small {{ display: block; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; opacity: .55; margin-bottom: 4px; }}
.details span {{ font-size: 19px; }}
.details .todo {{ opacity: .55; font-style: italic; }}
form {{ background: #fff; color: var(--ink); padding: 44px; border-radius: 4px; display: grid; gap: 18px; align-self: start; }}
form h3 {{ font-size: 26px; margin-bottom: 4px; }}
label {{ display: grid; gap: 6px; font-size: 14px; font-weight: 600; }}
input, textarea {{ font: inherit; font-size: 16px; padding: 13px 14px; border: 1px solid var(--line); border-radius: 4px; background: #fff; color: var(--ink); }}
input:focus, textarea:focus {{ outline: 2px solid var(--accent); outline-offset: 0; border-color: transparent; }}
textarea {{ min-height: 120px; resize: vertical; }}
form .btn {{ width: 100%; margin-top: 4px; }}
.sent {{ display: none; padding: 14px 16px; background: var(--paper); border-left: 3px solid var(--accent); font-size: 15px; }}

footer {{ background: var(--dark); color: rgba(255,255,255,.55); font-size: 14.5px; border-top: 1px solid rgba(255,255,255,.1); }}
footer .wrap {{ display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 30px 0; }}
.callbar {{ display: none; }}

@media (max-width: 900px) {{
  nav a:not(.btn) {{ display: none; }}
  .split, .about .wrap, .quote .wrap {{ grid-template-columns: 1fr; gap: 48px; }}
  .head-col {{ position: static; }}
  .steps {{ grid-template-columns: 1fr; gap: 36px; }}
  section {{ padding: 84px 0; }}
  .about figure {{ aspect-ratio: 4 / 3; }}
}}
@media (max-width: 600px) {{
  body {{ font-size: 16px; padding-bottom: 72px; }}
  .wrap {{ width: calc(100% - 40px); }}
  header .wrap {{ height: 70px; }}
  .brand {{ font-size: 18px; max-width: 62vw; }}
  nav .btn {{ padding: 10px 14px; font-size: 14px; }}
  .hero .wrap {{ padding: 150px 0 64px; }}
  .hero p {{ font-size: 17px; }}
  .trust ul {{ flex-direction: column; }}
  .services li {{ grid-template-columns: 44px 1fr; }}
  form {{ padding: 28px 22px; }}
  .callbar {{ display: flex; position: fixed; inset: auto 12px 12px; z-index: 20; }}
  .callbar .btn {{ width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,.25); }}
}}
@media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} }}
</style>
</head>
<body>
<div class="demo">Website preview for {name}</div>
<header><div class="wrap">
  <a class="brand" href="#top">{name}</a>
  <nav><a href="#services">Services</a><a href="#about">About</a><a href="#how">How it works</a><a class="btn btn-solid" href="#quote">Free quote</a></nav>
</div></header>

<main id="top">
<section class="hero" style="padding:0">
  <img src="{hero_img}" srcset="{hero_img_sm} 900w, {hero_img} 1800w" sizes="100vw" alt="{hero_alt}">
  <div class="wrap">
    <div class="kicker">{kicker}</div>
    <h1>{headline}</h1>
    <p>{sub}</p>
    <div class="actions"><a class="btn btn-solid" href="#quote">Get a free quote</a><a class="btn btn-line" href="#services">Our services</a></div>
  </div>
</section>

<div class="trust"><div class="wrap"><ul>{trust}</ul></div></div>

<section id="services"><div class="wrap split">
  <div class="head-col"><div class="kicker">Services</div><h2>{services_title}</h2><p>{services_intro}</p></div>
  <ol class="services">{services}</ol>
</div></section>

<section id="about" class="about"><div class="wrap">
  <figure><img src="{about_img}" alt="{about_alt}" loading="lazy"></figure>
  <div><div class="kicker">About</div><h2 class="section-title">{about_title}</h2>{about}<ul class="ticks">{ticks}</ul></div>
</div></section>

<section id="how"><div class="wrap">
  <div class="kicker">How it works</div><h2 class="section-title">Simple from start to finish</h2>
  <div class="steps">{steps}</div>
</div></section>

<section id="quote" class="quote"><div class="wrap">
  <div>
    <div class="kicker">Free quote</div>
    <h2>{quote_title}</h2>
    <p class="lead">Tell us a little about the job and we'll get back to you with a clear, fair price. No obligation.</p>
    <div class="details">
      <div><small>Phone</small><span class="todo">Your number goes here</span></div>
      <div><small>Email</small><span class="todo">Your email goes here</span></div>
      <div><small>Areas covered</small><span>{areas}</span></div>
    </div>
  </div>
  <form id="f">
    <h3>Request a quote</h3>
    <label>Your name<input name="name" autocomplete="name" required></label>
    <label>Phone or email<input name="contact" required></label>
    <label>What do you need?<textarea name="job" placeholder="{placeholder}"></textarea></label>
    <button class="btn btn-solid" type="submit">Send request</button>
    <div class="sent" id="sent">Thanks! This is a preview, so nothing was sent. On the live site, requests go straight to your phone and inbox.</div>
  </form>
</div></section>
</main>

<footer><div class="wrap"><span>&copy; <span id="y"></span> {name}</span><span>{trade}{in_area}</span></div></footer>
<div class="callbar"><a class="btn btn-solid" href="#quote">Get a free quote</a></div>
<script>
document.getElementById("y").textContent = new Date().getFullYear();
document.getElementById("f").addEventListener("submit", function (e) {{ e.preventDefault(); document.getElementById("sent").style.display = "block"; }});
</script>
</body>
</html>
"""

TICK = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>')

STEPS = [("Get in touch", "Call, email or send the form with a few details about what you need."),
         ("Free quote", "We'll take a look and give you a clear, fixed price, with no surprises."),
         ("Job done", "We do the work properly, tidy up after ourselves and make sure you're happy.")]

FONTS = {
    "fraunces": ('"Fraunces", Georgia, serif', '"Inter", system-ui, sans-serif',
                 "family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600", 400, "-0.015em", ""),
    "manrope": ('"Manrope", system-ui, sans-serif', '"Manrope", system-ui, sans-serif',
                "family=Manrope:wght@400;500;600;700;800", 700, "-0.025em", ""),
    "intertight": ('"Inter Tight", system-ui, sans-serif', '"Inter", system-ui, sans-serif',
                   "family=Inter+Tight:wght@600;700&family=Inter:wght@400;500;600", 700, "-0.03em", ""),
    "barlow": ('"Barlow Condensed", system-ui, sans-serif', '"Barlow", system-ui, sans-serif',
               "family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600", 700, "0.005em",
               "text-transform: uppercase;"),
    "dmserif": ('"DM Serif Display", Georgia, serif', '"DM Sans", system-ui, sans-serif',
                "family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600", 400, "-0.01em", ""),
}

SITES = [
    dict(
        slug="graham-lawlor-plants-and-gardens", name="Graham Lawlor Plants & Gardens", trade="Gardener", area="",
        fonts="fraunces", dark="#1c2a1f", accent="#6f9450", on_accent="#fff", paper="#f5f3ec", ink="#1c2a1f",
        muted="#5d6a5c", line="#e2e2d6", overlay="rgba(18,30,20,.86)", overlay_mid="rgba(18,30,20,.45)",
        hero=("1789656435462-865d7932c4bf", "A gravel path through lush garden borders", "center 60%"),
        about_photo=("1622383563227-04401ab4e5ea", "Gloved hands planting a seedling", "center"),
        kicker="Garden care & planting", headline="Gardens that look after themselves. Almost.",
        sub="Planting, pruning and year-round care from a local gardener who knows plants inside out.",
        trust=["Free garden visits & quotes", "Plants chosen to thrive", "Regular or one-off visits", "Friendly and reliable"],
        services_title="Everything your garden needs",
        services_intro="From a single overgrown hedge to looking after the whole garden every fortnight.",
        services=[("Planting & borders", "New beds and borders, with plants picked for your soil, light and how much time you have."),
                  ("Hedges & pruning", "Neat hedges, shaped shrubs and healthy trees, cut at the right time of year."),
                  ("Regular maintenance", "Weekly, fortnightly or monthly visits to keep everything tidy and growing well."),
                  ("Seasonal tidy-ups", "Spring and autumn clear-outs to get a tired garden back on track."),
                  ("Lawn care", "Mowing, edging, feeding and patching for a lawn you're proud of.")],
        about_title="A gardener who loves plants",
        about=["Graham Lawlor Plants & Gardens is a local, independent gardening business. The best gardens "
               "aren't the busiest ones. They're the ones where the right plants are in the right places.",
               "Whether you want a full makeover or just someone reliable to keep on top of things, you'll get "
               "honest advice and careful work."],
        ticks=["Honest advice on what will grow", "Turns up when promised", "Leaves your garden tidy"],
        quote_title="Let's get your garden looking its best", areas="Your local area",
        placeholder="e.g. Overgrown border to clear and replant, about 6 metres long"),
    dict(
        slug="dj-window-and-patio-cleaning", name="DJ Window & Patio Cleaning", trade="Window & patio cleaning", area="",
        fonts="manrope", dark="#0e2230", accent="#2f8fd8", on_accent="#fff", paper="#f3f6f8", ink="#0e2230",
        muted="#566a79", line="#dfe6eb", overlay="rgba(8,22,32,.88)", overlay_mid="rgba(8,22,32,.58)",
        hero=("1787491581115-1d9a0e9f11ec", "A sunlit wooden deck beside large glass windows", "center 55%"),
        about_photo=("1581578731548-c64695cc6952", "Cleaning a window by hand", "center 30%"),
        kicker="Window & patio cleaning", headline="Clear windows. Clean patios. No hassle.",
        sub="Streak-free windows and patios brought back to life, on a regular round or as a one-off clean.",
        trust=["Streak-free finish", "Regular rounds available", "Patios, paths & driveways", "Free quotes"],
        services_title="Clean, inside and out",
        services_intro="We look after the glass, the frames and the ground you walk on.",
        services=[("Window cleaning", "Streak-free windows using purified water, which leaves no residue and dries spotless."),
                  ("Frames, sills & doors", "Frames, sills and doors wiped down as standard, not as an extra."),
                  ("Patio & driveway cleaning", "Moss, algae and ground-in dirt lifted to bring paving back to its original colour."),
                  ("Conservatories", "Glass and roof panels cleaned so the light comes back in."),
                  ("Regular rounds", "Every 4, 6 or 8 weeks, so it's done without you having to remember.")],
        about_title="Local, reliable and careful",
        about=["DJ Window & Patio Cleaning is a local cleaning business looking after homes and small businesses. "
               "We turn up when we say we will and treat your property with care.",
               "Most customers start with a one-off clean and stay on a regular round."],
        ticks=["Reliable, regular schedule", "Careful around your home", "Clear, fair prices"],
        quote_title="Get a price for your windows or patio", areas="Your local area",
        placeholder="e.g. 3-bed semi, windows every 6 weeks, plus a one-off patio clean"),
    dict(
        slug="matt-dowrick-plumbing-and-heating", name="Matt Dowrick Plumbing & Heating", trade="Plumbing & heating",
        area="Chippenham",
        fonts="intertight", dark="#111a24", accent="#ec6b1c", on_accent="#fff", paper="#f6f5f2", ink="#111a24",
        muted="#5b6470", line="#e4e2dc", overlay="rgba(10,15,22,.88)", overlay_mid="rgba(10,15,22,.5)",
        hero=("1676210134188-4c05dd172f89", "A plumber fixing pipework under a sink", "70% center"),
        about_photo=("1542013936693-884638332954", "Water running from a kitchen tap", "center"),
        kicker="Plumbing & heating · Chippenham", headline="Plumbing and heating, done properly.",
        sub="Over 20 years' experience across Chippenham, Melksham and Calne, with a 24/7 emergency call-out.",
        trust=["24/7 emergency call-out", "20+ years' experience", "Chippenham, Melksham & Calne", "Free quotes"],
        services_title="From a dripping tap to a new heating system",
        services_intro="Domestic plumbing and heating work, big or small, done right first time.",
        services=[("Emergency call-outs", "Burst pipe, leak or no heating? Call any time, day or night."),
                  ("Boilers & central heating", "Repairs, servicing and heating upgrades to keep your home warm."),
                  ("Plumbing repairs", "Leaks, blockages, taps, toilets and showers fixed quickly and properly."),
                  ("Bathrooms & kitchens", "New suites, showers, sinks and pipework fitted to a high standard."),
                  ("Radiators & pipework", "New radiators, valves and pipework, plus balancing for an evenly warm home.")],
        about_title="Local, experienced and straightforward",
        about=["Matt Dowrick Plumbing & Heating is based in Chippenham and covers the surrounding towns and villages, "
               "with more than 20 years of hands-on experience.",
               "You'll get a clear explanation of the problem, a fair price before any work starts, and a tidy job."],
        ticks=["24/7 emergency call-out", "Clear prices before work starts", "Clean, tidy workmanship"],
        quote_title="Need a plumber? Get a free quote", areas="Chippenham, Melksham, Calne & surrounding villages",
        placeholder="e.g. Radiator in the back bedroom isn't heating up"),
    dict(
        slug="peps-plumbing-and-heating", name="Pep's Plumbing & Heating", trade="Plumbing & heating", area="",
        fonts="barlow", dark="#161616", accent="#d32f2f", on_accent="#fff", paper="#f5f3f0", ink="#161616",
        muted="#5f5b57", line="#e6e1dc", overlay="rgba(12,12,12,.86)", overlay_mid="rgba(12,12,12,.45)",
        hero=("1558618666-fcd25c85cd64", "A plumber at work with his tools", "center 35%"),
        about_photo=("1749532125405-70950966b0e5", "A plumber working in a bathroom", "center"),
        kicker="Plumbing & heating", headline="Friendly, reliable plumbing & heating",
        sub="Repairs, installations and heating work for homes and light commercial customers. Honest prices, tidy work.",
        trust=["Homes & light commercial", "Honest, upfront prices", "Clean & tidy work", "Free quotes"],
        services_title="What we do",
        services_intro="Everyday repairs to full installations, all handled by people who care about the job.",
        services=[("Plumbing repairs", "Leaks, drips, blockages and faulty fittings sorted quickly and properly."),
                  ("Heating & boilers", "Boiler repairs, servicing and heating systems that work when you need them."),
                  ("Bathroom installations", "Showers, baths, toilets and basins fitted to a high standard."),
                  ("Radiators & valves", "New radiators, thermostatic valves and balancing for an evenly warm home."),
                  ("Light commercial", "Plumbing and heating for shops, offices and landlords.")],
        about_title="The plumber you'll call again",
        about=["Pep's Plumbing & Heating is a local, independent business. We explain things in plain English, "
               "give you an honest price, and treat your home as if it were our own.",
               "No hard sell, no hidden extras. Just good work."],
        ticks=["Plain-English advice", "Fair, upfront pricing", "Respect for your home"],
        quote_title="Get a free, no-obligation quote", areas="Your local area",
        placeholder="e.g. Shower pressure is low and the boiler keeps losing pressure"),
    dict(
        slug="direct-home-improvements", name="Direct Home Improvements", trade="Home improvements", area="",
        fonts="dmserif", dark="#1d2226", accent="#b08a52", on_accent="#fff", paper="#f6f4f0", ink="#1d2226",
        muted="#5f6468", line="#e5e1da", overlay="rgba(16,19,22,.86)", overlay_mid="rgba(16,19,22,.42)",
        hero=("1785535573585-8f962fa3cda5", "A modern kitchen with a marble island", "center 50%"),
        about_photo=("1618832515490-e181c4794a45", "A kitchen part-way through being fitted", "center"),
        kicker="Kitchens · Bathrooms · Renovations", headline="Better homes, built with care.",
        sub="Kitchens, bathrooms and renovations handled from the first visit to the final clean-up.",
        trust=["Free home visits & quotes", "One team, start to finish", "Clear, fixed prices", "Clean & tidy sites"],
        services_title="Improvements, start to finish",
        services_intro="One team for the whole job, so you're never chasing different trades.",
        services=[("Kitchens", "Planning, fitting and finishing for a kitchen that works the way you live."),
                  ("Bathrooms", "Full bathroom refits, wet rooms and shower upgrades."),
                  ("Renovations", "Room makeovers, knock-throughs and whole-home refurbishments."),
                  ("Flooring & tiling", "Tiles, laminate and wood floors laid neatly and level."),
                  ("Repairs & maintenance", "The jobs on your list, finally done properly.")],
        about_title="Quality work, without the stress",
        about=["Direct Home Improvements is a local home improvement business. We manage your project from "
               "the first visit to the final clean-up, with one point of contact throughout.",
               "Clear prices, good communication and careful workmanship. That's the whole idea."],
        ticks=["One point of contact", "Fixed, written quotes", "Tidy, respectful team"],
        quote_title="Planning a project? Let's talk", areas="Your local area",
        placeholder="e.g. Full bathroom refit, about 2m x 2.5m, would like a walk-in shower"),
]


def render(s):
    head, body, query, weight, tracking, case = FONTS[s["fonts"]]
    hid, halt, hpos = s["hero"]
    aid, aalt, apos = s["about_photo"]
    area = s["area"]
    return PAGE.format(
        name=E(s["name"]), trade=E(s["trade"]), in_area=E(f" in {area}" if area else ""),
        font_query=query, head_font=head, body_font=body, head_weight=weight, brand_weight=max(weight, 600) if
        s["fonts"] not in ("fraunces", "dmserif") else weight, head_tracking=tracking, head_case=case,
        dark=s["dark"], accent=s["accent"], on_accent=s["on_accent"], paper=s["paper"], ink=s["ink"],
        muted=s["muted"], line=s["line"], overlay=s["overlay"], overlay_mid=s["overlay_mid"],
        hero_img=IMG.format(hid, 1800), hero_img_sm=IMG.format(hid, 900), hero_alt=E(halt), hero_pos=hpos,
        about_img=IMG.format(aid, 1000), about_alt=E(aalt), about_pos=apos,
        h1_width="20ch" if s["fonts"] == "barlow" else "15ch",
        kicker=E(s["kicker"]), headline=E(s["headline"]), sub=E(s["sub"]),
        trust="".join(f"<li>{E(t)}</li>" for t in s["trust"]),
        services_title=E(s["services_title"]), services_intro=E(s["services_intro"]),
        services="".join(f"<li><div><h3>{E(t)}</h3><p>{E(d)}</p></div></li>" for t, d in s["services"]),
        about_title=E(s["about_title"]), about="".join(f"<p>{E(p)}</p>" for p in s["about"]),
        ticks="".join(f"<li>{TICK}<span>{E(t)}</span></li>" for t in s["ticks"]),
        steps="".join(f'<div class="step"><b>STEP {i}</b><h3>{E(t)}</h3><p>{E(d)}</p></div>'
                      for i, (t, d) in enumerate(STEPS, 1)),
        quote_title=E(s["quote_title"]), areas=E(s["areas"]), placeholder=E(s["placeholder"]),
    )


def main(out):
    out = Path(out)
    for s in SITES:
        d = out / s["slug"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(render(s), encoding="utf-8")
    (out / "index.html").write_text("<!doctype html><meta charset=utf-8><meta name=robots content=noindex>"
                                    "<title>Website previews</title>"
                                    "<p style='font:16px system-ui;margin:40px'>Nothing to see here.</p>", encoding="utf-8")
    (out / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    print(f"Built {len(SITES)} demo sites in {out}/")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "demos")
