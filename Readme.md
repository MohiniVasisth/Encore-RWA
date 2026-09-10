# Encore

**Programmable event revenue securities on Hedera.** Investors put money into an
event before it happens and get paid back from its ticket sales — with the
payout collected and split automatically on-chain instead of trusted to the
organizer.

> Hackathon prototype on Hedera testnet. Nothing here is an offer of securities
> or financial advice.

---

## The problem

Event organizers pay for the venue, artists, and marketing months before a
single ticket is sold. Borrowing against a future event is hard, so smaller
organizers self-fund or give up large stakes.

Revenue-sharing deals already exist on paper, but they have one weak spot: the
investor only knows what the organizer *tells* them the event earned. Report
lower revenue, pay investors less.

## The idea

An organizer sells a token that represents a fixed share (say 18%) of the
event's future ticket revenue. Verified investors buy the token and fund the
event upfront. After the event, the collected pool is paid out to token holders
in proportion to how much they hold.

The token is a financial right to a slice of revenue — not ownership of the
event, the venue, or the company.

## Why it's trustworthy

Tickets are sold through a smart contract (`TicketEscrow`). For every ticket:

- the organizer's share is sent to them immediately, and
- the investors' share is locked in the contract until settlement.

The organizer never touches the investor money, so revenue that flows through
Encore can't be quietly under-reported. Anyone can check the pool balance
on-chain.

Tickets are also issued as NFTs with a built-in 10% resale royalty, so when a
fan resells a ticket, part of that resale price goes to the investor pool too.

## Worked example

The "Delhi Music Festival" wants **$30,000** upfront and offers **18%** of ticket
revenue. It issues **3,000 tokens at $10 each**. Every $50 ticket splits into
**$9 to the pool / $41 to the organizer**.

| Outcome | Ticket revenue | Investor pool | Payout / token | Return |
|---|---|---|---|---|
| Weak sales | $120,000 | $21,600 | $7.20 | −28% |
| As expected | $200,000 | $36,000 | $12.00 | +20% |
| Strong sales | $250,000 | $45,000 | $15.00 | +50% |

An investment can lose money — that's the point of showing all three.

## The lifecycle

1. **Offering** — organizer defines the event and terms
2. **Funding** — KYC-approved investors buy the revenue-right token (all-or-nothing: if the target is missed by the deadline, everyone is refunded and the organizer gets nothing)
3. **Ticket sales** — the escrow splits every sale and mints a ticket NFT
4. **Resale** — 10% of each ticket resale is routed to the investor pool
5. **Compliance** — the token can't be held or transferred by unverified or frozen accounts
6. **Settlement** — after the event, the pool is paid out to token holders
7. **Event health** — tickets sold, pool balance, and estimated payout per token, all read live from the chain
