"use strict";

const express = require("express");
const config = require("../../config");
const { KNOWN_ROLES } = require("../middleware/role");

const router = express.Router();

/** Backend + config status. Always available (used by the UI to show a banner). */
router.get("/status", (_req, res) => {
  res.json({
    ready: config.ready,
    missing: config.missing,
    network: config.network,
    atsMode: config.ats.mode,
    settlementPath: config.ats.settlementPath,
    roles: Object.fromEntries(
      KNOWN_ROLES.map((r) => [
        r,
        {
          accountId: config.roles[r].accountId,
          evmAddress: config.roles[r].evmAddress,
          configured: Boolean(config.roles[r].evmAddress && config.roles[r].privateKey),
        },
      ])
    ),
    contracts: config.contracts,
    tokens: {
      stablecoin: config.stablecoin.tokenId,
      revenueRight: config.revenueRight.tokenId,
      ticketNft: config.ticketNft.tokenId,
    },
  });
});

router.use("/offering", require("./offering"));
router.use("/funding", require("./funding"));
router.use("/tickets", require("./tickets"));
router.use("/resale", require("./resale"));
router.use("/compliance", require("./compliance"));
router.use("/settlement", require("./settlement"));
router.use("/health", require("./health"));

module.exports = router;
