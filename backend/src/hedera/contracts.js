"use strict";

/**
 * Factory for ethers Contract instances bound to a role's wallet (for writes) or
 * the provider (for reads), plus small helpers for HashScan links.
 */

const { ethers } = require("ethers");
const config = require("../../config");
const { provider, wallet } = require("./client");
const abis = require("./abis");

function ticketEscrow(roleName) {
  if (!config.contracts.ticketEscrow) throw new Error("TICKET_ESCROW_ADDRESS not set");
  const runner = roleName ? wallet(roleName) : provider();
  return new ethers.Contract(config.contracts.ticketEscrow, abis.TICKET_ESCROW, runner);
}

function fundingVault(roleName) {
  if (!config.contracts.fundingVault) throw new Error("FUNDING_VAULT_ADDRESS not set");
  const runner = roleName ? wallet(roleName) : provider();
  return new ethers.Contract(config.contracts.fundingVault, abis.FUNDING_VAULT, runner);
}

function stablecoin(roleName) {
  if (!config.stablecoin.evmAddress) throw new Error("STABLECOIN_EVM_ADDRESS not set");
  const runner = roleName ? wallet(roleName) : provider();
  return new ethers.Contract(config.stablecoin.evmAddress, abis.ERC20, runner);
}

const NET = config.network === "mainnet" ? "mainnet" : "testnet";

const hashscan = {
  tx: (idOrHash) => `https://hashscan.io/${NET}/transaction/${idOrHash}`,
  token: (tokenId) => `https://hashscan.io/${NET}/token/${tokenId}`,
  account: (idOrEvm) => `https://hashscan.io/${NET}/account/${idOrEvm}`,
  contract: (addr) => `https://hashscan.io/${NET}/contract/${addr}`,
};

module.exports = { ticketEscrow, fundingVault, stablecoin, hashscan };
