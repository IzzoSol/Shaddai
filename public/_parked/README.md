# Parked pages

Pages pulled from the live site because they were not good enough to show, but
worth keeping rather than deleting.

| Page | Why it was pulled |
|---|---|
| `playbooks.html` | Janky and unfinished. 168 lines. Inbound links were removed at the same time rather than left to 404 — a dead link is a worse signal than a missing feature. |

## Putting one back

Move it up to `public/`, then re-add the links. Nothing else references these.

## NOT parked, deliberately

`pricing.html` also needs a rewrite, but it carries all four live Stripe
checkout buttons (founder · pro · max · sparks) and is linked from 17 places.
Pulling it would remove the only way anyone can pay. It should be REPLACED,
never removed — the checkout has to keep working through the rewrite.
