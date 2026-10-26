# Daily playbook

## Every day (≈20 minutes)
1. `python -m webbiz run "<next town>" --live` — syncs replies, finds new leads, builds
   their sites, publishes, and sends up to `daily_send_limit` emails + due follow-ups.
2. Check your inbox. `python -m webbiz leads --status replied` lists everyone who answered.
3. Reply to every interested lead the same day (templates below).
4. Record outcomes: `python -m webbiz mark <id> won` / `lost`.

Work through towns one at a time. Start small (30/day) on a new sending domain and
raise the limit slowly over a few weeks.

## Reply templates

**They're interested**
> Great! Here's how it works:
> 1. Pay the $299 setup here: <payment link>
> 2. Send me any photos, your logo (if you have one), and anything you'd like changed.
> 3. Tell me the web address you'd like (e.g. rosasbakery.com) — I'll check it's free.
> Your site will be live within 48 hours. Monthly hosting ($29) starts once it's live.

**"How much?" / "What's the catch?"**
> No catch — I make sites for local businesses and I'd rather show than tell. It's $299
> once and $29/month for hosting, your domain and updates. Cancel any time; you keep the domain.

**"We don't need a website"**
> Totally fair! Most people now check Google before visiting — a simple site mainly helps
> you show up there with the right hours and phone number. If you change your mind the
> preview stays up for 30 days. Thanks for replying!
(then `python -m webbiz mark <id> lost`)

**Anything that says stop / remove / unsubscribe**
`python -m webbiz optout <email>` — `sync` does this automatically when it can tell.

## Delivering a sale
1. Copy `output/sites/<slug>/` into a new folder for the client.
2. Remove the dark "free preview" bar at the top of `index.html`.
3. Add their photos and real wording; deploy to Netlify/Cloudflare Pages on their domain.
4. Set up a Google Business Profile with the new website link (big win for them).

## Using your prospecting skill too
Export what the skill finds as CSV (needs at least `name` and `email` columns) and run
`python -m webbiz import leads.csv --source skill`. Those leads then flow through the
same build → email → follow-up pipeline.
