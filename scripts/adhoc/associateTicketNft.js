"use strict";

/**
 * One-off: associate role accounts with the ticket NFT collection so they can
 * receive/hold it (needed because the collection was created after tickets 1-12
 * were already sold, so the auto-mint-on-purchase step failed for them).
 *
 * Run: node scripts/adhoc/associateTicketNft.js
 */

const { TokenAssociateTransaction, AccountId } = require("@hashgraph/sdk");
const { operatorClient, parseKey } = require("../lib/hedera");
const { requireEnv } = require("../lib/env");

const ROLES = ["FAN", "INVESTOR2"];

async function main() {
  requireEnv(["TICKET_NFT_TOKEN_ID"]);
  const client = operatorClient();
  const tokenId = process.env.TICKET_NFT_TOKEN_ID;

  for (const role of ROLES) {
    const id = process.env[`${role}_ID`];
    const key = parseKey(process.env[`${role}_KEY`]);
    try {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(id))
        .setTokenIds([tokenId])
        .freezeWith(client)
        .sign(key);
      const rec = await (await tx.execute(client)).getReceipt(client);
      console.log(`  ✓ ${role} (${id}) associated with ${tokenId} — ${rec.status.toString()}`);
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
