# Architecture

```
                 ┌───────────────────────────────────────────────┐
                 │  frontend/  — one page, role switcher (vanilla)│
                 └───────────────────────┬───────────────────────┘
                                         │  REST /api/*
                 ┌───────────────────────▼───────────────────────┐
                 │  backend/  — Node + Express                    │
                 │                                               │
                 │  routes/      thin HTTP, role validation       │
                 │  services/    orchestration, one per domain    │
                 │    fundingService   escrowService              │
                 │    nftService       complianceService          │
                 │    atsService       healthService              │
                 │    stablecoinService                           │
                 │  hedera/      client (SDK + ethers), ABIs       │
                 │  state/       JSON store (off-chain metadata)   │
                 └───────┬───────────────────────┬───────────────┘
                         │ @hashgraph/sdk        │ ethers + JSON-RPC relay
                         ▼                       ▼
        ┌────────────────────────┐   ┌──────────────────────────────┐
        │ Hedera Token Service   │   │ Hedera Smart Contract Service │
        │  • mUSD stablecoin     │   │  • FundingVault.sol           │
        │  • Ticket NFT (royalty)│   │  • TicketEscrow.sol           │
        │  • ATS revenue-right   │   │  • MockRevenueRightToken.sol   │
        │    security token      │   │    (ATS_MODE=mock)             │
        └────────────────────────┘   └──────────────────────────────┘
                         │                       │
                         └───────────┬───────────┘
                                     ▼
                        HashScan + Mirror Node (public verification)
```

## The two contracts

### `FundingVault.sol` — the all-or-nothing raise
- KYC-approved investors `invest()` stablecoin in whole-token multiples.
- `finalize()` (permissionless): `Funded` when target met, `Failed` when the
  deadline passes under target.
- `Funded` → organizer `withdrawOrganizerFunds()` once; admin delivers ATS
  tokens and calls `markTokensDelivered()`.
- `Failed` → every investor `refund()`s in full; organizer gets nothing.

### `TicketEscrow.sol` — Proof of Revenue
- `buyTicket()` pulls the ticket price, **transfers the organizer share out
  immediately**, keeps the investor share locked. Returns a serial; the backend
  mints the matching ticket NFT.
- Resale royalties (HTS native fee, collector = this contract) arrive with no
  call; `syncRoyalties()` (permissionless) folds them into the pool.
- `closeAndSettle(supply)` freezes the pool; `allocatePayouts(holders, balances)`
  sets pro-rata claims from an off-chain snapshot; holders `claim()`.
- Accounting invariant: `stablecoin.balanceOf(this) >= poolCredited - poolDistributed`.

## Access control (enforced on-chain)

| Action | Gate |
|--------|------|
| open/close sales, configure event, settle, allocate, sweep, set KYC, freeze, deliver | `ADMIN_ROLE` |
| withdraw the raise | `ORGANIZER_ROLE` |
| `buyTicket`, `invest` (KYC-gated), `refund`, `claim`, `syncRoyalties`, `finalize` | public |
| receive / transfer revenue-right token | ATS KYC + freeze rules |

The backend never lets the frontend choose which key signs an admin call — each
service method hard-codes the signing role. See `backend/src/middleware/role.js`.

## Why the backend signs (no browser wallet in the MVP)

Four pre-created testnet accounts, backend-held keys, role switcher in the UI.
This keeps the live demo deterministic. Wallet connect (HashPack / MetaMask via
the relay) is listed as future work in the proposal.
