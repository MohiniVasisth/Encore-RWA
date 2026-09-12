"use strict";

/**
 * Compliance demo: the four cases from the proposal.
 *
 *   1. KYC-approved investor buys tokens                     → Succeeds
 *   2. Unverified account tries to receive tokens            → Rejected
 *   3. Admin freezes an investor, who then tries to transfer → Rejected
 *   4. Admin unfreezes the investor and they transfer again  → Succeeds
 *
 * All enforcement lives in ATS (or the mock). This service just drives the
 * scenario and reports pass/fail so the UI can show it live. It talks to the
 * revenue-right token through atsService, so it works in both modes.
 */

const config = require("../../config");
const atsService = require("./atsService");
const { sendTx } = require("../hedera/client");
const store = require("../state/store");

// The Hashio JSON-RPC relay confirms a state-changing tx (setKyc/setFrozen)
// quickly via its receipt, but the very next eth_estimateGas call is served
// from the relay's mirror-node-backed view, which can lag a couple seconds
// behind consensus. Without this pause, a transfer attempted right after an
// unfreeze/KYC-approve can still see the old (frozen/unapproved) state and
// get rejected even though the change already landed on-chain.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RELAY_SETTLE_MS = 2500;

async function status(roleName) {
  const addr = config.roles[roleName].evmAddress;
  const s = await atsService.holderStatus(addr);
  return { role: roleName, evmAddress: addr, ...s };
}

async function setFrozen(roleName, frozen) {
  const res = await atsService.setFrozen(config.roles[roleName].evmAddress, frozen);
  store.recordActivity("compliance", `${frozen ? "Froze" : "Unfroze"} ${roleName}`, res);
  return res;
}

/**
 * Attempt a revenue-right transfer `fromRole` → `toRole` of `amount` whole
 * tokens and report whether ATS allowed it.
 *
 * Retries a few times when the failure does NOT decode to one of the
 * contract's own compliance errors (ReceiverNotKyc / SenderFrozen /
 * ReceiverFrozen) — that shape means the relay never actually got a real
 * answer back from the chain (a stale mirror-node read, a dropped request,
 * "could not coalesce error", etc.), not a genuine on-chain rejection. A
 * decoded compliance error, by contrast, is real and reported immediately.
 */
async function attemptTransfer(fromRole, toRole, amount, attempts = 3) {
  const to = config.roles[toRole].evmAddress;
  const contract = atsService.tokenContract(fromRole);
  let value = BigInt(amount);
  if (!atsService.isMock()) {
    const decimals = Number(await contract.decimals());
    value = BigInt(amount) * 10n ** BigInt(decimals);
  }

  let lastReason;
  for (let i = 0; i < attempts; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await sendTx(() => contract.transfer(to, value), contract.runner);
      store.recordActivity(
        "compliance",
        `Transfer ${fromRole} → ${toRole} (${amount}) ALLOWED`,
        { txHash: r.hash }
      );
      return { allowed: true, txHash: r.hash };
    } catch (err) {
      const decoded = decodeCustomError(err, contract.interface);
      if (decoded) {
        store.recordActivity(
          "compliance",
          `Transfer ${fromRole} → ${toRole} (${amount}) REJECTED: ${decoded}`,
          {}
        );
        return { allowed: false, reason: decoded };
      }
      // Undecoded failure — likely relay lag/flakiness, not a real revert.
      lastReason = decodeReason(err, contract.interface);
      if (i < attempts - 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(RELAY_SETTLE_MS);
      }
    }
  }

  store.recordActivity(
    "compliance",
    `Transfer ${fromRole} → ${toRole} (${amount}) REJECTED: ${lastReason} (after ${attempts} attempts)`,
    {}
  );
  return { allowed: false, reason: lastReason };
}

/**
 * This mostly hits ethers' `eth_estimateGas` path (Hashio rejects the gas
 * estimate before a transaction is even sent), which returns the raw revert
 * bytes in `err.data` but — unlike a `Contract` read call — does NOT run them
 * through the ABI decoder itself. Decode them by hand via the same contract's
 * `interface` so a frozen/non-KYC revert reads as `SenderFrozen(0x07ff...)`
 * instead of ethers' generic "unknown custom error".
 */
/** Returns "Name(args)" only when the revert data decodes to a real custom
 *  error this ABI knows — i.e. a genuine on-chain rejection — else null. */
function decodeCustomError(err, iface) {
  if (!iface || typeof err.data !== "string") return null;
  try {
    const parsed = iface.parseError(err.data);
    return parsed ? `${parsed.name}(${parsed.args.map(String).join(", ")})` : null;
  } catch (_) {
    return null;
  }
}

function decodeReason(err, iface) {
  if (iface && typeof err.data === "string") {
    try {
      const parsed = iface.parseError(err.data);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
    } catch (_) {
      /* not a custom error this ABI knows — fall through */
    }
  }
  return (
    err.reason ||
    err.shortMessage ||
    (err.info && err.info.error && err.info.error.message) ||
    err.message ||
    "reverted"
  );
}

/** Run all four cases end-to-end and return a structured report. */
async function runScenario() {
  const report = [];
  const i1 = config.roles.investor1.evmAddress;
  const i2 = config.roles.investor2.evmAddress;

  // Case 2: unverified receiver is rejected.
  await atsService.setKyc(i2, false);
  await sleep(RELAY_SETTLE_MS);
  report.push({
    case: "Unverified account tries to receive tokens",
    ...(await attemptTransfer("investor1", "investor2", 1)),
    expected: "rejected",
  });

  // Case 1: KYC the receiver, transfer succeeds.
  await atsService.setKyc(i2, true);
  await sleep(RELAY_SETTLE_MS);
  report.push({
    case: "KYC-approved investor receives tokens",
    ...(await attemptTransfer("investor1", "investor2", 1)),
    expected: "allowed",
  });

  // Case 3: freeze investor1, their transfer is rejected.
  await setFrozen("investor1", true);
  await sleep(RELAY_SETTLE_MS);
  report.push({
    case: "Frozen investor tries to transfer",
    ...(await attemptTransfer("investor1", "investor2", 1)),
    expected: "rejected",
  });

  // Case 4: unfreeze, transfer succeeds again.
  await setFrozen("investor1", false);
  await sleep(RELAY_SETTLE_MS);
  report.push({
    case: "Unfrozen investor transfers again",
    ...(await attemptTransfer("investor1", "investor2", 1)),
    expected: "allowed",
  });

  void i1;
  return report;
}

module.exports = { status, setFrozen, attemptTransfer, runScenario };
