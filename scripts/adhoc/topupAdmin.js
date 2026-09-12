"use strict";

/**
 * One-off: top up the admin account with HBAR from the operator treasury.
 * The admin wallet pays gas for associateStablecoin() on every fresh
 * FundingVault/TicketEscrow deploy (via demo:reset), so it runs low over
 * repeated redeploys.
 *
 * Run: node scripts/adhoc/topupAdmin.js [amount]
 */

const { TransferTransaction, AccountId, Hbar } = require("@hashgraph/sdk");
const { operatorClient } = require("../lib/hedera");
const { requireEnv } = require("../lib/env");

async function main() {
  requireEnv(["ADMIN_ID"]);
  const amount = Number(process.argv[2] || 20);
  const client = operatorClient();

  const tx = await new TransferTransaction()
    .addHbarTransfer(client.operatorAccountId, new Hbar(-amount))
    .addHbarTransfer(AccountId.fromString(process.env.ADMIN_ID), new Hbar(amount))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  console.log(`  ✓ sent ${amount} ℏ to admin (${process.env.ADMIN_ID}) — ${receipt.status.toString()}`);

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
