"use strict";

/**
 * Deploy TicketEscrow for the hardcoded event.
 * Run:  npm run deploy:escrow
 */

const hre = require("hardhat");
const { event, unit, need } = require("./lib");
const { writeEnv } = require("../lib/env");

async function main() {
  const stablecoin = need("STABLECOIN_EVM_ADDRESS");
  const admin = need("ADMIN_EVM");
  const organizer = need("ORGANIZER_EVM");

  const investorShareBps = Math.round(event.offering.revenueSharePct * 100);
  const args = [
    stablecoin,
    admin,
    organizer,
    unit(event.tickets.price),
    investorShareBps,
    BigInt(event.tickets.maxTickets),
  ];

  console.log("  deploying TicketEscrow with:", {
    stablecoin,
    admin,
    organizer,
    ticketPrice: event.tickets.price,
    investorShareBps,
    maxTickets: event.tickets.maxTickets,
  });

  const Escrow = await hre.ethers.getContractFactory("TicketEscrow");
  const escrow = await Escrow.deploy(...args);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  console.log(`\n  TicketEscrow → ${address}`);
  console.log(`  https://hashscan.io/testnet/contract/${address}\n`);
  console.log("  Next: run scripts/deploy/wireUp.js, then npm run hedera:ticket-nft");
  writeEnv({ TICKET_ESCROW_ADDRESS: address });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
