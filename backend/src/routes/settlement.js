"use strict";

const express = require("express");
const { requireReady, role, wrap } = require("../middleware/role");
const escrowService = require("../services/escrowService");

const router = express.Router();
router.use(requireReady);

/** ADMIN: sync any outstanding resale royalties into the pool. */
router.post(
  "/sync-royalties",
  role(["admin"]),
  wrap(async (_req, res) => res.json(await escrowService.syncRoyalties()))
);

/** ADMIN: settle — ATS dividend or escrow-snapshot fallback (per config). */
router.post(
  "/settle",
  role(["admin"]),
  wrap(async (_req, res) => res.json(await escrowService.settle()))
);

/** HOLDER: claim an allocated payout (escrow settlement path). */
router.post(
  "/claim",
  role(["investor1", "investor2", "organizer"]),
  wrap(async (req, res) => res.json(await escrowService.claim(req.role)))
);

router.get(
  "/claimable/:role",
  role(["investor1", "investor2", "organizer"]),
  wrap(async (req, res) =>
    res.json({ role: req.role, claimable: await escrowService.claimableFor(req.role) })
  )
);

module.exports = router;
