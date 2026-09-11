"use strict";

/**
 * Encore Express app (no listener).
 *
 * Serves the single-page frontend and a small REST API that orchestrates the
 * FundingVault + TicketEscrow contracts and the HTS / ATS tokens. It signs
 * transactions for the pre-created testnet role accounts so the demo needs no
 * browser wallet.
 *
 * `server.js` wraps this with `.listen()` for local use; `api/index.js` exports
 * it as a Vercel serverless function.
 */

const path = require("path");
const express = require("express");
const cors = require("cors");

const api = require("./src/routes");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", api);

// Static single-page frontend (used locally; on Vercel the static files are
// served directly by the CDN and only /api/* reaches this app).
const FRONTEND = path.resolve(__dirname, "..", "frontend");
app.use(express.static(FRONTEND));
app.get("*", (_req, res) => res.sendFile(path.join(FRONTEND, "index.html")));

module.exports = app;
