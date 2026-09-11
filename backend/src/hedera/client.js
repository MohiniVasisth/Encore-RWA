"use strict";

/**
 * Hedera connectivity for the backend.
 *
 *  - `sdkClient()`   → a @hashgraph/sdk Client for HTS operations (token create,
 *                      mint, associate, transfer, dividend/airdrop).
 *  - `provider()`    → an ethers JsonRpcProvider pointed at the Hedera JSON-RPC
 *                      relay, for reading/writing the Encore contracts.
 *  - `wallet(role)`  → an ethers Wallet for one of the pre-created role accounts,
 *                      used to sign contract transactions as that role.
 *  - `signerFor(role)` → { accountId, key } for signing SDK transactions as a role.
 */

const { Client, PrivateKey, AccountId } = require("@hashgraph/sdk");
const { ethers } = require("ethers");
const config = require("../../config");

let _sdkClient = null;
let _provider = null;
const _wallets = new Map();

function sdkClient() {
  if (_sdkClient) return _sdkClient;
  if (!config.operator.accountId || !config.operator.privateKey) {
    throw new Error("OPERATOR_ID / OPERATOR_KEY not configured");
  }

  const client =
    config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  const key = parseKey(config.operator.privateKey);
  client.setOperator(AccountId.fromString(config.operator.accountId), key);
  _sdkClient = client;
  return client;
}

/** Accepts DER, raw hex ECDSA, or raw hex ED25519. */
function parseKey(raw) {
  const s = String(raw).trim();
  try {
    if (s.startsWith("0x") || s.length === 64) return PrivateKey.fromStringECDSA(s);
  } catch (_) {
    /* fall through */
  }
  try {
    return PrivateKey.fromStringED25519(s);
  } catch (_) {
    return PrivateKey.fromString(s); // legacy auto-detect
  }
}

function provider() {
  if (_provider) return _provider;
  _provider = new ethers.JsonRpcProvider(config.rpcUrl, {
    name: "hedera-testnet",
    chainId: 296,
  });
  return _provider;
}

/**
 * @param {"organizer"|"investor1"|"investor2"|"admin"|"fan"|"operator"} roleName
 * @returns {import('ethers').NonceManager}
 */
function wallet(roleName) {
  if (_wallets.has(roleName)) return _wallets.get(roleName);

  const key =
    roleName === "operator"
      ? config.operator.evmKey
      : config.roles[roleName] && config.roles[roleName].privateKey;

  if (!key) throw new Error(`No EVM key configured for role "${roleName}"`);

  // Wrapped in a NonceManager: the Hashio relay's eth_getTransactionCount
  // lags behind what it has actually accepted, so re-querying "pending" for
  // every send (the plain Wallet's default) races when two transactions go
  // out for the same role close together — e.g. a demo buy-batch loop, or
  // two requests overlapping. NonceManager tracks the nonce locally instead,
  // incrementing it synchronously per send, which is safe even under
  // concurrent requests since Node never interleaves two sync code paths.
  const raw = new ethers.Wallet(normalizeHexKey(key), provider());
  const w = new ethers.NonceManager(raw);
  _wallets.set(roleName, w);
  return w;
}

function normalizeHexKey(k) {
  const s = String(k).trim();
  return s.startsWith("0x") ? s : `0x${s}`;
}

/**
 * SDK signer material for a role (used when a transaction must be signed by the
 * role account rather than the operator — e.g. a fan associating the ticket NFT).
 */
function signerFor(roleName) {
  const r = config.roles[roleName];
  if (!r || !r.accountId || !r.privateKey) {
    throw new Error(`Role "${roleName}" is not fully configured`);
  }
  return {
    accountId: AccountId.fromString(r.accountId),
    key: parseKey(r.privateKey),
  };
}

function isNonceError(err) {
  const msg = [
    err && err.shortMessage,
    err && err.message,
    err && err.info && err.info.error && err.info.error.message,
    err && err.data && err.data.hederaStatus,
  ]
    .filter(Boolean)
    .join(" ");
  return /nonce/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TimeoutError extends Error {}

/**
 * Send an ethers contract write and wait for its receipt, retrying on a nonce
 * conflict. NonceManager (see `wallet()`) avoids most races, but Hashio can
 * still accept a raw transaction (handing back a hash) and only reject it as
 * WRONG_NONCE once consensus actually gets to it. Two ways that surfaces:
 *
 *   - as a normal rejection from `wait()` — handled below like any other
 *     nonce error: reset the signer's local nonce and resend.
 *   - as a malformed JSON-RPC error mid-poll that ethers can't route into the
 *     promise `wait()` returns at all, leaving it pending forever (it instead
 *     surfaces as an unhandled rejection elsewhere — see server.js's
 *     process-level guard). A plain retry loop would hang on that forever, so
 *     `wait()` races against a timeout here and a timed-out attempt is
 *     treated the same as a nonce error: resync and resend.
 *
 * @param {() => Promise<import('ethers').ContractTransactionResponse>} sendFn
 * @param {import('ethers').ContractRunner} [signer] the runner to reset between
 *        retries — pass the contract's `.runner` (a NonceManager) when it has one.
 */
async function sendTx(sendFn, signer, attempts = 3, waitTimeoutMs = 20000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const tx = await sendFn();
      let timer;
      try {
        return await Promise.race([
          tx.wait(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new TimeoutError(`sendTx: receipt wait timed out after ${waitTimeoutMs}ms`)),
              waitTimeoutMs
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof TimeoutError || isNonceError(err);
      if (!retryable || i === attempts - 1) throw err;
      if (signer && typeof signer.reset === "function") signer.reset();
      // eslint-disable-next-line no-await-in-loop
      await sleep(500 * (i + 1));
    }
  }
  throw lastErr;
}

module.exports = { sdkClient, provider, wallet, signerFor, parseKey, sendTx };
