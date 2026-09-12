"use strict";

/**
 * Asset Tokenization Studio (ATS) integration boundary.
 *
 * Every operation on the compliant revenue-right security token goes through
 * here so the rest of the backend never needs to know which implementation is
 * live:
 *
 *   config.ats.mode === "mock" → contracts/mocks/MockRevenueRightToken.sol
 *   config.ats.mode === "ats"  → a real ATS security-token diamond on Hedera,
 *                                called directly via ethers on the diamond proxy
 *                                (REVENUE_RIGHT_EVM_ADDRESS), signed by `admin`.
 *
 * Why direct diamond calls and not @hashgraph/asset-tokenization-sdk: the SDK
 * (v8) signs only through browser wallets or custodial services (DFNS /
 * Fireblocks / AWS KMS) — it has no raw-private-key signer for a backend. The
 * ATS diamond exposes every facet function we need as a normal contract call, so
 * we use the same ethers + JSON-RPC-relay path as the rest of Encore.
 *
 * Prereq for "ats" mode: the Encore `admin` account must hold the ATS roles
 * in atsRoles.ENCORE_ADMIN_ROLES. Grant them with scripts/ats/grantRoles.js.
 * See docs/ATS_INTEGRATION.md.
 */

const { ethers } = require("ethers");
const config = require("../../config");
const { provider, wallet, sendTx } = require("../hedera/client");
const { hashscan } = require("../hedera/contracts");
const abis = require("../hedera/abis");
const ROLES = require("../hedera/atsRoles");

const MOCK_ABI = [
  "function setKyc(address account, bool approved)",
  "function setFrozen(address account, bool frozen)",
  "function issue(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function isKycApproved(address) view returns (bool)",
  "function isFrozen(address) view returns (bool)",
  // Custom errors — listed so ethers can decode a revert into a readable
  // reason instead of "unknown custom error" (see MockRevenueRightToken.sol).
  "error ReceiverNotKyc(address account)",
  "error SenderFrozen(address account)",
  "error ReceiverFrozen(address account)",
];

const KYC_VALIDITY_SECONDS =
  Number(process.env.ATS_KYC_VALIDITY_YEARS || 5) * 365 * 24 * 3600;

function isMock() {
  return config.ats.mode === "mock";
}

function tokenAddress() {
  const a = isMock() ? config.ats.mockAddress : config.revenueRight.evmAddress;
  if (!a) {
    throw new Error(
      isMock()
        ? "MOCK_REVENUE_RIGHT_ADDRESS not set"
        : "REVENUE_RIGHT_EVM_ADDRESS not set (ATS diamond proxy)"
    );
  }
  return a;
}

function token(roleName) {
  const runner = roleName ? wallet(roleName) : provider();
  return new ethers.Contract(
    tokenAddress(),
    isMock() ? MOCK_ABI : abis.ATS_SECURITY_TOKEN,
    runner
  );
}

/** The revenue-right token contract, bound to a role wallet (or the provider). */
function tokenContract(roleName) {
  return token(roleName);
}

/** Normalised { kyc, frozen, balance } for a holder, across mock and ATS. */
async function holderStatus(evmAddress) {
  const account = evmOf(evmAddress);
  const t = token();
  if (isMock()) {
    return {
      kyc: await t.isKycApproved(account),
      frozen: await t.isFrozen(account),
      balance: Number(await t.balanceOf(account)),
    };
  }
  const decimals = Number(await t.decimals());
  return {
    kyc: Number(await t.getKycStatusFor(account)) === 1,
    frozen: await t.isFrozen(account),
    balance: Number(await t.balanceOf(account)) / 10 ** decimals,
  };
}

function evmOf(idOrEvm) {
  if (typeof idOrEvm === "string" && idOrEvm.startsWith("0x")) return idOrEvm;
  for (const r of Object.values(config.roles)) {
    if (r.accountId === idOrEvm && r.evmAddress) return r.evmAddress;
  }
  throw new Error(`Cannot resolve EVM address for ${idOrEvm}`);
}

// --------------------------------------------------------------------------- //
//                        Preflight (ats mode only)                            //
// --------------------------------------------------------------------------- //

let _internalKycEnsured = false;

/** Ensure internal-KYC mode is on so ROLE_KYC can grant KYC without a VC issuer. */
async function ensureInternalKyc() {
  if (isMock() || _internalKycEnsured) return;
  const t = token();
  if (!(await t.isInternalKycActivated())) {
    const tAdmin = token("admin");
    await sendTx(() => tAdmin.activateInternalKyc(), tAdmin.runner);
  }
  _internalKycEnsured = true;
}

/** Report which required ATS roles the admin account holds. */
async function roleReport() {
  if (isMock()) return { mode: "mock", ok: true, roles: {} };
  const admin = config.roles.admin.evmAddress;
  const t = token();
  const roles = {};
  for (const name of ROLES.ENCORE_ADMIN_ROLES) {
    roles[name] = await t.hasRole(ROLES[name], admin);
  }
  return { mode: "ats", admin, ok: Object.values(roles).every(Boolean), roles };
}

// --------------------------------------------------------------------------- //
//                          KYC / control list                                 //
// --------------------------------------------------------------------------- //

async function setKyc(evmAddress, approved) {
  const account = evmOf(evmAddress);

  if (isMock()) {
    const t = token("admin");
    const r = await sendTx(() => t.setKyc(account, approved), t.runner);
    return { mode: "mock", txHash: r.hash, hashscan: hashscan.tx(r.hash) };
  }

  await ensureInternalKyc();
  const t = token("admin");
  const r = approved
    ? await sendTx(() => {
        const now = Math.floor(Date.now() / 1000);
        return t.grantKyc(
          account,
          "encore-demo-vc",
          now,
          now + KYC_VALIDITY_SECONDS,
          config.roles.admin.evmAddress // issuer (internal KYC)
        );
      }, t.runner)
    : await sendTx(() => t.revokeKyc(account), t.runner);
  return { mode: "ats", txHash: r.hash, hashscan: hashscan.tx(r.hash) };
}

async function setFrozen(evmAddress, frozen) {
  const account = evmOf(evmAddress);
  const t = token("admin");

  if (isMock()) {
    const r = await sendTx(() => t.setFrozen(account, frozen), t.runner);
    return { mode: "mock", txHash: r.hash, hashscan: hashscan.tx(r.hash) };
  }

  const r = await sendTx(() => t.setAddressFrozen(account, frozen), t.runner);
  return { mode: "ats", txHash: r.hash, hashscan: hashscan.tx(r.hash) };
}

// --------------------------------------------------------------------------- //
//                          Issuance / delivery                                //
// --------------------------------------------------------------------------- //

/** Deliver `amount` whole revenue-right tokens to an investor (primary issuance). */
async function transferRevenueRight(recipient, amount) {
  const to = evmOf(recipient);

  if (isMock()) {
    // Owned by `admin` (see scripts/deploy/deployMockRevenueRight.js), matching
    // ATS mode where admin holds ROLE_ISSUER — same signer controls compliance
    // and issuance in both modes.
    const t = token("admin");
    const r = await sendTx(() => t.issue(to, BigInt(amount)), t.runner);
    return { mode: "mock", amount, txHash: r.hash, hashscan: hashscan.tx(r.hash) };
  }

  // ATS: mint from the issuer (admin holds ROLE_ISSUER). ATS enforces that the
  // recipient is KYC-approved and not frozen.
  const decimals = Number(await token().decimals());
  const raw = BigInt(amount) * 10n ** BigInt(decimals);
  const t = token("admin");
  const r = await sendTx(() => t.mint(to, raw), t.runner);
  return {
    mode: "ats",
    amount,
    raw: raw.toString(),
    txHash: r.hash,
    hashscan: hashscan.tx(r.hash),
  };
}

// --------------------------------------------------------------------------- //
//                        Balances snapshot (settlement)                       //
// --------------------------------------------------------------------------- //

/**
 * Holder balances of the revenue-right token, for pro-rata settlement via the
 * escrow path. Mock: read the contract. ATS: read the mirror node (works for any
 * HTS/ATS token, no ATS-specific call).
 */
async function balancesSnapshot() {
  if (isMock()) {
    const t = token();
    const supply = Number(await t.totalSupply());
    const holders = [];
    for (const [name, r] of Object.entries(config.roles)) {
      if (!r.evmAddress) continue;
      const bal = Number(await t.balanceOf(r.evmAddress));
      if (bal > 0) holders.push({ role: name, evmAddress: r.evmAddress, balance: bal });
    }
    return { supply, holders };
  }

  const url = `${config.mirrorNodeUrl}/api/v1/tokens/${config.revenueRight.tokenId}/balances?limit=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mirror node ${res.status}`);
  const body = await res.json();
  const decimals = config.stablecoin.decimals; // ATS equity typically 0-6 dp
  const holders = (body.balances || [])
    .filter((b) => Number(b.balance) > 0)
    .map((b) => ({ accountId: b.account, balance: Number(b.balance) }));
  const supply = holders.reduce((s, h) => s + h.balance, 0);
  return { supply, holders, decimals };
}

/** ATS: take an on-chain snapshot of holder balances (ROLE_SNAPSHOT). */
async function takeSnapshot() {
  if (isMock()) return { mode: "mock", skipped: true };
  const t = token("admin");
  const r = await sendTx(() => t.takeSnapshot(), t.runner);
  return { mode: "ats", txHash: r.hash, hashscan: hashscan.tx(r.hash) };
}

// --------------------------------------------------------------------------- //
//                                Settlement                                   //
// --------------------------------------------------------------------------- //

/**
 * Register an equity dividend for the pool (ROLE_CORPORATE_ACTION).
 *
 * `perTokenDisplay` is the payout per revenue-right token in stablecoin display
 * units. ATS records the corporate action; funding the payout and distributing
 * to holders is then done with the ATS Mass Payout tool (or holder claims),
 * which is outside this contract call.
 *
 * The reliable default remains ATS_SETTLEMENT_PATH=escrow.
 */
async function payDividend(perTokenDisplay) {
  if (config.ats.settlementPath !== "dividend") {
    throw new Error("ATS_SETTLEMENT_PATH is not 'dividend' — use the escrow path");
  }
  if (isMock()) throw new Error("dividend path requires ATS_MODE=ats");

  const now = Math.floor(Date.now() / 1000);
  const dividend = {
    recordDate: now + 60,
    executionDate: now + 120,
    amount: config.stablecoin.unit(perTokenDisplay),
    amountDecimals: config.stablecoin.decimals,
  };
  const t = token("admin");
  const r = await sendTx(() => t.setDividend(dividend), t.runner);

  return {
    mode: "ats",
    registered: dividend,
    txHash: r.hash,
    hashscan: hashscan.tx(r.hash),
    note:
      "Dividend registered. Fund and distribute with the ATS Mass Payout tool; " +
      "holders as of recordDate receive amount/token.",
  };
}

module.exports = {
  isMock,
  roleReport,
  ensureInternalKyc,
  tokenContract,
  holderStatus,
  setKyc,
  setFrozen,
  transferRevenueRight,
  balancesSnapshot,
  takeSnapshot,
  payDividend,
};
