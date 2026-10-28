# Proximity Supply Co.

A private bulk-ordering and crafting-management site for a player-run business on
[Proximity RP](https://www.proximityrp.com/). **Independent, not an official Proximity RP site.**
All money is in-game dollars. There are no real-money payments: payment and delivery happen in-game.

- **Storefront:** catalogue with search and filters, live bulk-discount preview, a cart priced by the server,
  checkout with your in-game name and Discord, and a private tracking link for each order.
- **Admin (owner only):** dashboard, order workflow, stock reservations, a combined production queue, an
  item/recipe editor with crafting trees and craft-vs-buy comparisons, profitability rankings, settings,
  and CSV/JSON import/export.

Stack: Next.js 15 (App Router), TypeScript, Tailwind, PostgreSQL, Prisma, Zod, jose, Vitest.

---

## 1. Local setup

Requires Node 20+ and PostgreSQL 14+.

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`:

1. Set `DATABASE_URL` to your database.
2. Generate an admin password hash and paste the printed line into `.env`:

   ```bash
   npm run admin:hash -- "a-long-password-only-you-know"
   ```

3. Set `SESSION_SECRET` to a random string of 32 or more characters:

   ```bash
   openssl rand -base64 48
   ```

Create the tables and add the real raw resources:

```bash
npx prisma db push
```

```bash
npm run db:seed
```

Optionally load the clearly labelled demo data, so you can try the whole workflow:

```bash
npm run db:seed:demo
```

Then run the app:

```bash
npm run dev
```

The shop is at http://localhost:3000 and the admin area at http://localhost:3000/admin.

### What the seeds create

- `npm run db:seed` creates **only** the six raw resources the server is known to have: Coal, Iron, Gold
  (Mining), Crops (Farming), Fish and Crab (Fishing). They have no prices and are marked **Unverified**.
  It is safe to run again; it never overwrites anything.
- `npm run db:seed:demo` adds generic demo items (`Demo: Item A` … `Demo: Item G`, `isDemo = true`) with
  made-up recipes, prices and stock. They are **not real game data**. Remove them with
  **Admin → Settings → Delete demo data**, which also deletes any orders that contain demo items.
  A banner reminds you while demo data is loaded.

### Checks

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

Tests cover the crafting engine, pricing and margin protection, cart totals, reservations and
fulfilment, status transitions, import parsing and export round-trips, password hashing, sessions and
rate limiting.

---

## 2. Deploying (Vercel + Neon)

1. **Database:** create a free project at [neon.tech](https://neon.tech). Copy the **pooled** connection
   string (it contains `-pooler` and ends with `?sslmode=require`).
2. **Create the tables** from your computer, pointing at Neon once:

   ```bash
   DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" npx prisma db push
   ```

   ```bash
   DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" npm run db:seed
   ```

3. **Vercel:** push this repo to GitHub, then on [vercel.com](https://vercel.com) choose
   *Add New → Project* and import the repo. The framework is detected automatically, and the build command
   (`prisma generate && next build`) comes from `package.json`.
4. Under *Settings → Environment Variables* add `DATABASE_URL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` and
   (optionally) `NEXT_PUBLIC_SELLER_DISCORD`. Redeploy after adding them.
5. Open `https://your-app.vercel.app/admin`, log in, and set your business details in **Settings**.

When you change `prisma/schema.prisma` later, run `npx prisma db push` against the production database
again (or switch to `prisma migrate` once the schema settles).

Notes:

- The session cookie is `Secure` in production, so the admin area needs HTTPS (Vercel provides it).
- The order rate limiter is in-memory per server instance. On Vercel that is a soft limit;
  idempotency keys still stop duplicate submissions, and every order needs your approval anyway.

---

## 3. Adding your real data

Nothing about Proximity RP recipes, costs or prices is invented here. You add it as you verify it in-game.

### Items

**Admin → Items & recipes → New item.** Pick the type:

| Type | Use for |
|---|---|
| Raw material | Mined, farmed, fished or bought resources (Coal, Iron…) |
| Intermediate | Crafted components used in other recipes |
| Finished product | Things you sell |

Per item you can set:

- **Acquisition:** purchased, gathered, or from stock only.
- **Craft or buy:** Auto picks the cheaper route; Always craft or Always buy force one.
- **Prices:** buy price, gather cost, market value, sell price, extra cost per unit, and the base selling
  price for the shop.
- **Price status:** Verified or Unverified.
- **Shop settings:** minimum margin, custom-quote threshold, low-stock threshold, and the featured,
  popular and approved-for-sale flags.

Leave unknown prices **blank**. Blank is "unknown", not zero.

### Recipes

Open an item and use **Add recipe**:

- **Ingredients** are per craft.
- **Output per craft** is how many units one craft produces. The planner rounds up to whole batches and
  reports the surplus.
- **Craft time** is seconds per batch.
- **Station**, **skill** and **skill level** are for your reference.
- **Extra cost per batch** covers fees, fuel and similar.
- **Verified / Unverified** records whether you've checked the recipe in-game. Use the notes field to say
  where it was checked.

Add more recipes to the same item to create **alternatives**. The planner uses the cheapest one that's
priced, unless the item's preference forces craft or buy. Use **Make primary** to choose which recipe wins
a tie and which is used when nothing is priced.

A non-raw item with no recipe shows **Unverified — Recipe Required**. Recipe loops are detected: you get a
warning when saving or importing a loop. An item whose only recipe loops can't be planned.

### Bulk import

**Admin → Import / export** handles materials, products, recipes, prices and inventory, as CSV or JSON.
Download a template, fill it in, then **Preview & validate**. Errors are listed by row, warnings include
circular dependencies, and nothing is saved until you press **Confirm import**. Each import runs in one
transaction: every row is saved or none are.

- In recipe CSVs, use one row per ingredient. Rows with the same item and recipe name form one recipe,
  which replaces an existing recipe of that name.
- In price and item imports, a blank cell leaves the existing value unchanged. Write `none` to clear a
  value.
- An inventory import sets on-hand counts and logs every change with the reason you give.

### Putting an item on sale

An item appears in the shop only when it has a **base selling price** and **Approved for sale** is ticked.
Ticking it on an item with unverified or missing data (missing recipe, unverified recipes or prices,
unpriced materials anywhere in its tree) asks you to confirm and lists the problems. The same warnings stay
visible on the item page.

---

## 4. How pricing protection works

All of this runs on the server. The browser only ever sends item IDs and quantities, and every total is
recalculated at checkout.

1. **Production cost.** For a line of *Q* units the planner explodes the full recipe tree: it picks craft
   or buy per item, pools shared ingredients, rounds to whole batches, and adds per-batch and per-unit
   extras. For pricing, the cost is the full replacement cost, ignoring your stock.
2. **Tier discount.** Each product has its own tiers (copied from **Settings → default tiers** when the
   product is created). The highest tier with `minQty ≤ Q` applies.
3. **Minimum-margin floor.** The lowest allowed total is `ceil(cost ÷ (1 − minMargin%))`. If the discounted
   total would fall below it, the discount is **capped** at the floor. If even the undiscounted price misses
   the margin, no discount is given and the item page flags it so you can raise the price.
4. **Unknown cost means no discount.** If any material in the tree is unpriced, the margin can't be
   guaranteed, so tier discounts are withheld and the customer pays list price. Customers only see
   "discount limited"; costs and floors never leave the server.
5. **Custom quotes.** Lines at or above the quote threshold (per item, or the default) are flagged. The
   order can still be placed, marked as needing a quote, and you confirm the final price with
   **Agreed total** on the order page. The change is noted on the customer's timeline.
6. **Margin vs markup** are kept separate: margin = profit ÷ revenue, markup = profit ÷ cost.
   **Break-even** is the cost: the lowest total, or unit price, that doesn't lose money.

### Costing settings

- **Value gathered materials at market cost.** Off: gathered items cost their gather cost (blank = $0).
  On: they cost their market value, so your gathering time is priced in.
- **Value used stock at market.** On: stock consumed by an order counts at market value (opportunity
  cost). Off: stock you already hold is free.

---

## 5. Order workflow and inventory

```
Pending Approval → Accepted → Gathering Materials → Crafting → Ready for Delivery → Completed
        └──────────→ Cancelled (from any stage before Completed)
```

- **Approve** (Pending → Accepted) plans the order against available stock and **reserves** the stock
  it uses at every level: finished goods, intermediates and raw materials. Other orders can't use
  reserved stock.
- **Cancel** releases the reservations. Cancelling needs a reason, which the customer sees.
- **Mark delivered** (→ Completed) **deducts** the reserved stock from on-hand and logs each change.
- Active stages can be moved forwards or backwards to fix mistakes. Completed and Cancelled are final.
  Every change is recorded on the order's timeline.
- **Inventory is not synced with the game.** Update counts on the Inventory page (or by import) after
  gathering, crafting or trading. Every correction needs a reason and is logged.
- The **Production queue** combines every accepted order that isn't ready yet into one plan. It shows what
  to gather or buy, crafting steps by stage, estimated time, and surplus from batch rounding. You can
  filter it by order or customer.

### Customer side

After checkout the customer gets an order number (e.g. `PRX-7K2QM`) and a private link
`/track/PRX-7K2QM/<token>`. Only a SHA-256 hash of the token is stored. A wrong token returns the same
404 as a missing order. The page shows only that order: items, quantities, total, date, status,
instructions and a timeline.

## 6. Security summary

- Admin password: scrypt hash in `ADMIN_PASSWORD_HASH`. The session is an HS256 JWT in an HttpOnly,
  SameSite=Lax cookie (Secure in production), valid for 12 hours.
- `middleware.ts` protects `/admin/*` and `/api/admin/*`, and every admin page and server action
  checks the session again.
- Logins are throttled: 5 failures per IP, or 30 in total, within 15 minutes locks login.
- Checkout uses Zod validation, an idempotency key per checkout, rate limiting, and a server-side price
  check (if prices changed, the customer is asked to review the new total).

## Project layout

```
prisma/schema.prisma        data model
scripts/                    seed, demo seed, password hash
src/lib/engine/             pure crafting / costing / pricing / inventory engine
src/lib/                    order rules, cart quoting, import parsing, auth helpers (pure, tested)
src/server/                 database access, order workflow, admin actions, import
src/app/(store)/            storefront pages
src/app/admin/              admin pages
public/templates/           import templates (CSV + JSON)
tests/                      Vitest suites
```
