"use strict";

/**
 * Tiny JSON-file state store for off-chain demo metadata that the chain does not
 * hold: minted ticket serials → owner, an activity log for the UI, and cached
 * deployment addresses. The chain remains the source of truth for money.
 *
 * Not concurrency-safe — fine for a single-process hackathon backend.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// The project data dir is writable locally; on read-only hosts (Vercel) fall
// back to the OS temp dir. If even that fails, the store stays in-memory.
const LOCAL_FILE = path.resolve(__dirname, "..", "..", "data", "state.json");
const FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "encore-state.json")
  : LOCAL_FILE;

let persistable = true;

const DEFAULT_STATE = {
  tickets: {}, // serial -> { owner, mintTxId, nftSerial, boughtAt, resoldTo, resalePrice }
  investors: {}, // evmAddress -> { role, contributed, tokens, kyc, frozen, delivered }
  activity: [], // { at, kind, message, txId, hashscan }
  settlement: null, // { at, poolAtSettlement, supplySnapshot, allocations: [...] }
};

let state = load();

function load() {
  for (const f of [FILE, LOCAL_FILE]) {
    try {
      return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(f, "utf8")) };
    } catch (_) {
      /* try next */
    }
  }
  return structuredClone(DEFAULT_STATE);
}

function persist() {
  if (!persistable) return;
  try {
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch (_) {
    persistable = false; // read-only FS — keep going in-memory
  }
}

function get() {
  return state;
}

function reset() {
  state = structuredClone(DEFAULT_STATE);
  persist();
  return state;
}

function recordActivity(kind, message, extra = {}) {
  const entry = { at: new Date().toISOString(), kind, message, ...extra };
  state.activity.unshift(entry);
  state.activity = state.activity.slice(0, 200);
  persist();
  return entry;
}

function upsertInvestor(evmAddress, patch) {
  const key = evmAddress.toLowerCase();
  state.investors[key] = { ...(state.investors[key] || {}), ...patch };
  persist();
  return state.investors[key];
}

function recordTicket(serial, data) {
  state.tickets[String(serial)] = { ...(state.tickets[String(serial)] || {}), ...data };
  persist();
  return state.tickets[String(serial)];
}

module.exports = {
  get,
  reset,
  persist,
  recordActivity,
  upsertInvestor,
  recordTicket,
};
