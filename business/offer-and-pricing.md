# Offer & pricing

## The pitch in one line
"I already built your website — here it is. Want it?"

Every lead gets a real, personalised preview (their name, category, phone, address,
hours) before you ever ask for money. That's what makes cold email work here.

## Packages

| Package | Price | What's included |
|---|---|---|
| **Starter** (the default offer in emails) | $299 setup + $29/mo | The one-page site, their own domain (.com included first year), mobile-friendly, Google Business Profile link, hosting, 1 small change/month |
| **Growth** | $599 setup + $49/mo | Up to 5 pages (menu / services / gallery / about / contact), contact form, Google Maps embed, basic SEO for "<service> in <town>", 3 changes/month |
| **AI add-on** | +$99/mo | AI chat assistant on the site that answers FAQs (hours, prices, services) 24/7 and captures bookings/leads by email |
| **AI receptionist** (upsell later) | $199–399/mo | AI that answers missed calls/texts, books appointments, sends summaries |

Change the prices used in emails via `price_setup` / `price_monthly` in `config.json`.

### Why websites first, AI second
Businesses with **no website** are your lead source — they're the least technical buyers,
and "get online" is an easy yes. An AI agent is a bigger, monthly-recurring upsell once
they trust you (and is a great *first* offer to businesses that already have websites —
flip the filter in `webbiz/prospect.py` if you want to target those later).

## Costs (per client, roughly)
- Domain: ~$12/year
- Hosting: $0 (Netlify / Cloudflare Pages / GitHub Pages free tiers handle these easily)
- AI add-on: a few dollars/month in API usage for a small business chat

At 20 Starter clients that's ~$6k in setup fees + ~$580/month recurring, almost all margin.

## Getting paid
Send a Stripe Payment Link (or PayPal invoice) for the setup fee, and a Stripe
subscription link for the monthly fee. Don't put the site on their domain until the
setup fee is paid.
