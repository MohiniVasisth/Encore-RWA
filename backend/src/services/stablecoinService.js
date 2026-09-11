"use strict";

/**
 * Settlement stablecoin helpers.
 *
 * On Hedera testnet the stablecoin is an HTS fungible token. It is reachable two
 * ways: through its ERC-20 facade (used here for approve/allowance/transfer from
 * contract flows) and through the HTS SDK (used for treasury mint + associate).
 */

const {
  TokenMintTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  AccountId,
} = require("@hashgraph/sdk");

const config = require("../../config");
const { sdkClient, signerFor, sendTx } = require("../hedera/client");
const { stablecoin, hashscan } = require("../hedera/contracts");

// HTS fungible tokens (which this ERC-20 facade sits on top of) store amounts
// as a signed int64 under the hood. `ethers.MaxUint256` — the usual "infinite
// approval" idiom — overflows that and makes the precompile revert the whole
// approve() call. The largest positive int64 is the effective ceiling.
const MAX_HTS_APPROVAL = 2n ** 63n - 1n;

/** ERC-20 balance of an EVM address, in display units. */
async function balanceOf(evmAddress) {
  const raw = await stablecoin().balanceOf(evmAddress);
  return config.stablecoin.display(raw);
}

/** Ensure `roleName` has approved `spender` for at least `displayAmount`. */
async function ensureApproval(roleName, spender, displayAmount) {
  const owner = config.roles[roleName].evmAddress;
  const need = config.stablecoin.unit(displayAmount);
  const sc = stablecoin(roleName);
  const current = await sc.allowance(owner, spender);
  if (current >= need) return null;

  const receipt = await sendTx(() => sc.approve(spender, MAX_HTS_APPROVAL), sc.runner);
  return { txHash: receipt.hash, hashscan: hashscan.tx(receipt.hash) };
}

/**
 * Treasury-mint stablecoin and airdrop it to a role account. Used only to fund
 * the demo accounts. Requires the operator to be the token treasury + supply key.
 */
async function fundRole(roleName, displayAmount) {
  const client = sdkClient();
  const amount = Number(config.stablecoin.unit(displayAmount));
  const tokenId = config.stablecoin.tokenId;
  const to = config.roles[roleName].accountId;

  await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(amount)
    .execute(client)
    .then((r) => r.getReceipt(client));

  const transfer = await new TransferTransaction()
    .addTokenTransfer(tokenId, config.operator.accountId, -amount)
    .addTokenTransfer(tokenId, to, amount)
    .execute(client);
  const rec = await transfer.getReceipt(client);

  return {
    status: rec.status.toString(),
    txId: transfer.transactionId.toString(),
    hashscan: hashscan.tx(transfer.transactionId.toString()),
  };
}

/** Associate a role account with the stablecoin (signed by that role). */
async function associateRole(roleName) {
  const client = sdkClient();
  const { accountId, key } = signerFor(roleName);
  const tx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([config.stablecoin.tokenId])
    .freezeWith(client)
    .sign(key);
  const resp = await tx.execute(client);
  const rec = await resp.getReceipt(client);
  return { status: rec.status.toString(), txId: resp.transactionId.toString() };
}

module.exports = { balanceOf, ensureApproval, fundRole, associateRole };
