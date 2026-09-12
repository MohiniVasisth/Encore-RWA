"use strict";

const express = require("express");
const config = require("../../config");
const { wrap } = require("../middleware/role");
const { hashscan } = require("../hedera/contracts");

const router = express.Router();

/** The hardcoded offering terms + on-chain identifiers (no chain call). */
router.get(
  "/",
  wrap(async (_req, res) => {
    const o = config.event.offering;
    const t = config.event.tickets;
    res.json({
      event: config.event.name,
      description: config.event.description,
      currency: config.event.currency,
      terms: {
        fundingTarget: o.fundingTarget,
        tokensForSale: o.tokensForSale,
        pricePerToken: o.pricePerToken,
        revenueSharePct: o.revenueSharePct,
        ticketPrice: t.price,
        maxTickets: t.maxTickets,
        resaleRoyaltyPct: t.resaleRoyaltyPct,
        splitPerTicket: {
          pool: +(t.price * (o.revenueSharePct / 100)).toFixed(2),
          organizer: +(t.price * (1 - o.revenueSharePct / 100)).toFixed(2),
        },
      },
      scenarios: buildScenarios(config.event),
      onChain: {
        // mock mode: the revenue-right "token" is a plain EVM contract
        // (MockRevenueRightToken), not an HTS token — link/id it accordingly.
        revenueRightTokenId: config.ats.mode === "mock" ? config.ats.mockAddress : config.revenueRight.tokenId,
        ticketNftTokenId: config.ticketNft.tokenId,
        stablecoinTokenId: config.stablecoin.tokenId,
        fundingVault: config.contracts.fundingVault,
        ticketEscrow: config.contracts.ticketEscrow,
        links: {
          revenueRightToken:
            config.ats.mode === "mock"
              ? config.ats.mockAddress && hashscan.contract(config.ats.mockAddress)
              : config.revenueRight.tokenId && hashscan.token(config.revenueRight.tokenId),
          fundingVault:
            config.contracts.fundingVault && hashscan.contract(config.contracts.fundingVault),
          ticketEscrow:
            config.contracts.ticketEscrow && hashscan.contract(config.contracts.ticketEscrow),
        },
      },
      disclaimer: config.event.disclaimer,
    });
  })
);

function buildScenarios(event) {
  const o = event.offering;
  const share = o.revenueSharePct / 100;
  return Object.entries(event.scenarios).map(([key, s]) => {
    const ticketRevenue = s.ticketsSold * event.tickets.price;
    const pool = ticketRevenue * share;
    const perToken = pool / o.tokensForSale;
    const cost = o.pricePerToken;
    return {
      key,
      label: s.label,
      ticketsSold: s.ticketsSold,
      ticketRevenue,
      investorPool: +pool.toFixed(2),
      payoutPerToken: +perToken.toFixed(2),
      returnPct: +(((perToken - cost) / cost) * 100).toFixed(1),
    };
  });
}

module.exports = router;
