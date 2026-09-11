"use strict";

/**
 * Small helper to load `.env` and write resolved values back into it, so deploy
 * scripts can persist the ids/addresses they create.
 */

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.resolve(__dirname, "..", "..", ".env");

require("dotenv").config({ path: ENV_PATH });

/** Set (or append) KEY=value pairs in .env, preserving comments and order. */
function writeEnv(updates) {
  let lines = [];
  if (fs.existsSync(ENV_PATH)) {
    lines = fs.readFileSync(ENV_PATH, "utf8").split("\n");
  }
  const seen = new Set();

  lines = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      seen.add(m[1]);
      const inlineComment = line.includes("#") ? line.slice(line.indexOf("#")) : "";
      return `${m[1]}=${updates[m[1]]}${inlineComment ? "  " + inlineComment : ""}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) lines.push(`${k}=${v}`);
    process.env[k] = String(v);
  }

  fs.writeFileSync(ENV_PATH, lines.join("\n"));
  console.log(`  ✎ wrote ${Object.keys(updates).join(", ")} → .env`);
}

function requireEnv(keys) {
  const missing = keys.filter((k) => {
    const v = process.env[k];
    return !v || v.includes("xxxxxx") || v === "0x...";
  });
  if (missing.length) {
    throw new Error(`Missing required .env values: ${missing.join(", ")}`);
  }
}

module.exports = { ENV_PATH, writeEnv, requireEnv };
