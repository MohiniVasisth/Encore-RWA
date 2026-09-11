"use strict";

/**
 * Ticket NFT lifecycle on Hedera Token Service.
 *
 *  - The NFT collection is created once by scripts/hedera/createTicketNft.js with
 *    a native royalty fee: `resaleRoyaltyPct` of the fungible payment on every
 *    resale is routed to the royalty collector (set to the TicketEscrow address),
 *    with a small fixed fallback fee when a transfer carries no payment.
 *  - After a successful on-chain primary sale (TicketEscrow.buyTicket), the
 *    backend mints one serial and transfers it to the buyer here.
 *  - A resale moves the serial + the stablecoin payment in one atomic transfer;
 *    HTS applies the royalty automatically. We then call escrow.syncRoyalties().
 */

const {
  TokenMintTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  NftId,
  TokenId,
} = require("@hashgraph/sdk");

const config = require("../../config");
const { sdkClient, signerFor } = require("../hedera/client");
const { hashscan } = require("../hedera/contracts");
const store = require("../state/store");

function assertConfigured() {
  if (!config.ticketNft.tokenId || config.ticketNft.tokenId.includes("xxxxxx")) {
    throw new Error("TICKET_NFT_TOKEN_ID not set — run `npm run hedera:ticket-nft`");
  }
}

/** Associate a role account with the ticket NFT collection (signed by that role). */
async function associateRole(roleName) {
  assertConfigured();
  const client = sdkClient();
  const { accountId, key } = signerFor(roleName);
  const tx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([config.ticketNft.tokenId])
    .freezeWith(client)
    .sign(key);
  const resp = await tx.execute(client);
  const rec = await resp.getReceipt(client);
  return { status: rec.status.toString(), txId: resp.transactionId.toString() };
}

/**
 * Mint a ticket serial and hand it to `ownerRole`. `escrowSerial` is the serial
 * number TicketEscrow returned, embedded in the NFT metadata for traceability.
 */
async function mintTo(ownerRole, escrowSerial, eventName) {
  assertConfigured();
  const client = sdkClient();
  const tokenId = config.ticketNft.tokenId;
  const owner = config.roles[ownerRole].accountId;

  const metadata = Buffer.from(
    JSON.stringify({ event: eventName, escrowSerial, issuedAt: Date.now() })
  ).subarray(0, 100); // HTS metadata cap

  const mint = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .addMetadata(metadata)
    .execute(client);
  const mintRec = await mint.getReceipt(client);
  const nftSerial = mintRec.serials[0].toString();

  const transfer = await new TransferTransaction()
    .addNftTransfer(TokenId.fromString(tokenId), Number(nftSerial), config.operator.accountId, owner)
    .execute(client);
  const transferRec = await transfer.getReceipt(client);

  const ticket = store.recordTicket(escrowSerial, {
    owner: ownerRole,
    ownerAccountId: owner,
    nftSerial,
    mintTxId: mint.transactionId.toString(),
    boughtAt: new Date().toISOString(),
  });

  return {
    nftSerial,
    status: transferRec.status.toString(),
    mintTxId: mint.transactionId.toString(),
    transferTxId: transfer.transactionId.toString(),
    hashscan: hashscan.tx(mint.transactionId.toString()),
    ticket,
  };
}

/**
 * Resell ticket `nftSerial` from `fromRole` to `toRole` for `priceDisplay`
 * stablecoin, in one atomic transfer. HTS deducts the royalty automatically and
 * sends it to the collector (TicketEscrow). Signed by both the seller (NFT) and
 * buyer (payment).
 */
async function resell(fromRole, toRole, nftSerial, priceDisplay) {
  assertConfigured();
  const client = sdkClient();
  const seller = signerFor(fromRole);
  const buyer = signerFor(toRole);
  const amount = Number(config.stablecoin.unit(priceDisplay));

  let tx = new TransferTransaction()
    .addNftTransfer(
      TokenId.fromString(config.ticketNft.tokenId),
      Number(nftSerial),
      seller.accountId,
      buyer.accountId
    )
    .addTokenTransfer(config.stablecoin.tokenId, buyer.accountId, -amount)
    .addTokenTransfer(config.stablecoin.tokenId, seller.accountId, amount);

  tx = await tx.freezeWith(client).sign(seller.key);
  tx = await tx.sign(buyer.key);
  const resp = await tx.execute(client);
  const rec = await resp.getReceipt(client);

  const royalty = priceDisplay * (config.ticketNft.royaltyBps / 10_000);
  const entry = store.recordActivity(
    "resale",
    `${fromRole} resold ticket #${nftSerial} to ${toRole} for ${priceDisplay} ${config.event.currency} — royalty ${royalty} to investor pool`,
    { txId: resp.transactionId.toString(), hashscan: hashscan.tx(resp.transactionId.toString()) }
  );

  return {
    status: rec.status.toString(),
    txId: resp.transactionId.toString(),
    grossPrice: priceDisplay,
    royaltyToPool: royalty,
    sellerNet: priceDisplay - royalty,
    activity: entry,
  };
}

module.exports = { associateRole, mintTo, resell };
