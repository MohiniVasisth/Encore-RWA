"use strict";

/**
 * Request guards.
 *
 * IMPORTANT (access control): the frontend can only ever ask the backend to act
 * *as a named role*. It never sends a key, and it cannot ask the backend to sign
 * an admin action with a non-admin key — each service method hard-codes which
 * role wallet signs which call. The on-chain contract is the real gate
 * (AccessControl / KYC). This middleware only validates the role name and blocks
 * obviously wrong role→action pairs early, with a clear error.
 */

const config = require("../../config");

const KNOWN_ROLES = ["organizer", "investor1", "investor2", "admin", "fan"];

/** 503 until every Hedera resource is configured. */
function requireReady(req, res, next) {
  if (config.ready) return next();
  return res.status(503).json({
    error: "backend_not_ready",
    message:
      "Encore is missing Hedera configuration. See docs/HEDERA_RESOURCES_NEEDED.md.",
    missing: config.missing,
  });
}

/** Validate `:role` (or body.role) against the known set, optionally restrict it. */
function role(allowed = KNOWN_ROLES) {
  return (req, res, next) => {
    const r = req.params.role || req.body.role;
    if (!r) return res.status(400).json({ error: "role_required" });
    if (!KNOWN_ROLES.includes(r)) {
      return res.status(400).json({ error: "unknown_role", role: r });
    }
    if (!allowed.includes(r)) {
      return res
        .status(403)
        .json({ error: "role_not_permitted_for_action", role: r, allowed });
    }
    if (!config.roles[r] || !config.roles[r].evmAddress) {
      return res
        .status(503)
        .json({ error: "role_not_configured", role: r, hint: "fill *_EVM / *_KEY in .env" });
    }
    req.role = r;
    next();
  };
}

/** Wrap an async handler so rejections become a 500 JSON response. */
function wrap(handler) {
  return (req, res) =>
    Promise.resolve(handler(req, res)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[${req.method} ${req.path}]`, err);
      res.status(500).json({
        error: "internal_error",
        message: err.reason || err.shortMessage || err.message,
      });
    });
}

module.exports = { requireReady, role, wrap, KNOWN_ROLES };
