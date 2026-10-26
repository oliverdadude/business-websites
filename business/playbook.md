# Daily playbook

## Every day (≈20 minutes)
1. Open the dashboard (`python -m webbiz admin`) and click **Sync inbox**, or run
   `python -m webbiz run "<next town>" --live` to sync, find, build, publish and send in one go.
2. Work through the **Mailbox → Inbox**. Each reply opens next to the lead's website.
3. Reply to every interested lead the same day, right from the dashboard (templates below).
4. Set the lead's status to **Won** or **Lost** from the dropdown on its page.

Work through towns one at a time. Start small (30/day) on a new sending domain and
raise the limit slowly over a few weeks.

## Reply templates

The dashboard drafts these for you automatically (Mailbox → Needs reply). Edit the facts it uses
in Settings → Replying to customers. The originals are below for reference.

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
1. Update their details on the lead page (hours, phone, address), then click **Save & rebuild site**.
2. Click **Download final** to get the site without the "free preview" banner.
3. Add their photos and real wording, then deploy it to Netlify or Cloudflare Pages on their domain.
4. Set up a Google Business Profile with the new website link (big win for them).

## Using your prospecting skill too
Export what the skill finds as CSV (needs at least `name` and `email` columns) and run
`python -m webbiz import leads.csv --source skill`. Those leads then flow through the
same build → email → follow-up pipeline.
