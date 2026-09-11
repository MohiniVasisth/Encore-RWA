"use strict";

/** Shared @hashgraph/sdk client + key parsing for the scripts. */

const {
  Client,
  PrivateKey,
  AccountId,
  TokenId,
  AccountBalanceQuery,
} = require("@hashgraph/sdk");

require("./env");

function parseKey(raw) {
  const s = String(raw).trim();
  try {
    if (s.startsWith("0x") || s.length === 64) return PrivateKey.fromStringECDSA(s);
  } catch (_) {}
  try {
    return PrivateKey.fromStringED25519(s);
  } catch (_) {
    return PrivateKey.fromString(s);
  }
}

function operatorClient() {
  const id = process.env.OPERATOR_ID;
  const key = process.env.OPERATOR_KEY;
  if (!id || !key || id.includes("xxxxxx")) {
    throw new Error("OPERATOR_ID / OPERATOR_KEY not set in .env");
  }
  const client =
    (process.env.HEDERA_NETWORK || "testnet") === "mainnet"
      ? Client.forMainnet()
      : Client.forTestnet();
  client.setOperator(AccountId.fromString(id), parseKey(key));
  return client;
}

/** 0.0.x id → 0x EVM address (left-padded). */
function idToEvmAddress(idStr) {
  const id = idStr.includes(".") ? TokenId.fromString(idStr) : TokenId.fromString(`0.0.${idStr}`);
  return "0x" + id.toSolidityAddress();
}

/**
 * 0x EVM address → 0.0.x id, via the mirror node.
 *
 * `AccountId.fromEvmAddress` only decodes the "long-zero" address form
 * (0x000...<8-byte-num>), which is how Hedera *accounts* alias their EVM
 * address but NOT how a contract deployed through the JSON-RPC relay gets
 * one (that's a normal hash-derived create address). So for a contract we
 * have to ask the mirror node to resolve it to its native id.
 */
async function evmAddressToId(addr) {
  const mirror = (process.env.MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com").replace(/\/$/, "");

  for (const kind of ["contracts", "accounts"]) {
    const res = await fetch(`${mirror}/api/v1/${kind}/${addr}`);
    if (res.ok) {
      const data = await res.json();
      const id = kind === "contracts" ? data.contract_id : data.account;
      if (id) return id;
    }
  }

  // Fall back to the long-zero derivation (works if addr is that form).
  return AccountId.fromEvmAddress(0, 0, addr).toString();
}

module.exports = {
  parseKey,
  operatorClient,
  idToEvmAddress,
  evmAddressToId,
  AccountId,
  TokenId,
  AccountBalanceQuery,
};
