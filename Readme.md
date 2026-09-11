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

## Getting started

The code is fully written but ships unconfigured — no `.env`, no deployed
contracts. Follow these in order.

### 0. Prerequisites

- Node.js 18+
- A Hedera **testnet** account (create one free at
  [portal.hedera.com](https://portal.hedera.com))

### 1. Install and sanity-check the contracts

```bash
npm install
npm run compile
npm test
```

This runs the Hardhat test suite against `FundingVault.sol`, `TicketEscrow.sol`,
and the mock revenue-right token — no Hedera connection needed yet.

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `OPERATOR_ID` / `OPERATOR_KEY` / `EVM_OPERATOR_KEY` from your Hedera
testnet account, then generate the demo role accounts (organizer, investor1,
investor2, admin, fan):

```bash
npm run hedera:accounts
```

Paste the generated IDs/keys back into `.env`. Full details on every variable
are in `docs/HEDERA_RESOURCES_NEEDED.md`.

### 3. Deploy to Hedera testnet

Run in this order — later steps depend on addresses from earlier ones:

```bash
npm run hedera:stablecoin      # creates mUSD, fill STABLECOIN_* in .env
npm run deploy:vault           # FundingVault, fill FUNDING_VAULT_ADDRESS
npm run deploy:escrow          # TicketEscrow, fill TICKET_ESCROW_ADDRESS
npm run hedera:ticket-nft      # Ticket NFT (royalty collector = TicketEscrow)
npm run deploy:mock-rr         # mock revenue-right token (ATS_MODE=mock)
npm run wireup                 # wires the deployed contracts together
```

### 4. Validate end-to-end

```bash
npm run demo
```

Walks the full lifecycle (fund → sell tickets → resell → settle → claim)
script-only, before involving the UI — the fastest way to catch a
misconfiguration.

### 5. Run the app locally

```bash
npm run backend     # or: npm run dev   (auto-restart on change)
```

Then open `frontend/index.html`. Without a backend it falls back to a
read-only **preview mode**; with the backend running against your testnet
deployment, every tab (Funding, Tickets, Resale, Compliance, Settlement,
Health) is live.

### 6. Deploy to production (Vercel)

`vercel.json` + `api/index.js` are already wired: `/api/*` routes to the
backend as a serverless function, everything else serves `frontend/` as
static files. Set the same variables from your `.env` in the Vercel project's
**Settings → Environment Variables**, then deploy. With no env vars set the
site still deploys and runs in preview mode.
