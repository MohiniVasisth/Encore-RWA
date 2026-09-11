"use strict";

/**
 * Read-only aggregate of the event's on-chain financial health, for the live
 * dashboard. Everything here is derived from the chain (+ the activity log).
 */

const config = require("../../config");
const escrowService = require("./escrowService");
const fundingService = require("./fundingService");
const { hashscan } = require("../hedera/contracts");
const store = require("../state/store");

async function snapshot() {
  const [escrow, funding] = await Promise.all([
    escrowService.financials().catch((e) => ({ error: e.message })),
    fundingService.summary().catch((e) => ({ error: e.message })),
  ]);

  const supply = config.revenueRight.totalSupply;
  const pool = escrow.investorPool || 0;

  return {
    event: {
      name: config.event.name,
      currency: config.event.currency,
      disclaimer: config.event.disclaimer,
    },
    funding,
    tickets: {
      sold: escrow.ticketsSold,
      cap: escrow.maxTickets,
      price: escrow.ticketPrice,
      salesOpen: escrow.salesOpen,
      settled: escrow.settled,
    },
    revenue: {
      primaryRevenue: escrow.primaryRevenue,
      organizerProceeds: escrow.organizerProceeds,
      investorPool: pool,
      royaltiesCollected: escrow.royaltiesCollected,
      investorSharePct: (escrow.investorShareBps || 0) / 100,
    },
    payout: {
      revenueRightSupply: supply,
      estimatedPerToken: escrow.estimatedPayoutPerToken,
      poolIfSettledNow: pool,
    },
    links: {
      ticketEscrow: config.contracts.ticketEscrow
        ? hashscan.contract(config.contracts.ticketEscrow)
        : null,
      fundingVault: config.contracts.fundingVault
        ? hashscan.contract(config.contracts.fundingVault)
        : null,
      revenueRightToken: config.revenueRight.tokenId
        ? hashscan.token(config.revenueRight.tokenId)
        : null,
      ticketNft: config.ticketNft.tokenId ? hashscan.token(config.ticketNft.tokenId) : null,
      stablecoin: config.stablecoin.tokenId ? hashscan.token(config.stablecoin.tokenId) : null,
    },
    activity: store.get().activity.slice(0, 30),
    settlement: store.get().settlement,
  };
}

module.exports = { snapshot };
