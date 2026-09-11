"use strict";

const fs = require("fs");
const path = require("path");
require("../lib/env");

const event = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "..", "backend", "data", "event.json"), "utf8")
);

const decimals = Number(process.env.STABLECOIN_DECIMALS || event.stablecoinDecimals || 6);
const unit = (n) => BigInt(Math.round(Number(n) * 10 ** decimals));

function need(key) {
  const v = process.env[key];
  if (!v || v.includes("xxxxxx") || v === "0x...") {
    throw new Error(`Missing .env: ${key}`);
  }
  return v;
}

module.exports = { event, decimals, unit, need };
