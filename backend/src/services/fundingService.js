"use strict";

/**
 * Funding (all-or-nothing raise) orchestration around the FundingVault contract.
 *
 * Access-control note: every state-changing call here is signed by a specific
 * role wallet. The contract enforces the real gate (ADMIN_ROLE / ORGANIZER_ROLE
 * / KYC); this layer just picks the right signer and never lets the frontend
 * choose which key signs an admin action.
 */

const config = require("../../config");
const { fundingVault, hashscan } = require("../hedera/contracts");
const { sendTx } = require("../hedera/client");
const stablecoinService = require("./stablecoinService");
const atsService = require("./atsService");
const store = require("../state/store");

const STATUS = ["Open", "Funded", "Failed"];

async function summary() {
  const v = fundingVault();
  const [s, target, raised, forSale, sold, deadline] = await v.summary();
  const d = config.stablecoin.display;
  return {
    status: STATUS[Number(s)],
    fundingTarget: d(target),
    totalRaised: d(raised),
    tokensForSale: Number(forSale),
    tokensSold: Number(sold),
    pricePerToken: d(await v.pricePerToken()),
    deadline: new Date(Number(deadline) * 1000).toISOString(),
    progressPct: Number(await v.fundingProgressBps()) / 100,
    organizerWithdrawn: await v.organizerWithdrawn(),
  };
}

/** ADMIN: approve/revoke an investor in the vault KYC mirror + the ATS control list. */
async function setKyc(roleNameOfInvestor, approved) {
  const investor = config.roles[roleNameOfInvestor];
  const v = fundingVault("admin");
  const receipt = await sendTx(() => v.setKyc(investor.evmAddress, approved), v.runner);

  // Mirror onto ATS (or the mock) so the actual token transfer will pass.
  const ats = await atsService.setKyc(investor.evmAddress, approved).catch((e) => ({
    skipped: true,
    reason: e.message,
  }));

  store.upsertInvestor(investor.evmAddress, { role: roleNameOfInvestor, kyc: approved });
  const entry = store.recordActivity(
    "kyc",
    `${approved ? "Approved" : "Revoked"} KYC for ${roleNameOfInvestor}`,
    { txHash: receipt.hash, hashscan: hashscan.tx(receipt.hash) }
  );
  return { vaultTx: receipt.hash, ats, activity: entry };
}

/** INVESTOR: buy `tokenCount` revenue-right tokens (all-or-nothing raise). */
async function invest(roleNameOfInvestor, tokenCount) {
  const investor = config.roles[roleNameOfInvestor];
  const v = fundingVault(roleNameOfInvestor);

  const pricePerToken = config.stablecoin.display(await v.pricePerToken());
  const amountDisplay = pricePerToken * tokenCount;
  const amountRaw = config.stablecoin.unit(amountDisplay);

  await stablecoinService.ensureApproval(
    roleNameOfInvestor,
    config.contracts.fundingVault,
    amountDisplay
  );

  const receipt = await sendTx(() => v.invest(amountRaw), v.runner);

  store.upsertInvestor(investor.evmAddress, {
    role: roleNameOfInvestor,
    contributed: amountDisplay,
    tokens: tokenCount,
  });
  const entry = store.recordActivity(
    "invest",
    `${roleNameOfInvestor} invested ${amountDisplay} ${config.event.currency} for ${tokenCount} tokens`,
    { txHash: receipt.hash, hashscan: hashscan.tx(receipt.hash) }
  );
  return { txHash: receipt.hash, amount: amountDisplay, tokens: tokenCount, activity: entry };
}

/** Anyone: move the offering out of Open once the target is hit or the deadline passes. */
async function finalize() {
  const v = fundingVault("admin");
  const receipt = await sendTx(() => v.finalize(), v.runner);
  const s = await summary();
  store.recordActivity("finalize", `Offering finalized: ${s.status}`, {
    txHash: receipt.hash,
    hashscan: hashscan.tx(receipt.hash),
  });
  return { txHash: receipt.hash, status: s.status };
}

/** ORGANIZER: withdraw the raise after the offering is Funded. */
async function withdrawOrganizerFunds() {
  const v = fundingVault("organizer");
  const receipt = await sendTx(() => v.withdrawOrganizerFunds(), v.runner);
  store.recordActivity("withdraw", "Organizer withdrew the raise", {
    txHash: receipt.hash,
    hashscan: hashscan.tx(receipt.hash),
  });
  return { txHash: receipt.hash };
}

/** INVESTOR: reclaim a contribution after a Failed offering. */
async function refund(roleNameOfInvestor) {
  const v = fundingVault(roleNameOfInvestor);
  const receipt = await sendTx(() => v.refund(), v.runner);
  store.recordActivity("refund", `${roleNameOfInvestor} refunded`, {
    txHash: receipt.hash,
    hashscan: hashscan.tx(receipt.hash),
  });
  return { txHash: receipt.hash };
}

/**
 * ADMIN: deliver revenue-right tokens to an investor through ATS, then mark it on
 * the vault. ATS re-checks KYC on this transfer.
 */
async function deliverTokens(roleNameOfInvestor) {
  const investor = config.roles[roleNameOfInvestor];
  const v = fundingVault();
  const allocation = Number(await v.tokenAllocation(investor.evmAddress));
  if (allocation === 0) throw new Error(`${roleNameOfInvestor} has no allocation`);

  const transfer = await atsService.transferRevenueRight(
    investor.accountId || investor.evmAddress,
    allocation
  );

  const vAdmin = fundingVault("admin");
  const receipt = await sendTx(
    () => vAdmin.markTokensDelivered(investor.evmAddress),
    vAdmin.runner
  );

  store.upsertInvestor(investor.evmAddress, { delivered: true });
  store.recordActivity(
    "deliver",
    `Delivered ${allocation} revenue-right tokens to ${roleNameOfInvestor}`,
    { txHash: receipt.hash, hashscan: hashscan.tx(receipt.hash), ats: transfer }
  );
  return { allocation, atsTransfer: transfer, markTx: receipt.hash };
}

module.exports = {
  summary,
  setKyc,
  invest,
  finalize,
  withdrawOrganizerFunds,
  refund,
  deliverTokens,
};
