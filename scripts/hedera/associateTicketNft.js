"use strict";

/**
 * Associate every demo role account with the current ticket NFT collection.
 *
 * The NFT collection is recreated by `npm run hedera:ticket-nft` whenever
 * TicketEscrow is redeployed (its resale royalty collector is baked in at
 * creation time), which means every role needs a fresh association with the
 * *new* token id — otherwise a resale to an account that never received a
 * ticket on this token fails with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT.
 *
 * Safe to re-run: an already-associated account is skipped, not an error.
 *
 * Run:  npm run hedera:associate-nft
 */

const { AccountId, TokenAssociateTransaction } = require("@hashgraph/sdk");
const { parseKey, operatorClient } = require("../lib/hedera");
const { need } = require("../deploy/lib");

const ROLES = ["organizer", "investor1", "investor2", "admin", "fan"];

async function main() {
  const client = operatorClient();
  const tokenId = need("TICKET_NFT_TOKEN_ID");

  for (const role of ROLES) {
    const accountId = need(`${role.toUpperCase()}_ID`);
    const key = parseKey(need(`${role.toUpperCase()}_KEY`));
    try {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(accountId))
        .setTokenIds([tokenId])
        .freezeWith(client)
        .sign(key);
      await (await tx.execute(client)).getReceipt(client);
      console.log(`  ✓ ${role} associated with ${tokenId}`);
    } catch (e) {
      console.log(`  · ${role} associate skipped (${e.message})`);
    }
  }

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
