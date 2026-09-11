"use strict";

/**
 * Grant the Encore `admin` account the ATS roles it needs on the
 * revenue-right security token.
 *
 * Must be run by the token's DEFAULT_ADMIN (the diamond owner — usually whoever
 * created the token in the ATS UI / deploy). Set ATS_OWNER_KEY in .env to that
 * account's raw ECDSA key, or it falls back to EVM_OPERATOR_KEY.
 *
 * Run:  npx hardhat run scripts/ats/grantRoles.js --network hederaTestnet
 */

const hre = require("hardhat");
const { ethers } = hre;
const { ATS_SECURITY_TOKEN } = require("../../backend/src/hedera/abis");
const ROLES = require("../../backend/src/hedera/atsRoles");
require("../lib/env");

function need(k) {
  const v = process.env[k];
  if (!v || v.includes("xxxxxx") || v === "0x...") throw new Error(`Missing .env: ${k}`);
  return v;
}

async function main() {
  const diamond = need("REVENUE_RIGHT_EVM_ADDRESS");
  const adminEvm = need("ADMIN_EVM");
  const ownerKey = process.env.ATS_OWNER_KEY || need("EVM_OPERATOR_KEY");

  const owner = new ethers.Wallet(
    ownerKey.startsWith("0x") ? ownerKey : `0x${ownerKey}`,
    ethers.provider
  );
  const token = new ethers.Contract(diamond, ATS_SECURITY_TOKEN, owner);

  console.log(`  diamond : ${diamond}`);
  console.log(`  owner   : ${owner.address}`);
  console.log(`  grantee : ${adminEvm} (Encore admin)\n`);

  if (!(await token.hasRole(ROLES.DEFAULT_ADMIN_ROLE, owner.address))) {
    throw new Error(
      `${owner.address} does not hold DEFAULT_ADMIN_ROLE on the token — set ATS_OWNER_KEY`
    );
  }

  const roleNames = ROLES.ENCORE_ADMIN_ROLES;
  const roleHashes = roleNames.map((n) => ROLES[n]);
  const actives = roleNames.map(() => true);

  // One call: applyRoles(bytes32[] roles, bool[] actives, address account)
  const tx = await token.applyRoles(roleHashes, actives, adminEvm);
  const r = await tx.wait();
  console.log(`  applyRoles tx: ${r.hash}`);
  console.log(`  https://hashscan.io/testnet/transaction/${r.hash}\n`);

  for (const n of roleNames) {
    const has = await token.hasRole(ROLES[n], adminEvm);
    console.log(`   ${has ? "✓" : "✗"} ${n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
