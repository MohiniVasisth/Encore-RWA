"use strict";

const express = require("express");
const { requireReady, role, wrap } = require("../middleware/role");
const escrowService = require("../services/escrowService");
const store = require("../state/store");

const router = express.Router();
router.use(requireReady);

router.get("/", wrap(async (_req, res) => {
  res.json({
    financials: await escrowService.financials(),
    minted: store.get().tickets,
  });
}));

/** ADMIN: open / close primary sales. */
router.post(
  "/sales",
  role(["admin"]),
  wrap(async (req, res) => {
    res.json(await escrowService.setSalesOpen(Boolean(req.body.open)));
  })
);

/** FAN: buy one primary ticket (split on-chain + NFT mint). */
router.post(
  "/buy",
  role(["fan", "investor1", "investor2", "organizer"]),
  wrap(async (req, res) => res.json(await escrowService.buyTicket(req.role)))
);

/** FAN: buy a batch of primary tickets (demo convenience). */
router.post(
  "/buy-batch",
  role(["fan", "investor1", "investor2", "organizer"]),
  wrap(async (req, res) => {
    const count = Math.min(Number(req.body.count) || 1, 25);
    res.json(await escrowService.buyBatch(req.role, count));
  })
);

module.exports = router;
