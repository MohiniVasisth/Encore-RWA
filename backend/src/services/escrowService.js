"use strict";

/**
 * TicketEscrow orchestration — the "Proof of Revenue" flow.
 *
 * Access control: admin-only calls (setSalesOpen, closeAndSettle,
 * allocatePayouts, sweepDust) are always signed by the `admin` wallet here; the
 * contract still enforces ADMIN_ROLE. `buyTicket` is signed by the buyer (fan).
 */

const config = require("../../config");
const { ticketEscrow, hashscan } = require("../hedera/contracts");
const { sendTx } = require("../hedera/client");
const stablecoinService = require("./stablecoinService");
const nftService = require("./nftService");
const atsService = require("./atsService");
const store = require("../state/store");

const d = (raw) => config.stablecoin.display(raw);

async function financials() {
  const e = ticketEscrow();
  const [sold, cap, grossPrimary, toOrganizer, poolNow, royalties, isSettled] =
    await e.financials();
  const supply = config.revenueRight.totalSupply;
  const perToken = Number(await e.estimatedPayoutPerToken(supply));

  return {
    ticketsSold: Number(sold),
    maxTickets: Number(cap),
    primaryRevenue: d(grossPrimary),
    organizerProceeds: d(toOrganizer),
    investorPool: d(poolNow),
    royaltiesCollected: d(royalties),
    settled: isSettled,
    salesOpen: await e.salesOpen(),
    ticketPrice: d(await e.ticketPrice()),
    investorShareBps: Number(await e.investorShareBps()),
    revenueRightSupply: supply,
    estimatedPayoutPerToken: perToken / 10 ** config.stablecoin.decimals,
  };
}

/** ADMIN: open or close primary sales. */
async function setSalesOpen(open) {
  const e = ticketEscrow("admin");
  const r = await sendTx(() => e.setSalesOpen(open), e.runner);
  store.recordActivity("sales", `Primary sales ${open ? "opened" : "closed"}`, {
    txHash: r.hash,
    hashscan: hashscan.tx(r.hash),
  });
  return { txHash: r.hash };
}

/**
 * FAN: buy one primary ticket. Splits on-chain, then mints the ticket NFT to the
 * fan. `buyerRole` is one of the pre-created accounts acting as the fan.
 */
async function buyTicket(buyerRole) {
  const e = ticketEscrow(buyerRole);
  const price = d(await e.ticketPrice());

  await stablecoinService.ensureApproval(buyerRole, config.contracts.ticketEscrow, price);

  const receipt = await sendTx(() => e.buyTicket(), e.runner);

  // Recover the serial from the TicketPurchased event.
  const parsed = receipt.logs
    .map((l) => {
      try {
        return e.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((x) => x && x.name === "TicketPurchased");
  const serial = parsed ? Number(parsed.args.serial) : null;
  const investorCut = parsed ? d(parsed.args.investorCut) : price * 0.18;
  const organizerCut = parsed ? d(parsed.args.organizerCut) : price * 0.82;

  const nft = await nftService
    .mintTo(buyerRole, serial, config.event.name)
    .catch((err) => ({ error: err.message }));

  const entry = store.recordActivity(
    "ticket",
    `${buyerRole} bought ticket #${serial} — ${organizerCut} to organizer, ${investorCut} to pool`,
    { txHash: receipt.hash, hashscan: hashscan.tx(receipt.hash) }
  );

  return { serial, price, organizerCut, investorCut, txHash: receipt.hash, nft, activity: entry };
}

/** Buy `count` primary tickets in sequence (demo convenience). */
async function buyBatch(buyerRole, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await buyTicket(buyerRole));
  }
  return results;
}

/** Anyone: fold resale royalties sitting in the contract into the investor pool. */
async function syncRoyalties() {
  const e = ticketEscrow("admin");
  const r = await sendTx(() => e.syncRoyalties(), e.runner);
  const f = await financials();
  store.recordActivity("sync", `Synced resale royalties — pool now ${f.investorPool}`, {
    txHash: r.hash,
    hashscan: hashscan.tx(r.hash),
  });
  return { txHash: r.hash, investorPool: f.investorPool };
}

/**
 * ADMIN: settle. Preferred path is an ATS dividend; the escrow fallback closes
 * sales, snapshots holder balances from the mirror node / mock, and allocates
 * pro-rata claims on the contract for holders to {claim}.
 */
async function settle() {
  if (config.ats.settlementPath === "dividend") {
    const f = await financials();
    const perToken = f.investorPool / (config.revenueRight.totalSupply || 1);
    const dividend = await atsService.payDividend(perToken);
    store.recordActivity("settle", `Registered ATS dividend of ${perToken}/token`, dividend);
    return { path: "dividend", perToken, dividend };
  }
  return settleViaEscrow();
}

async function settleViaEscrow() {
  const e = ticketEscrow("admin");
  const snapshot = await atsService.balancesSnapshot();
  const supply = snapshot.supply || config.revenueRight.totalSupply;

  if (!(await e.settled())) {
    await sendTx(() => e.closeAndSettle(supply), e.runner);
  }

  // Resolve holder EVM addresses.
  const holders = [];
  const balances = [];
  for (const h of snapshot.holders) {
    let evm = h.evmAddress;
    if (!evm && h.accountId) {
      const role = Object.values(config.roles).find((r) => r.accountId === h.accountId);
      evm = role && role.evmAddress;
    }
    if (!evm) continue;
    holders.push(evm);
    balances.push(BigInt(h.balance));
  }

  const allocReceipt = await sendTx(() => e.allocatePayouts(holders, balances), e.runner);

  const poolAtSettlement = d(await e.poolAtSettlement());
  store.get().settlement = {
    at: new Date().toISOString(),
    path: "escrow",
    poolAtSettlement,
    supplySnapshot: supply,
    allocations: holders.map((h, i) => ({
      holder: h,
      balance: Number(balances[i]),
      claimable: (poolAtSettlement * Number(balances[i])) / supply,
    })),
  };
  store.persist();
  store.recordActivity(
    "settle",
    `Settled via escrow — pool ${poolAtSettlement} allocated across ${holders.length} holders`,
    { txHash: allocReceipt.hash, hashscan: hashscan.tx(allocReceipt.hash) }
  );

  return { path: "escrow", poolAtSettlement, supply, holders: holders.length };
}

/** HOLDER: claim an allocated payout after escrow settlement. */
async function claim(holderRole) {
  const e = ticketEscrow(holderRole);
  const r = await sendTx(() => e.claim(), e.runner);
  store.recordActivity("claim", `${holderRole} claimed their payout`, {
    txHash: r.hash,
    hashscan: hashscan.tx(r.hash),
  });
  return { txHash: r.hash };
}

async function claimableFor(holderRole) {
  const addr = config.roles[holderRole].evmAddress;
  return d(await ticketEscrow().claimable(addr));
}

module.exports = {
  financials,
  setSalesOpen,
  buyTicket,
  buyBatch,
  syncRoyalties,
  settle,
  settleViaEscrow,
  claim,
  claimableFor,
};
