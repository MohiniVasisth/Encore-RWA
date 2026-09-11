"use strict";

/**
 * Deploy the mock ATS revenue-right token (ATS_MODE=mock only).
 * Ownership (KYC / freeze / issue admin) is transferred to the Encore `admin`
 * account right after deploy, so the same signer controls compliance and
 * issuance in both mock and real ATS mode (backend/src/services/atsService.js
 * always calls these as `admin`).
 * Run:  npx hardhat run scripts/deploy/deployMockRevenueRight.js --network hederaTestnet
 */

const hre = require("hardhat");
const { writeEnv } = require("../lib/env");
const { need } = require("./lib");

async function main() {
  const Token = await hre.ethers.getContractFactory("MockRevenueRightToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const address = await token.getAddress();

  const adminAddress = need("ADMIN_EVM");
  const transferTx = await token.transferOwnership(adminAddress);
  await transferTx.wait();

  console.log(`\n  MockRevenueRightToken → ${address}`);
  console.log(`  owner (transferred)   → ${adminAddress}`);
  console.log(`  https://hashscan.io/testnet/contract/${address}\n`);
  writeEnv({
    MOCK_REVENUE_RIGHT_ADDRESS: address,
    REVENUE_RIGHT_EVM_ADDRESS: address,
    ATS_MODE: "mock",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
