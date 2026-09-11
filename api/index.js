"use strict";

/**
 * Vercel serverless entrypoint. `vercel.json` routes `/api/*` here; the static
 * frontend is served directly from the CDN.
 *
 * Configure Hedera env vars in the Vercel project settings (Settings →
 * Environment Variables) — see docs/HEDERA_RESOURCES_NEEDED.md. With none set,
 * the API still responds and the frontend runs in preview mode.
 */

module.exports = require("../backend/app");
