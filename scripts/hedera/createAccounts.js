"use strict";

/**
 * Create the 5 remaining demo role accounts (Organizer, Investor1, Investor2,
 * Admin, Fan) from a single funded operator account, and write their ids,
 * ECDSA hex keys, and EVM addresses into .env.
 *
 * Requires OPERATOR_ID / OPERATOR_KEY already set in .env (see
 * docs/HEDERA_RESOURCES_NEEDED.md — create + fund that one via
 * https://portal.hedera.com).
 *
 * Run:  node scripts/hedera/createAccounts.js
 * Optional: FUND_HBAR=20 node scripts/hedera/createAccounts.js  (default 15 ℏ each)
 */

const { AccountCreateTransaction, PrivateKey, Hbar } = require("@hashgraph/sdk");
const { operatorClient } = require("../lib/hedera");
const { writeEnv } = require("../lib/env");

const ROLES = ["ORGANIZER", "INVESTOR1", "INVESTOR2", "ADMIN", "FAN"];
const FUND_HBAR = Number(process.env.FUND_HBAR || 15);

async function main() {
  const client = operatorClient();
  const updates = {};

  for (const role of ROLES) {
    const key = PrivateKey.generateECDSA();

    // setECDSAKeyWithAlias (not setKeyWithoutAlias) — the account needs its
    // EVM alias set at creation so the JSON-RPC relay (Hashio/Hardhat) can
    // resolve it as a transaction sender. Without it, every ethers-signed
    // call from this account fails with "Sender account not found" even
    // though the key itself is correct.
    const tx = await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(key)
      .setInitialBalance(new Hbar(FUND_HBAR))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const accountId = receipt.accountId.toString();
    const rawEvm = key.publicKey.toEvmAddress();
    const evmAddress = rawEvm.startsWith("0x") ? rawEvm : `0x${rawEvm}`;

    console.log(`  ${role.padEnd(10)} ${accountId}   ${evmAddress}`);

    updates[`${role}_ID`] = accountId;
    updates[`${role}_KEY`] = key.toStringRaw().startsWith("0x")
      ? key.toStringRaw()
      : `0x${key.toStringRaw()}`;
    updates[`${role}_EVM`] = evmAddress;
  }

  writeEnv(updates);
  client.close();

  console.log(`\n  ✓ created ${ROLES.length} accounts, funded with ${FUND_HBAR} ℏ each\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
