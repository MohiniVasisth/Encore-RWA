"use strict";

const express = require("express");
const { requireReady, role, wrap } = require("../middleware/role");
const complianceService = require("../services/complianceService");
const atsService = require("../services/atsService");

const router = express.Router();
router.use(requireReady);

/** ATS integration status: mode + whether the admin holds the required roles. */
router.get(
  "/ats",
  wrap(async (_req, res) => res.json(await atsService.roleReport()))
);

router.get(
  "/",
  wrap(async (_req, res) => {
    const roles = ["investor1", "investor2", "organizer"];
    const statuses = {};
    for (const r of roles) {
      // eslint-disable-next-line no-await-in-loop
      statuses[r] = await complianceService.status(r).catch((e) => ({ error: e.message }));
    }
    res.json(statuses);
  })
);

/** ADMIN: freeze / unfreeze a holder. body: { role:"admin", target, frozen } */
router.post(
  "/freeze",
  role(["admin"]),
  wrap(async (req, res) => {
    const { target, frozen = true } = req.body;
    res.json(await complianceService.setFrozen(target, frozen));
  })
);

/** Attempt a revenue-right transfer and report allow/reject. */
router.post(
  "/attempt-transfer",
  wrap(async (req, res) => {
    const { from, to, amount = 1 } = req.body;
    res.json(await complianceService.attemptTransfer(from, to, Number(amount)));
  })
);

/** Run the full four-case compliance scenario. */
router.post(
  "/scenario",
  wrap(async (_req, res) => res.json(await complianceService.runScenario()))
);

module.exports = router;
