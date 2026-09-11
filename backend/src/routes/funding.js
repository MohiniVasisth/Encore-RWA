"use strict";

const express = require("express");
const { requireReady, role, wrap } = require("../middleware/role");
const fundingService = require("../services/fundingService");

const router = express.Router();
router.use(requireReady);

router.get("/", wrap(async (_req, res) => res.json(await fundingService.summary())));

/** ADMIN: approve / revoke investor KYC (vault mirror + ATS). */
router.post(
  "/kyc",
  role(["admin"]),
  wrap(async (req, res) => {
    const { investor, approved = true } = req.body;
    res.json(await fundingService.setKyc(investor, approved));
  })
);

/** INVESTOR: buy revenue-right tokens in the all-or-nothing raise. */
router.post(
  "/invest",
  role(["investor1", "investor2"]),
  wrap(async (req, res) => {
    const tokens = Number(req.body.tokens);
    if (!Number.isInteger(tokens) || tokens <= 0) {
      return res.status(400).json({ error: "tokens_must_be_positive_integer" });
    }
    res.json(await fundingService.invest(req.role, tokens));
  })
);

/** Anyone: finalize the raise (Funded / Failed). */
router.post("/finalize", wrap(async (_req, res) => res.json(await fundingService.finalize())));

/** ORGANIZER: withdraw the raise once Funded. */
router.post(
  "/withdraw",
  role(["organizer"]),
  wrap(async (_req, res) => res.json(await fundingService.withdrawOrganizerFunds()))
);

/** INVESTOR: refund after a Failed raise. */
router.post(
  "/refund",
  role(["investor1", "investor2"]),
  wrap(async (req, res) => res.json(await fundingService.refund(req.role)))
);

/** ADMIN: deliver revenue-right tokens to an investor via ATS. */
router.post(
  "/deliver",
  role(["admin"]),
  wrap(async (req, res) => {
    const { investor } = req.body;
    res.json(await fundingService.deliverTokens(investor));
  })
);

module.exports = router;
