Build "Proximity Supply Co.", my private bulk-ordering and crafting-management website for my business on Proximity RP (a custom Garry's Mod roleplay server, https://www.proximityrp.com/). It is an independent, player-run shop, not an official Proximity RP site. I'm the only seller. Customers are other players who order large quantities. I fulfil orders manually in-game. All money is Proximity RP in-game dollars. No real-money payments.

## Start from the code in this folder

This folder already contains a tested foundation. Read it before writing anything:

- `prisma/schema.prisma` — full data model: items (raw / intermediate / product), recipes with alternatives, ingredients, per-product discount tiers, orders, order lines, order events, stock reservations, inventory adjustments, settings, login attempts.
- `src/lib/engine/` — pure TypeScript crafting, costing and pricing engine. Keep its behaviour; extend it if needed.
  - `planner.ts`: multi-level explosion with unlimited depth, aggregation of shared ingredients before batch rounding, batch round-up with surplus tracking, stock deduction at every level, missing-material lists, circular-dependency detection (`CycleError`), craft-vs-buy choice across alternative recipes, crafting stages, crafting time, ingredient tree.
  - `pricing.ts`: per-product tier discounts, minimum-margin floor (discounts are capped so profit never falls below the item's minimum margin; discounts are withheld when cost is unknown), custom-quote threshold, margin vs markup kept separate, break-even price.
  - `inventory.ts`: available stock net of reservations, reservations from a plan, fulfilment deltas, low-stock.
- `tests/engine.test.ts` — 47 passing tests for crafting maths, batch rounding, stock deduction, cycles, costs and pricing. Run them with `npm test` (Vitest) and keep them green.
- `src/server/` — Prisma client, settings with defaults, catalog loading, server-authoritative cart pricing and order planning (started, not finished).
- `package.json`, `tsconfig.json`, Tailwind/PostCSS, `.env.example` with pinned versions.

Stack: Next.js 15 App Router, TypeScript, Tailwind, PostgreSQL, Prisma. Use server actions or route handlers as you see fit.

## Data accuracy rules (important)

There are NO verified Proximity RP recipes, material costs or selling prices yet. I'll add them. So:
- Do not invent recipes, ingredients, quantities, prices or craft times.
- `npm run db:seed` must only create these real raw resources the server is known to have: Coal, Iron, Gold (mining), Crops (farming), Fish, Crab (fishing). No prices, all marked UNVERIFIED.
- `npm run db:seed:demo` loads a separate, clearly labelled demo set (names starting "Demo:", `isDemo = true`, generic Item A/B/C/D style recipes) so I can try the workflow. Admin needs a "Delete demo data" button.
- Every recipe and price has a Verified / Unverified status. Items missing a recipe show "Unverified — Recipe Required".
- An item is only sold publicly when I've set a price and switched on "Approved for sale". Warn me when approving something with unverified data.

## Customer storefront

- Homepage: branding, how bulk ordering works, featured and popular products, the bulk discount tiers, a prominent "Start Ordering" button. Footer notes it's an independent player business.
- Catalogue: search by name, filter by category, prices in in-game $, custom quantity input, live tier discount preview, add to cart.
- Cart (kept in localStorage, priced by the server): edit quantities, instant recalculation, discounts shown, final total, blocks unavailable or unpriced items, flags lines that need a custom quote.
- Checkout: in-game name, Discord username, optional instructions. Server recalculates everything; never trust browser prices. Zod validation, an idempotency key to stop duplicate submissions, and basic rate limiting.
- After ordering, the customer gets an order number (e.g. PRX-7K2QM) and a private tracking link with a random token. Store only a hash of the token. Order pages show only that order: number, items and quantities, total, date, status, instructions, and a status timeline.
- Statuses: Pending Approval, Accepted, Gathering Materials, Crafting, Ready for Delivery, Completed, Cancelled.
- Payment and delivery happen in-game. Say so clearly.

## Admin (only me)

- Login with a single admin password: scrypt hash in `ADMIN_PASSWORD_HASH` (add `npm run admin:hash`), signed HttpOnly session cookie (`SESSION_SECRET`, jose), middleware protecting `/admin` and admin APIs, login attempt throttling, and authorisation checks inside every admin action.
- Dashboard: pending orders, orders being crafted, total revenue, estimated profit, outstanding material requirements, items ready to deliver, inventory value, low-stock alerts.
- Orders: list and filter all orders; approve or reject; change status (record each change as an event); expected delivery time; notes; payment received toggle; mark delivered. Each order shows its full crafting plan, cost, revenue, profit, margin %, markup %, and break-even price.
- Inventory: on hand, reserved, available for raw, intermediate and finished items; manual corrections with a reason log. Reserve stock for an order when accepting it (using the plan's `fromStock` at every level). Cancelling releases reservations. Completing deducts the reserved stock. Note that inventory is not synced with the game.
- Production queue: combine all accepted, not-finished orders into one plan. Filter by order and customer. Show required items, quantities, available stock, what's left to gather or buy, crafting steps by stage, estimated time, and surplus from batch rounding.
- Items and recipes editor: editable tables for materials, products, recipes (multiple alternatives, output per craft, craft time, station, skill and level, extra cost per batch), prices (buy, gather, market value, sell, base selling price), acquisition (purchased / gathered / from stock), craft-or-buy preference, per-product discount tiers (copied from default tiers on creation), minimum margin, quote threshold, low-stock threshold, featured and popular flags.
- Item page: crafting tree visualisation, craft-vs-buy comparison for every intermediate, cost and profit at a chosen quantity.
- Profitability rankings: profit per unit, per order and per production hour.
- Settings: business name, my Discord, orders open/closed, value gathered materials at market cost (on/off), value used stock at market (on/off), default tiers, default minimum margin, default quote threshold.
- Import / export: CSV and JSON for materials, recipes, products, prices and inventory, with a preview and validation errors before saving. Show cycle warnings from `findCycles`. Include template files.

## Design

Dark theme, clean wholesale-platform look (not a game-themed page), strong typography, well-designed product cards, subtle animations, excellent mobile layout, desktop-friendly admin tables. Consistent branding throughout.

## Finish properly

1. `npm install`, set up `.env` from `.env.example`, `prisma db push`, seed.
2. Build everything above. Prioritise correct calculations and a working order workflow over visual extras.
3. Add tests for any new logic (order totals, reservations, status transitions, import parsing). Keep all tests passing.
4. Run `npm run typecheck`, `npm test` and `npm run build`, then start the app, load the demo data and walk through a full order from cart to Completed, fixing anything broken.
5. Write a README covering setup, deployment (Vercel plus a hosted Postgres such as Neon), how to add recipes, and how pricing protection works.
6. Commit to a new GitHub repo called `prox-supply` and tell me what's left for me to fill in.
