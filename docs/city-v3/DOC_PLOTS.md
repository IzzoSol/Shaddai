# DOC_PLOTS
Deed + dashboard + lights-as-ledger (SW petal, plots-v4.json).

## Deed row
plot_id -> owner_id -> mode (home | shop | workshop | office) -> state -> pending_sparks -> boost_lock

## States and lights
empty -> claimed -> built -> listed -> lapsed. The lights ARE the ledger:
- empty = dark
- claimed = beacon
- built = windows
- listed = cyan edge
- lapsed = dims

## Claim, build, rent
- Claim at DEED_OFFICE (existing plot system: plot_buy / plot_status).
- Build from the BUILDER_YARD catalogue (the 9-type Shaddai building library).
- Rent: landlord and tenant both pay in SPARKS.
- Missed rent -> grace period -> lapsed -> the pad dims -> claimable again, or returns to the owner empty. Unused land is not a trophy.

## Earnings and boost
- pending_sparks comes ONLY from that plot's rent + stall fees.
- Pending SPARKS travel with the deed on an in-world transfer.
- Boost: lock SPARKS on the deed, 1.0x -> max 1.5x rent. The lock is a sink; unlocking returns the lock, never interest, never to a chain.
- Adjacency flavour (optional): race-adjacent plots get a tiny race-day bonus funded from race-entry SPARKS already sunk; campus-adjacent plots get one on install days. Never printed money.

## Later, optional
The deed may mirror to an NFT TITLE: mint/claim, transfer, list/accept, set renter, lock-for-boost. It must NOT stream stocks, auto-pay USDC rent, or revenue-share a withdrawable token.
