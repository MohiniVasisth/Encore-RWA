"use strict";

/** Local entrypoint — starts the Encore Express app on a port. */

const app = require("./app");
const config = require("./config");

// Safety net: Hedera's JSON-RPC relay occasionally returns a malformed error
// shape while polling for a transaction receipt (e.g. a WRONG_NONCE rejection
// surfaced mid-poll instead of as a normal revert). ethers can't route that
// into the promise chain the caller is awaiting, so it surfaces as an
// unhandled rejection — which Node treats as fatal by default and kills the
// whole process. One flaky relay response shouldn't take down the demo
// server; log it and keep running instead. The one in-flight request that
// triggered it may hang/time out client-side, which is an acceptable
// trade-off against the whole backend dying.
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledRejection] (backend kept running)", reason);
});
process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[uncaughtException] (backend kept running)", err);
});

app.listen(config.port, () => {
  /* eslint-disable no-console */
  console.log(`\n  Encore  →  http://localhost:${config.port}`);
  console.log(`  network: ${config.network}   ATS mode: ${config.ats.mode}`);
  if (!config.ready) {
    console.log(`\n  ⚠  Not fully configured. Missing: ${config.missing.join(", ")}`);
    console.log(`     Chain routes return 503 until then. See docs/HEDERA_RESOURCES_NEEDED.md\n`);
  } else {
    console.log(`  ✓ configured — all routes live\n`);
  }
});
 