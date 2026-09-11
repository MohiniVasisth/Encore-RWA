"use strict";

/**
 * Central configuration. Reads `.env` (see `.env.example`) and the hardcoded
 * event definition in `backend/data/event.json`, and exposes a single typed
 * object to the rest of the backend.
 *
 * `config.ready` is true only when every value needed to talk to Hedera is
 * present. When it is false the backend still boots and serves the UI, but
 * chain-touching routes return HTTP 503 with a list of the missing keys — so
 * you can develop the frontend before all Hedera resources exist.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const event = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "data", "event.json"), "utf8")
);

const ATS_MODE = process.env.ATS_MODE || "mock";

const REQUIRED_KEYS = [
  "OPERATOR_ID",
  "OPERATOR_KEY",
  "STABLECOIN_TOKEN_ID",
  "STABLECOIN_EVM_ADDRESS",
  "TICKET_ESCROW_ADDRESS",
  "FUNDING_VAULT_ADDRESS",
  // revenue-right token: a mock contract address in mock mode, an ATS diamond
  // proxy + 0.0.x id in ats mode.
  ...(ATS_MODE === "ats"
    ? ["REVENUE_RIGHT_TOKEN_ID", "REVENUE_RIGHT_EVM_ADDRESS"]
    : ["MOCK_REVENUE_RIGHT_ADDRESS"]),
];

const missing = REQUIRED_KEYS.filter((k) => {
  const v = process.env[k];
  return !v || v.includes("xxxxxx") || v === "0x...";
});

function role(name) {
  return {
    name,
    accountId: process.env[`${name.toUpperCase()}_ID`] || null,
    privateKey: process.env[`${name.toUpperCase()}_KEY`] || null,
    evmAddress: (process.env[`${name.toUpperCase()}_EVM`] || "").toLowerCase() || null,
  };
}

const decimals = Number(process.env.STABLECOIN_DECIMALS || event.stablecoinDecimals || 6);

module.exports = {
  ready: missing.length === 0,
  missing,

  port: Number(process.env.PORT || 4000),

  network: process.env.HEDERA_NETWORK || "testnet",
  rpcUrl: process.env.HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api",
  mirrorNodeUrl: process.env.MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com",

  operator: {
    accountId: process.env.OPERATOR_ID || null,
    privateKey: process.env.OPERATOR_KEY || null,
    evmKey: process.env.EVM_OPERATOR_KEY || null,
  },

  roles: {
    organizer: role("organizer"),
    investor1: role("investor1"),
    investor2: role("investor2"),
    admin: role("admin"),
    fan: role("fan"),
  },

  stablecoin: {
    tokenId: process.env.STABLECOIN_TOKEN_ID || null,
    evmAddress: (process.env.STABLECOIN_EVM_ADDRESS || "").toLowerCase() || null,
    decimals,
    unit: (n) => BigInt(Math.round(Number(n) * 10 ** decimals)),
    display: (raw) => Number(BigInt(raw)) / 10 ** decimals,
  },

  ticketNft: {
    tokenId: process.env.TICKET_NFT_TOKEN_ID || null,
    royaltyBps: Number(process.env.TICKET_RESALE_ROYALTY_BPS || 1000),
  },

  revenueRight: {
    tokenId: process.env.REVENUE_RIGHT_TOKEN_ID || null,
    evmAddress: (process.env.REVENUE_RIGHT_EVM_ADDRESS || "").toLowerCase() || null,
    totalSupply: Number(
      process.env.REVENUE_RIGHT_TOTAL_SUPPLY || event.offering.tokensForSale
    ),
  },

  ats: {
    // "mock"  → use contracts/mocks/MockRevenueRightToken.sol (no ATS needed)
    // "ats"   → use a real ATS-issued security token on Hedera
    mode: process.env.ATS_MODE || "mock",
    mockAddress: (process.env.MOCK_REVENUE_RIGHT_ADDRESS || "").toLowerCase() || null,
    // Settlement path: "dividend" (ATS corporate action) or "escrow" (fallback:
    // allocatePayouts on TicketEscrow from a mirror-node balance snapshot).
    settlementPath: process.env.ATS_SETTLEMENT_PATH || "escrow",
  },

  contracts: {
    fundingVault: (process.env.FUNDING_VAULT_ADDRESS || "").toLowerCase() || null,
    ticketEscrow: (process.env.TICKET_ESCROW_ADDRESS || "").toLowerCase() || null,
  },

  royaltyCollectorId: process.env.ROYALTY_COLLECTOR_ID || null,

  event,
};
