"use strict";

/**
 * Post-deploy wiring. Idempotent — safe to re-run.
 *
 *   1. TicketEscrow + FundingVault associate with the stablecoin (so they can
 *      hold it, and so the escrow can receive resale royalties).
 *   2. Role accounts (organizer, investors, fan) associate with the stablecoin.
 *   3. Fund the role accounts with test mUSD from the operator treasury.
 *   4. (mock ATS) KYC the operator + investors on the mock revenue-right token.
 *
 * Run:  npx hardhat run scripts/deploy/wireUp.js --network hederaTestnet
 */

const hre = require("hardhat");
const {
  Client,
  AccountId,
  TokenAssociateTransaction,
  TokenMintTransaction,
  TransferTransaction,
} = require("@hashgraph/sdk");
const { parseKey } = require("../lib/hedera");
const { event, decimals, unit, need } = require("./lib");

const ROLES = ["organizer", "investor1", "investor2", "fan"];

function sdk() {
  const c = Client.forTestnet();
  c.setOperator(AccountId.fromString(need("OPERATOR_ID")), parseKey(need("OPERATOR_KEY")));
  return c;
}

async function associateContractWithStablecoin(name, address, adminWallet) {
  const c = (await hre.ethers.getContractAt(name, address)).connect(adminWallet);
  try {
    const tx = await c.associateStablecoin();
    await tx.wait();
    console.log(`  ✓ ${name} associated with stablecoin`);
  } catch (e) {
    console.log(`  · ${name} associate skipped (${e.shortMessage || e.message})`);
  }
}

async function associateRole(client, roleName, tokenId) {
  const id = need(`${roleName.toUpperCase()}_ID`);
  const key = parseKey(need(`${roleName.toUpperCase()}_KEY`));
  try {
    const tx = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(id))
      .setTokenIds([tokenId])
      .freezeWith(client)
      .sign(key);
    await (await tx.execute(client)).getReceipt(client);
    console.log(`  ✓ ${roleName} associated with ${tokenId}`);
  } catch (e) {
    console.log(`  · ${roleName} associate skipped (${e.message})`);
  }
}

async function fundRole(client, roleName, amountDisplay) {
  const to = need(`${roleName.toUpperCase()}_ID`);
  const tokenId = need("STABLECOIN_TOKEN_ID");
  const amount = Number(unit(amountDisplay));
  await (await new TokenMintTransaction().setTokenId(tokenId).setAmount(amount).execute(client)).getReceipt(client);
  await (
    await new TransferTransaction()
      .addTokenTransfer(tokenId, client.operatorAccountId, -amount)
      .addTokenTransfer(tokenId, to, amount)
      .execute(client)
  ).getReceipt(client);
  console.log(`  ✓ funded ${roleName} with ${amountDisplay} mUSD`);
}

async function main() {
  const client = sdk();
  const stablecoinId = need("STABLECOIN_TOKEN_ID");

  // associateStablecoin() is onlyRole(ADMIN_ROLE) on both contracts — the
  // default Hardhat signer is the operator/deployer, which does NOT hold
  // that role, so this must be signed by the admin account explicitly.
  const adminWallet = new hre.ethers.Wallet(need("ADMIN_KEY"), hre.ethers.provider);

  console.log("\n[1/4] contract ↔ stablecoin association");
  await associateContractWithStablecoin("TicketEscrow", need("TICKET_ESCROW_ADDRESS"), adminWallet);
  await associateContractWithStablecoin("FundingVault", need("FUNDING_VAULT_ADDRESS"), adminWallet);

  console.log("\n[2/4] role ↔ stablecoin association");
  for (const r of ROLES) await associateRole(client, r, stablecoinId);

  console.log("\n[3/4] fund role accounts with test mUSD");
  const perInvestor = event.offering.fundingTarget; // enough to fully fund the raise alone
  await fundRole(client, "investor1", perInvestor);
  await fundRole(client, "investor2", perInvestor);
  await fundRole(client, "fan", event.tickets.price * 200);
  await fundRole(client, "organizer", 0.000001);

  console.log("\n[4/4] mock ATS KYC");
  if ((process.env.ATS_MODE || "mock") === "mock" && process.env.MOCK_REVENUE_RIGHT_ADDRESS) {
    // Owned by `admin` post-deploy (see deployMockRevenueRight.js) — must sign
    // as admin, not the default (operator) signer.
    const token = (
      await hre.ethers.getContractAt(
        "MockRevenueRightToken",
        process.env.MOCK_REVENUE_RIGHT_ADDRESS
      )
    ).connect(adminWallet);
    const targets = [
      process.env.ORGANIZER_EVM,
      process.env.INVESTOR1_EVM,
      // investor2 is intentionally left un-KYC'd for the compliance demo
    ].filter(Boolean);
    for (const addr of targets) {
      const tx = await token.setKyc(addr, true);
      await tx.wait();
      console.log(`  ✓ KYC ${addr}`);
    }
    console.log("  · investor2 left un-KYC'd on purpose (compliance demo)");
  } else {
    console.log("  · skipped (ATS mode or mock address not set)");
  }

  console.log("\n  wireUp complete.\n");
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
