"use strict";

/**
 * Deploy FundingVault for the hardcoded offering.
 * Run:  npm run deploy:vault
 */

const hre = require("hardhat");
const { event, unit, need } = require("./lib");
const { writeEnv } = require("../lib/env");

async function main() {
  const stablecoin = need("STABLECOIN_EVM_ADDRESS");
  const admin = need("ADMIN_EVM");
  const organizer = need("ORGANIZER_EVM");

  const o = event.offering;
  const deadline =
    Math.floor(Date.now() / 1000) + Number(o.fundingDurationHours || 72) * 3600;

  const args = [
    stablecoin,
    admin,
    organizer,
    unit(o.fundingTarget),
    unit(o.pricePerToken),
    BigInt(o.tokensForSale),
    BigInt(deadline),
  ];

  console.log("  deploying FundingVault with:", {
    stablecoin,
    admin,
    organizer,
    fundingTarget: o.fundingTarget,
    pricePerToken: o.pricePerToken,
    tokensForSale: o.tokensForSale,
    deadline: new Date(deadline * 1000).toISOString(),
  });

  const Vault = await hre.ethers.getContractFactory("FundingVault");
  const vault = await Vault.deploy(...args);
  await vault.waitForDeployment();
  const address = await vault.getAddress();

  console.log(`\n  FundingVault → ${address}`);
  console.log(`  https://hashscan.io/testnet/contract/${address}\n`);
  writeEnv({ FUNDING_VAULT_ADDRESS: address });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
