"use strict";

const express = require("express");
const { requireReady, wrap, KNOWN_ROLES } = require("../middleware/role");
const nftService = require("../services/nftService");
const escrowService = require("../services/escrowService");

const router = express.Router();
router.use(requireReady);

/**
 * FAN → FAN resale of a ticket NFT. HTS applies the 10% royalty automatically
 * and routes it to the TicketEscrow collector; we then sync it into the pool.
 *
 * body: { from, to, nftSerial, price }
 */
router.post(
  "/",
  wrap(async (req, res) => {
    const { from, to, nftSerial, price } = req.body;
    if (!KNOWN_ROLES.includes(from) || !KNOWN_ROLES.includes(to)) {
      return res.status(400).json({ error: "from_and_to_must_be_known_roles" });
    }
    if (!nftSerial || !price) {
      return res.status(400).json({ error: "nftSerial_and_price_required" });
    }

    const resale = await nftService.resell(from, to, nftSerial, Number(price));
    const sync = await escrowService.syncRoyalties().catch((e) => ({ error: e.message }));

    res.json({ resale, poolSync: sync });
  })
);

module.exports = router;
