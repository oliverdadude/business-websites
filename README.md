# webbiz — sell websites to local businesses that don't have one

An automated pipeline for a small web-design business:

1. **Find** local businesses that list a public email but have **no website**, using
   OpenStreetMap (free, no API key). Businesses whose email domain already serves a
   website are filtered out.
2. **Import** extra leads from any other source (e.g. your prospecting skill) via CSV.
3. **Build** each one a personalised preview website, themed by business type
   (food, beauty, trades, health, auto, fitness, stays, professional, retail).
4. **Email** them the link with your offer, and send one polite follow-up.
5. **Sync** your inbox: replies stop follow-ups, opt-outs and bounces are suppressed forever.

6. **Admin dashboard** to run all of this from your browser: a mailbox for every email
   sent and received, a live preview of each business's website, and a pipeline tracker.

Business side: see [`business/offer-and-pricing.md`](business/offer-and-pricing.md) and
[`business/playbook.md`](business/playbook.md).

## Admin dashboard

```bash
python -m webbiz admin            # open http://127.0.0.1:8080
python -m webbiz admin --demo     # try it with sample data first (separate demo database)
```

- **Dashboard**: pipeline numbers, the latest replies, and buttons to find, build, publish,
  send (preview or live) and sync. Long jobs run in the background with a live log.
- **Leads**: search and filter every business. Each lead page shows:
  - its website in a desktop or mobile preview
  - the whole email conversation, plus the next email waiting to go out
  - a reply box that sends from your own address, threaded onto their message
  - editable details (phone, hours, address and so on), with "Save & rebuild site"
  - **Download final**, which gives you the site without the "free preview" banner, ready to hand over
- **Mailbox**: Inbox (replies, opt-outs, bounces), Sent, and Queued (what the next send will
  email). Unread replies are highlighted and counted in the sidebar.
- **Websites**: a gallery of every site you've built.

The dashboard only listens on your own computer by default. To open it from another device,
set `ADMIN_PASSWORD` and run it with `--host 0.0.0.0`.

## Website designs

Each site is themed by business type, with its own fonts, colours, wording and services:
food, beauty, trades, health, auto, fitness, accommodation, professional services, and
general shops. Each site includes:
- contact details with a call or email button (sticky on mobile)
- a weekly opening-hours table with a live "Open now" indicator
- a map
- search-engine business data (schema.org)

Wording is deliberately generic and truthful: no invented reviews or awards. Themes live in
`webbiz/themes.py` and the layout in `webbiz/templates/site.html`. After changing either,
run `python -m webbiz build --rebuild` to regenerate existing sites.

Pure Python 3.10+ standard library — nothing to install.

## Setup (10 minutes)

```bash
cp config.example.json config.json   # your name, studio name, address, prices, preview URL
cp .env.example .env                 # SMTP/IMAP login (use an app password)
set -a; source .env; set +a
```

**Use a separate sending domain** (e.g. `getyourstudio.com` rather than your main one) with
SPF, DKIM and DMARC set up. Google Workspace or Zoho Mail work well. Keep
`daily_send_limit` at around 30 for the first few weeks.

### Hosting the preview sites
Previews are static files in `output/sites/<slug>/index.html`. Point `preview_base_url`
at wherever you publish that folder, and optionally set `publish_command` so `run` uploads
new sites automatically before emailing:

| Host | `publish_command` |
|---|---|
| Netlify | `npx netlify-cli deploy --dir output/sites --prod` |
| Cloudflare Pages | `npx wrangler pages deploy output/sites --project-name previews` |
| GitHub Pages | `cd output/sites && git add -A && git commit -m update && git push` (folder is a clone of your pages repo) |

If `publish_command` is empty, `run --live` will hold back newly built sites until the
next run, so no one gets a link that isn't live yet.

## Usage

```bash
python -m webbiz find "Bend, Oregon" --radius 15   # find leads
python -m webbiz import skill-leads.csv            # add leads from elsewhere
python -m webbiz build                             # make preview sites
python -m webbiz send                              # DRY RUN: writes emails to output/outbox/
python -m webbiz send --live                       # actually send
python -m webbiz sync                              # process replies / opt-outs / bounces
python -m webbiz leads --status replied            # who wants a site
python -m webbiz mark 12 won                       # record a sale
python -m webbiz stats
python -m webbiz admin                             # the dashboard
```

Or all in one (good for a daily cron job):

```bash
python -m webbiz run "Bend, Oregon" --live
```

```cron
0 10 * * 1-5  cd /path/to/business-websites && set -a && . ./.env && python3 -m webbiz run --live >> data/run.log 2>&1
```

Edit the email wording in `webbiz/outreach.py` (`SUBJECTS`, `BODIES`) and the site design
in `webbiz/templates/site.html` / themes in `webbiz/sitegen.py`.

## Staying legal and out of spam folders

Cold emailing businesses is legal in many places **if** you do it right. The tool enforces
the basics: it's dry run by default, it identifies you with your real postal address, it
offers a one-reply opt-out and a `List-Unsubscribe` header, it never emails a suppressed
address again, it sends at most two emails per business, and it caps the daily volume. You
are still responsible for the rules where you and your recipients are:

- **US (CAN-SPAM):** B2B cold email is allowed with the above.
- **UK (PECR) / EU (GDPR + ePrivacy):** emailing *companies* at generic addresses is generally
  OK under legitimate interest. Emailing **sole traders/partnerships** (common for tiny shops)
  usually needs prior consent in the UK, and the rules vary by EU country, so check before
  targeting those areas.
- **Canada (CASL):** stricter. Publicly listed addresses are only OK when the message is relevant
  to their business role, and you must have no "do not email" notice.

OpenStreetMap data is © OpenStreetMap contributors (ODbL). Keep usage gentle: one search
per run is plenty.

## Tests

```bash
python -m unittest discover -s tests
```
