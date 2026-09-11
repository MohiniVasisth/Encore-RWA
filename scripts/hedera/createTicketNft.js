"use strict";

/**
 * Create the ticket NFT collection on HTS with a native resale royalty fee.
 *
 *   royalty  = TICKET_RESALE_ROYALTY_BPS (default 10%) of the fungible payment
 *   fallback = a small fixed mUSD fee when a transfer carries no payment
 *              (discourages hidden off-platform transfers)
 *   collector = the TicketEscrow contract, so royalties land straight in the
 *               investor pool. Requires the escrow to be deployed AND associated
 *               with the stablecoin first (scripts/deploy/wireUp.js does that).
 *
 * Run (after deploy:escrow + wireUp):  npm run hedera:ticket-nft
 */

const {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  CustomRoyaltyFee,
  CustomFixedFee,
  Hbar,
} = require("@hashgraph/sdk");
const {
  operatorClient,
  parseKey,
  evmAddressToId,
} = require("../lib/hedera");
const { writeEnv, requireEnv } = require("../lib/env");

async function main() {
  requireEnv(["STABLECOIN_TOKEN_ID", "TICKET_ESCROW_ADDRESS"]);

  const client = operatorClient();
  const supplyKey = parseKey(process.env.OPERATOR_KEY);

  const royaltyBps = Number(process.env.TICKET_RESALE_ROYALTY_BPS || 1000);
  const stablecoinId = process.env.STABLECOIN_TOKEN_ID;
  const decimals = Number(process.env.STABLECOIN_DECIMALS || 6);

  const collectorId = await evmAddressToId(process.env.TICKET_ESCROW_ADDRESS);
  console.log(`  royalty collector (escrow): ${collectorId}`);

  const fallbackFee = new CustomFixedFee()
    .setAmount(2 * 10 ** decimals) // 2 mUSD flat when no payment accompanies the transfer
    .setDenominatingTokenId(stablecoinId);

  const royalty = new CustomRoyaltyFee()
    .setNumerator(royaltyBps)
    .setDenominator(10_000)
    .setFeeCollectorAccountId(collectorId)
    .setFallbackFee(fallbackFee);

  const tx = await new TokenCreateTransaction()
    .setTokenName("Encore Ticket — Delhi Music Festival")
    .setTokenSymbol("ENCT")
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(Number(process.env.TICKET_MAX_SUPPLY || 6000))
    .setInitialSupply(0)
    .setTreasuryAccountId(client.operatorAccountId)
    .setSupplyKey(supplyKey)
    .setAdminKey(supplyKey)
    .setCustomFees([royalty])
    .setMaxTransactionFee(new Hbar(40))
    .freezeWith(client)
    .sign(supplyKey);

  const resp = await tx.execute(client);
  const receipt = await resp.getReceipt(client);
  const tokenId = receipt.tokenId.toString();

  console.log(`\n  ticket NFT token id : ${tokenId}`);
  console.log(`  resale royalty      : ${royaltyBps / 100}%  → ${collectorId}`);
  console.log(`  https://hashscan.io/testnet/token/${tokenId}\n`);

  writeEnv({
    TICKET_NFT_TOKEN_ID: tokenId,
    ROYALTY_COLLECTOR_ID: collectorId,
  });

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
