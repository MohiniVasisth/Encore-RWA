"use strict";

const express = require("express");
const { requireReady, wrap } = require("../middleware/role");
const healthService = require("../services/healthService");
const store = require("../state/store");

const router = express.Router();

/** Live event financial-health snapshot for the dashboard. */
router.get("/", requireReady, wrap(async (_req, res) => res.json(await healthService.snapshot())));

/** Activity log only (cheap polling target). */
router.get("/activity", wrap(async (_req, res) => res.json(store.get().activity)));

/** Reset off-chain demo state (does not touch the chain). */
router.post("/reset", wrap(async (_req, res) => res.json(store.reset())));

module.exports = router;
