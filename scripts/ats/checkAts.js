"use strict";

/**
 * Preflight for ATS_MODE=ats. Reads the revenue-right security-token diamond and
 * reports whether Encore can drive it.
 *
 * Run:  npx hardhat run scripts/ats/checkAts.js --network hederaTestnet
 */

const hre = require("hardhat");
const { ethers } = hre;
const { ATS_SECURITY_TOKEN } = require("../../backend/src/hedera/abis");
const ROLES = require("../../backend/src/hedera/atsRoles");
require("../lib/env");

async function main() {
  const diamond = process.env.REVENUE_RIGHT_EVM_ADDRESS;
  if (!diamond || diamond === "0x...") throw new Error("REVENUE_RIGHT_EVM_ADDRESS not set");
  const adminEvm = process.env.ADMIN_EVM;

  const token = new ethers.Contract(diamond, ATS_SECURITY_TOKEN, ethers.provider);

  console.log(`\n  ATS diamond: ${diamond}`);
  try {
    console.log(`  decimals   : ${await token.decimals()}`);
    console.log(`  totalSupply: ${await token.totalSupply()}`);
  } catch (e) {
    console.log(`  (could not read ERC-20 views: ${e.shortMessage || e.message})`);
  }

  try {
    console.log(`  internal KYC activated: ${await token.isInternalKycActivated()}`);
  } catch (_) {
    console.log("  internal KYC: unknown");
  }

  console.log(`\n  Encore admin (${adminEvm}) roles:`);
  let allOk = true;
  for (const n of ROLES.ENCORE_ADMIN_ROLES) {
    // eslint-disable-next-line no-await-in-loop
    const has = await token.hasRole(ROLES[n], adminEvm).catch(() => false);
    allOk = allOk && has;
    console.log(`   ${has ? "✓" : "✗"} ${n}`);
  }

  console.log(
    allOk
      ? "\n  ✓ ready — set ATS_MODE=ats in .env\n"
      : "\n  ✗ missing roles — run: npx hardhat run scripts/ats/grantRoles.js --network hederaTestnet\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
